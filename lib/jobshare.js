// Copyright (c) 2013, Joyent, Inc. All rights reserved.

var assert = require('assert-plus');
var path = require('path');
var fs = require('fs');

var jsprim = require('jsprim');
var hogan = require('hogan.js');
var showdown = require('showdown');
var vasync = require('vasync');
var verror = require('verror');

var VError = verror.VError;

var jAssetsDir = path.join(__dirname, '../share');

module.exports = jobshare;

/*
 * Generates a self-contained HTML page describing the job.
 */
function jobshare(args, cb)
{
    assert.string(args.jobdir, 'jobdir');
    assert.optionalString(args.readme, 'readme');
    assert.object(args.log, 'log');
    assert.object(args.client, 'client');
    assert.number(args.maxObjects, 'opts.maxObjects');
    assert.number(args.maxBytesPerObject, 'opts.maxBytesPerObject');
    assert.number(args.maxErrors, 'opts.maxErrors');

    var j = {
        /* input parameters */
        'j_jobdir': args.jobdir,                /* path to job directory */
        'j_readme': args.readme,                /* readme file */
        'j_log': args.log,                      /* bunyan logger */
        'j_manta': args.client,                 /* node-manta client */
        'j_maxobjects': args.maxObjects,        /* max nr of objs to fetch */
        'j_maxbytes': args.maxBytesPerObject,   /* max bytes per object */
        'j_maxerrors': args.maxErrors,          /* max errors to fetch */

        /* "jobex" internal state */
        'j_error': null,                        /* current error */
        'j_assets': [],                         /* names of available assets */
        'j_data': {},                           /* file and object contents */
        'j_job': null,                          /* job details record */
        'j_errors': [],                         /* raw JSON error objects */
        'j_inout': {
            'in': [],                           /* list of input obj names */
            'out': []                           /* list of output obj names */
        },
        'j_rendered': null,                     /* rendered HTML output */

        /* debug state */
        'j_pipeline': null,                     /* pipeline for this op */
        'j_barrier': null                       /* barrier for current stage */
    };

    j.j_pipeline = vasync.pipeline({
        'arg': j,
        'funcs': [
            jStageLoad,
            jStageFetchJob,
            jStageFetchJobDetails,
            jStageRender
        ]
    }, function (err) {
        if (err)
            cb(err);
        else
            cb(null, { 'html': j.j_rendered });
    });
}

function jStageLoad(j, cb)
{
    j.j_barrier = vasync.barrier();
    if (j.j_readme !== undefined)
        jReadFile(j, 'readme', j.j_barrier, j.j_readme);

    j.j_barrier.start('readdir');
    fs.readdir(jAssetsDir, function (err, files) {
        if (err) {
            if (!j.j_error)
                j.j_error = new VError(err, 'failed to list assets');
            return;
        }

        files.forEach(function (f) {
            j.j_assets.push(f);
            jReadFile(j, f, j.j_barrier, path.join(jAssetsDir, f));
        });

        j.j_barrier.done('readdir');
    });

    j.j_barrier.on('drain', function () {
        j.j_barrier = null;
        cb(j.j_error);
    });
}

function jReadFile(j, label, barrier, filepath)
{
    barrier.start(label);
    j.j_log.trace('loading file', filepath);
    fs.readFile(filepath, function (err, contents) {
        var data;

        if (err) {
            if (!j.j_error)
                j.j_error = err;
            j.j_log.warn(err, 'failed to load file');
        } else {
            if (jsprim.endsWith(filepath, '.png'))
                data = contents.toString('base64');
            else
                data = contents.toString('utf8');
            j.j_data[label] = data;
            j.j_log.debug('loaded file', filepath);
        }

        barrier.done(label);
    });
}

function jStageFetchJob(j, cb)
{
    var jobobj;

    jobobj = path.join(j.j_jobdir, 'job.json');
    j.j_manta.get(jobobj, function (err, stream) {
        if (err) {
            cb(new VError(err, 'failed to read job'));
            return;
        }

        streamParseJson(stream, function (err2, job) {
            if (err2) {
                cb(new VError(
                    err2, 'failed to parse job'));
                return;
            }

            j.j_job = job;

            if (!job['timeArchiveDone']) {
                cb(new VError('cannot create jobex ' +
                    'until job has completed and been ' +
                    'archived'));
                return;
            }

            if (job['cancelled']) {
                cb(new VError('cannot create jobex ' +
                    'for cancelled job'));
                return;
            }

            cb();
        });
    });
}

function jStageFetchJobDetails(j, cb)
{
    var barrier;

    barrier = j.j_barrier = vasync.barrier();
    jFetchObjectList(j, barrier, path.join(j.j_jobdir, 'in.txt'));
    jFetchObjectList(j, barrier, path.join(j.j_jobdir, 'out.txt'));
    jFetchObject(j, barrier, path.join(j.j_jobdir, 'err.txt'), function (data) {
        data.split(/\n/).slice(0, j.j_maxerrors).forEach(function (l, i) {
            if (l.length === 0)
                return;

            var error;
            try {
                error = JSON.parse(l);
            } catch (ex) {
                j.j_log.warn('failed to parse error %d', i);
                return;
            }

            j.j_errors.push(error);
            if (error['stderr'])
                jFetchObject(j, barrier, error['stderr']);
        });
    });

    barrier.on('drain', function () {
        j.j_barrier = null;
        cb(j.j_error);
    });
}

function jFetchObjectList(j, barrier, objname)
{
    jFetchObject(j, barrier, objname, function (data) {
        data.split(/\n/).slice(0, j.j_maxobjects).forEach(function (l, i) {
            if (l.length === 0)
                return;

            var base = path.basename(objname);
            base = base.substr(0, base.indexOf('.'));
            var key = base + j.j_inout[base].length;
            j.j_inout[base].push({
                'key': key,
                'name': l
            });
            jFetchObject(j, barrier, l, null, key);
        });
    });
}

function jFetchObject(j, barrier, objname, cb, key)
{
    var headers, options;

    headers = { 'range': 'bytes=0-' + j.j_maxbytes };
    options = { 'headers': headers };
    barrier.start(key || objname);
    j.j_manta.get(objname, options, function (err, stream) {
        if (err) {
            if (!j.j_error)
                j.j_error = new VError(err, 'fetch "%s"', objname);
            return;
        }

        streamBuffer(stream, function (data) {
            j.j_data[objname] = data;
            if (cb)
                cb(data);
            barrier.done(key || objname);
        });
    });
}

function jStageRender(j, cb)
{
    var params = {};
    var converter, compiled, k;

    for (k in j.j_inout) {
        j.j_inout[k].forEach(function (entry) {
            entry['contents'] = j.j_data[entry['name']];
        });
    }

    params['manta_url'] = process.env['MANTA_URL'];

    converter = new showdown.converter();
    if (j.j_data.hasOwnProperty('readme'))
        params['readme'] = converter.makeHtml(j.j_data['readme']);

    params['jobid'] = j.j_job['id'];
    params['name'] = j.j_job['name'];
    params['state'] = j.j_job['state'];
    params['cancelled'] = j.j_job['cancelled'];
    params['inputDone'] = j.j_job['inputDone'];
    params['timeCreated'] = j.j_job['timeCreated'];
    params['timeDone'] = j.j_job['timeDone'];
    params['body_summary'] =
        JSON.stringify(j.j_job['phases'], null, 8);

    params['nerrors'] = j.j_job['stats']['errors'];
    params['noutputs'] = j.j_job['stats']['outputs'];
    params['nretries'] = j.j_job['stats']['retries'];
    params['ntasks'] = j.j_job['stats']['tasks'];
    params['ntasksDone'] = j.j_job['stats']['tasksDone'];

    params['inputs'] = j.j_inout['in'];
    params['outputs'] = j.j_inout['out'];

    j.j_errors.forEach(function (e) {
        if (e['stderr'])
            e['stderr_contents'] = j.j_data[e['stderr']];
    });
    params['errors'] = j.j_errors.sort(function (a, b) {
        if (a['what'] < b['what'])
            return (-1);
        else if (a['what'] > b['what'])
            return (1);
        return (0);
    });

    j.j_assets.forEach(function (a) {
        var label = a.replace(/\./g, '');
        params['asset_content_' + label] = j.j_data[a];
    });

    params['warnings'] = [];
    if (params['cancelled'])
        params['warnings'].push({ 'msg': 'job was cancelled' });
    if (!params['inputDone'])
        params['warnings'].push(
            { 'msg': 'job is still awaiting user input' });
    else if (params['state'] != 'done')
        params['warnings'].push({ 'msg': 'job is still running' });

    compiled = hogan.compile(j.j_data['jobtemplate.htm']);
    j.j_rendered = compiled.render(params);
    cb();
}

function streamBuffer(stream, cb)
{
    var buffer = '';
    stream.on('data',
        function (chunk) { buffer += chunk.toString('utf8'); });
    stream.on('end', function () { cb(buffer); });
}

function streamParseJson(stream, cb)
{
    streamBuffer(stream, function (data) {
        var obj;

        try {
            obj = JSON.parse(data);
        } catch (ex) {
            cb(ex);
            return;
        }

        cb(null, obj);
    });
}

/*
 * Copyright 2018 Joyent, Inc.
 * Copyright 2022 MNX Cloud, Inc.
 */

var assert = require('assert-plus');
var execFileSync = require('child_process').execFileSync;
var format = require('util').format;
var os = require('os');
var path = require('path');

var forkExecWait = require('forkexec').forkExecWait;
var VError = require('verror');

var BINDIR = path.resolve(__dirname, '../../bin');
var MLS = path.resolve(BINDIR, 'mls');
var MMPU = path.resolve(BINDIR, 'mmpu');
var MINFO = path.resolve(BINDIR, 'minfo');

/*
 * Call `mls` on the given path and return a JSON array of objects for each
 * object/directory found, or an error
 */
function mls(p, cb) {
    assert.string(p, 'p');
    assert.func(cb, 'cb');

    forkExecWait({
        argv: [MLS, '-j', p]
    }, function (err, info) {
        if (err) {
            cb(err);
            return;
        }

        var out = info.stdout.trim();
        if (out.length === 0) {
            cb(null, []);
            return;
        }

        var files;
        try {
            files = out.split('\n').map(function (j) {
                return (JSON.parse(j));
            });
        } catch (e) {
            cb(e);
            return;
        }

        cb(null, files);
    });
}


/*
 * *Synchronously* determine if this Manta supports MPU (multipart upload).
 * Doing so synchronously allows one to use the value for tap test() options.
 *
 * Limitation: This (a) creates a multipart upload object and (b) uses string
 * comparison of an error message to determine support. It would be nicer to
 * have a lighter-weight and crisper mechanism to check for support. Would
 * the presence of `uploads/` in `mls` output suffice?
 *
 * This returns `true` or `false`. If something unexpected happens, it throws
 * an error.
 */
function isMpuEnabledSync(log) {
    assert.string(process.env.MANTA_USER, 'process.env.MANTA_USER');
    assert.object(log, 'log');

    var NOT_SUPPORTED_MSG = 'mmpu create: error: multipart upload is ' +
        'not supported for this Manta deployment';

    var checkPath = format('/%s/stor/node-manta-is-mmpu-enabled-%s',
        process.env.MANTA_USER, os.hostname());
    var uploadUuid;
    try {
        uploadUuid = execFileSync(MMPU, ['create', checkPath], {
            stdio: 'pipe', // to not emit stderr to parent's stderr
            encoding: 'utf8'
        }).trim();
    } catch (createErr) {
        if (createErr.stderr.trim() === NOT_SUPPORTED_MSG) {
            return (false);
        } else {
            throw new VError(createErr,
                'could not determine whether MPU is supported by this Manta');
        }
    }
    log.trace({uploadUuid: uploadUuid, checkPath: checkPath},
        'created test MPU upload');

    // If we get here, then MPU is supported. Before returning let's abort
    // the upload we started.
    try {
        execFileSync(MMPU, ['abort', uploadUuid], {encoding: 'utf8'});
    } catch (abortErr) {
        log.trace({err: abortErr, uploadUuid: uploadUuid},
            'silently ignoring attempt to abort test MPU upload');
    }

    return (true);
}

function mantaVersion(log) {
    assert.string(process.env.MANTA_USER, 'process.env.MANTA_USER');
    assert.object(log, 'log');

    var checkPath = format('/%s/stor', process.env.MANTA_USER);
    var info = JSON.parse(execFileSync(MINFO, ['-j', checkPath], {
        stdio: 'pipe', // to not emit stderr to parent's stderr
        encoding: 'utf8'
    }).trim());
    log.trace(JSON.stringify(info));
    var server = info.server;
    if (server === 'Manta') {
        return ('1');
    } else {
        var s = server.split('/');
        return (s[1]);
    }
}


module.exports = {
    isMpuEnabledSync: isMpuEnabledSync,
    mantaVersion: mantaVersion,
    mls: mls
};

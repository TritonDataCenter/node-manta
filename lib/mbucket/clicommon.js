/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * Shared functionality for the `mbucket` commands.
 */

var assert = require('assert-plus');
var cmdln = require('cmdln');
var format = require('util').format;
var fs = require('fs');
var once = require('once');
var path = require('path');
var strsplit = require('strsplit');
var vasync = require('vasync');
var VError = require('verror');

var MantaUri = require('../mantauri').MantaUri;



/*
 * Stream one Manta bucket object to a stdout.
 */
function streamBucketObjectToStdout(client, log, opts, src, cb) {
    assert.equal(src.constructor.name, 'MantaUri');
    assert.string(src.object, 'src.object');

    // XXX what 'opts' are supported here?

    var onceCb = once(cb);

    client.getBucketObject(src.bucket, src.object, opts,
                           function (err, stream, _res) {
        if (err) {
            onceCb(err);
            return;
        }

        // `getBucketObject` resumes `res` (aka the stream) in the
        // nextTick, so we need to setup event handlers right away.
        stream.once('error', function (streamErr) {
            onceCb(new VError(streamErr, 'could not download "%s"', src));
        });

        process.stdout.on('error', function onStdoutError(stdoutErr) {
            // Ignore EPIPE. It is fine if our output is cut off (e.g. via `|
            // head`).
            if (stdoutErr.code !== 'EPIPE') {
                onceCb(stdoutErr);
            }
        });

        // Dev Notes:
        // - simulate a `ChecksumError` in `MantaClient.get` via:
        //      _res.headers['content-md5'] += 'cosmicray';
        // - simulate a `DownloadError` in `MantaClient.get` via:
        //      _res.headers['content-length'] =
        //          String(Number(_res.headers['content-length']) - 1);

        stream.once('end', function onStreamEnd() {
            log.trace({src: src}, 'src stream end');
            onceCb();
        });

        stream.pipe(process.stdout);
    });
}


/**
 * Resolve "~/..." and "~" to an absolute path.
 *
 * Limitations:
 * - This does not handle "~user/...".
 * - This depends on the HOME envvar being defined (%USERPROFILE% on Windows).
 */
function tildeSync(s) {
    var envvar = (process.platform === 'win32' ? 'USERPROFILE' : 'HOME');
    var home = process.env[envvar];
    if (!home) {
        throw new Error(format('cannot determine home dir: %s environment ' +
            'variable is not defined', envvar));
    }

    if (s === '~') {
        return home;
    } else if (s.slice(0, 2) === '~/' ||
        (process.platform === 'win32' && s.slice(0, 2) === '~'+path.sep))
    {
        return path.resolve(home, s.slice(2));
    } else {
        return s;
    }
}


/*
 * Load and validate metadata from these options:
 *      ---metadata DATA
 * where DATA is one of:
 * - A JSON object, if the first char is a `{`
 * - A reference to a local file from which to parse metadata
 *   when of the form `@FILE`, e.g. `--metadata @./my-metadata.txt`.
 *   The file must be a JSON object, or one `KEY=VALUE` metadatum per
 *   line.
 * - A comma-separated string of `KEY=VALUE` pairs, e.g. `foo=bar,baz=blah`.
 *
 * Manta metadata is a key/value mapping where:
 * - keys are lowercase (to be case-insensitive)
 * - values must be strings
 *
 * This is an adapted version of `metadataFromOpts` from node-triton.git.
 */
function metadataFromOpts(opts, log, cb) {
    assert.arrayOfObject(opts._order, 'opts._order');
    assert.object(log, 'log');
    assert.func(cb, 'cb');

    var metadata = {};

    vasync.forEachPipeline({
        inputs: opts._order,
        func: function metadataFromOpt(o, next) {
            log.trace({opt: o}, 'metadataFromOpt');
            if (o.key === 'metadata') {
                if (!o.value) {
                    next(new cmdln.UsageError('empty metadata option value'));
                    return;
                } else if (o.value[0] === '{') {
                    _addMetadataFromJsonStr(metadata, o.value, null, next);
                } else if (o.value[0] === '@') {
                    _addMetadataFromFile(metadata, o.value.slice(1), next);
                } else {
                    _addMetadataFromCommaSepKvStr(
                        metadata, o.value, null, next);
                }
            } else {
                next();
            }
        }
    }, function (err) {
        if (err) {
            cb(err);
        } else if (Object.keys(metadata).length) {
            cb(null, metadata);
        } else {
            cb();
        }
    });
}

var allowedTypes = ['string'];

function _addMetadatum(metadata, key, value, from, cb) {
    assert.object(metadata, 'metadata');
    assert.string(key, 'key');
    assert.optionalString(from, 'from');
    assert.func(cb, 'cb');

    var normKey = key.toLowerCase();

    // Manta object metadata values must be strings.
    if (typeof (value) !== 'string') {
        cb(new cmdln.UsageError(format(
            'invalid metadata value type%s: must be a string: %s=%j (%s)',
            from ? ' (from ' + from + ')' : '',
            key,
            value,
            typeof(value))));
        return;
    }

    if (metadata.hasOwnProperty(normKey)) {
        var valueStr = value.toString();
        console.error(
            'warning: metadata "%s=%s"%s replaces earlier value for "%s"',
            normKey,
            (valueStr.length > 10
                ? valueStr.slice(0, 7) + '...' : valueStr),
            (from ? ' (from ' + from + ')' : ''),
            normKey);
    }

    metadata[normKey] = value;
    cb();
}

function _addMetadataFromObj(metadata, obj, from, cb) {
    assert.object(metadata, 'metadata');
    assert.object(obj, 'obj');
    assert.optionalString(from, 'from');
    assert.func(cb, 'cb');

    vasync.forEachPipeline({
        inputs: Object.keys(obj),
        func: function _oneField(key, next) {
            _addMetadatum(metadata, key, obj[key], from, next);
        }
    }, cb);
}

function _addMetadataFromJsonStr(metadata, s, from, cb) {
    try {
        var obj = JSON.parse(s);
    } catch (parseErr) {
        cb(new VError(parseErr, 'metadata%s is not valid JSON',
            from ? ' (from ' + from + ')' : ''));
        return;
    }
    _addMetadataFromObj(metadata, obj, from, cb);
}

function _addMetadataFromFile(metadata, file, cb) {
    var metaPath = tildeSync(file);
    fs.stat(metaPath, function (statErr, stats) {
        if (statErr || !stats.isFile()) {
            cb(new VError('"%s" is not an existing file', file));
            return;
        }
        fs.readFile(metaPath, 'utf8', function (readErr, data) {
            if (readErr) {
                cb(readErr);
                return;
            }
            /*
             * The file is either a JSON object (first non-space
             * char is '{'), or newline-separated key=value
             * pairs.
             */
            var dataTrim = data.trim();
            if (dataTrim.length && dataTrim[0] === '{') {
                _addMetadataFromJsonStr(metadata, dataTrim, file, cb);
            } else {
                var lines = dataTrim.split(/\r?\n/g).filter(
                    function (line) { return line.trim(); });
                vasync.forEachPipeline({
                    inputs: lines,
                    func: function oneLine(line, next) {
                        _addMetadataFromCommaSepKvStr(
                            metadata, line, file, next);
                    }
                }, cb);
            }
        });
    });
}

function _addMetadataFromCommaSepKvStr(metadata, s, from, cb) {
    assert.object(metadata, 'metadata');
    assert.string(s, 's');
    assert.optionalString(from, 'from');
    assert.func(cb, 'cb');

    var pairs = s.trim().split(/\s*,\s*/g);
    vasync.forEachPipeline({
        inputs: pairs,
        func: function addOnePair(pair, next) {
            var parts = strsplit(pair, '=', 2);
            if (parts.length !== 2) {
                next(new cmdln.UsageError(format(
                    'invalid KEY=VALUE metadata argument: %s', s)));
                return;
            }
            _addMetadatum(metadata, parts[0].trim(), parts[1].trim(),
                from, next);
        }
    }, function finish(err) {
        cb(err);
    });
}


module.exports = {
    streamBucketObjectToStdout: streamBucketObjectToStdout,
    metadataFromOpts: metadataFromOpts
};

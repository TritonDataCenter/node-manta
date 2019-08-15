/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * Shared functionality for the `mbucket` commands.
 */

var assert = require('assert-plus');
var once = require('once');
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



module.exports = {
    streamBucketObjectToStdout: streamBucketObjectToStdout
};

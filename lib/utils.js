// Copyright 2019 Joyent, Inc.

var assert = require('assert-plus');
var readline = require('readline');

module.exports = {
    normalizeHeaders: normalizeHeaders,
    promptConfirm: promptConfirm,
    prettyBytes: prettyBytes
};

function promptConfirm(msg, cb) {
    assert.string(msg, 'msg');
    assert.func(cb, 'cb');
    assert(process.stdin.isTTY, 'stdin must be a TTY');

    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question(msg, function (ans) {
        rl.close();
        cb(ans === 'y' || ans === 'Y');
    });
}

function prettyBytes(bytes, scale) {
    scale = scale || 1024;

    assert.number(bytes);
    assert(bytes >= 0, 'bytes >= 0');
    assert.number(scale, 'scale');
    assert(scale >= 1, 'scale >= 1');

    var suffixes = [
        '', // empty for bytes
        'K',
        'M',
        'G',
        'T'
    ];
    var suffix, num, s;

    for (var i = suffixes.length; i >= 0; i--) {
        suffix = suffixes[i];
        num = Math.pow(1024, i);
        if (bytes >= num) {
            // convert bytes to human readable string
            s = (bytes / num).toFixed(2);

            /*
             * It can be the case that 's' has 0's that can be chopped off
             * like "5.10" or "2.00".  To handle this, we parse the number as a
             * float and then call toString() on the result.
             */
            s = parseFloat(s).toString();
            return (s + suffix);
        }
    }

    assert.equal(bytes, 0, 'bytes == 0');
    return ('0');
}

/**
 * HTTP Header names are case insensitive, so we ensure
 * that those passed to us are in lower case.
 */
function normalizeHeaders(headers) {
    var normalized = {};

    if (headers) {
        Object.keys(headers).forEach(function (k) {
            normalized[k.toLowerCase()] = headers[k];
        });
    }

    return (normalized);
}

// Copyright (c) 2018, Joyent, Inc. All rights reserved.

var assert = require('assert-plus');
var readline = require('readline');

var manta = require('./client');

module.exports = {
    assertPath: assertPath,
    escapePath: escapePath,
    folderType: folderType,
    promptConfirm: promptConfirm,
    prettyBytes: prettyBytes
};

function escapePath(s) {
    assert.string(s, 'escapePath');
    /*JSSTYLED*/
    return (JSON.stringify(s).replace(/^"|"$/g, '').replace(/\\"/g, '"'));
}

function assertPath(p, noThrow) {
    try {
        manta.path(p, null);
    } catch (e) {
        if (noThrow)
          return (e);

        throw e;
    }
    return (null);
}

function folderType(fType) {
    assert.string(fType, 'folderType');
    if ((fType === 'directory') || (fType === 'bucket'))
        return (fType);
    return (null);
}

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

// Copyright (c) 2018, Joyent, Inc. All rights reserved.

var assert = require('assert-plus');
var readline = require('readline');

var manta = require('./client');

module.exports = {
    assertPath: assertPath,
    escapePath: escapePath,
    promptConfirm: promptConfirm
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

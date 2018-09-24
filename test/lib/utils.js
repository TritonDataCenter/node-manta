/*
 * Copyright 2018 Joyent, Inc.
 */

var assert = require('assert-plus');
var path = require('path');

var forkExecWait = require('forkexec').forkExecWait;

var BINDIR = path.resolve(__dirname, '../../bin');
var MLS = path.resolve(BINDIR, 'mls');

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

module.exports.mls = mls;

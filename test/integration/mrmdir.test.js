/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * Test the "mrmdir" command.
 */

var assert = require('assert-plus');
var forkExecWait = require('forkexec').forkExecWait;
var libuuid = require('uuid');
var path = require('path');
var test = require('tap').test;
var vasync = require('vasync');
var sprintf = require('extsprintf').sprintf;

var utils = require('../lib/utils');

var BINDIR = path.resolve(__dirname, '../../bin');
var MMKDIR = path.resolve(BINDIR, 'mmkdir');
var MRM = path.resolve(BINDIR, 'mrm');
var MRMDIR = path.resolve(BINDIR, 'mrmdir');

var TESTDIR = sprintf('/%s/stor/node-manta-test-mrmdir-%s',
    process.env.MANTA_USER || 'admin',
    libuuid.v4().split('-')[0]);

var NUMSUBDIRS = 5;
var SUBDIRS = [];
for (var i = 0; i < NUMSUBDIRS; i++) {
    SUBDIRS.push(path.join(TESTDIR, i.toString()));
}


// ---- tests

test('setup: create test tree at ' + TESTDIR, function (t) {
    vasync.pipeline({funcs: [
        function (_, cb) {
            // create the test directory
            forkExecWait({
                argv: [MMKDIR, TESTDIR]
            }, cb);
        },
        function (_, cb) {
            // create sub directories
            forkExecWait({
                argv: [MMKDIR].concat(SUBDIRS)
            }, cb);
        }
    ]}, function (err) {
        t.ifError(err, err);
        t.end();
    });
});

test('mrmdir (no arguments)', function (t) {
    forkExecWait({
        argv: [MRMDIR]
    }, function (err, info) {
        t.ok(err, 'mrmdir should fail');
        t.ok(/^path required/m.test(info.stderr), 'path required in stderr');
        t.end();
    });
});

test('mrmdir -I fails without tty', function (t) {
    forkExecWait({
        argv: [MRMDIR, '-I', TESTDIR]
    }, function (err, info) {
        t.ok(err, 'mrmdir should fail');
        t.ok(/^stdin must be a tty/m.test(info.stderr), 'stdin must be a tty');
        t.end();
    });
});

test('mrmdir 1 directory', function (t) {
    var p = SUBDIRS.pop();

    forkExecWait({
        argv: [MRMDIR, p]
    }, function (err) {
        t.ifError(err, err);
        t.end();
    });
});

test('remove remaining directories', function (t) {
    vasync.pipeline({funcs: [
        function (_, cb) {
            utils.mls(TESTDIR, function (err, files) {
                if (err) {
                    cb(err);
                    return;
                }

                t.equal(files.length, SUBDIRS.length, 'remaining dirs');
                cb();
            });
        },
        function (_, cb) {
            forkExecWait({
                argv: [MRMDIR].concat(SUBDIRS)
            }, cb);
        },
        function (_, cb) {
            utils.mls(TESTDIR, function (err, list) {
                if (err) {
                    cb(err);
                    return;
                }

                var objects = list.filter(function (o) {
                    return (o.type === 'object');
                });

                t.equal(objects.length, 0, '0 remaining objects');
                cb();
            });
        }
    ]}, function (err) {
        t.ifError(err, err);
        t.end();
    });
});

test('ensure test tree is empty', function (t) {
    utils.mls(TESTDIR, function (err, list) {
        if (err) {
            t.ifError(err, err);
            t.end();
            return;
        }

        t.equal(list.length, 0, '0 remaining entities');
        t.end();
    });
});

test('cleanup: rm test tree ' + TESTDIR, function (t) {
    // Sanity checks that we don't `mrm -r` a non-test dir.
    assert.ok(TESTDIR);
    assert.ok(TESTDIR.indexOf('node-manta-test') !== -1);

    forkExecWait({ argv: [MRM, '-r', TESTDIR]}, function (err) {
        t.ifError(err, err);
        t.end();
    });
});

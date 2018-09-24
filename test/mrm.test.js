/*
 * Copyright 2018 Joyent, Inc.
 */

/*
 * Test the "mrm" command.
 */

var assert = require('assert-plus');
var fs = require('fs');
var forkExecWait = require('forkexec').forkExecWait;
var libuuid = require('uuid');
var path = require('path');
var vasync = require('vasync');
var sprintf = require('extsprintf').sprintf;

var utils = require('./lib/utils');

var BINDIR = path.resolve(__dirname, '../bin');
var MMKDIR = path.resolve(BINDIR, 'mmkdir');
var MRM = path.resolve(BINDIR, 'mrm');
var MPUT = path.resolve(BINDIR, 'mput');

var TESTDIR = sprintf('/%s/stor/node-manta-test-mrm-%s',
    process.env.MANTA_USER || 'admin',
    libuuid.v4().split('-')[0]);

var NUMSUBDIRS = 5;
var SUBDIRS = [];
var OBJECTS = [];
var TMPFILE = '/var/tmp/node-manta-mrm-test-tmp-file-' + process.pid;

fs.writeFileSync(TMPFILE, 'foo');

for (var i = 0; i < NUMSUBDIRS; i++) {
    SUBDIRS.push(path.join(TESTDIR, 'dir' + i.toString()));
    OBJECTS.push(path.join(TESTDIR, 'object' + i.toString()));
}

// ---- helper functions

function test(name, testfunc) {
    module.exports[name] = testfunc;
}

function safePath(p) {
    assert.string(p);
    assert(p.indexOf('node-manta-test') !== -1);
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
        },
        function (_, cb) {
            // create objects
            vasync.forEachPipeline({
                inputs: OBJECTS,
                func: function (input, cb2) {
                    forkExecWait({
                        argv: [MPUT, '-f', TMPFILE, input]
                    }, cb2);
                }
            }, cb);
        }
    ]}, function (err) {
        t.ifError(err, err);
        t.done();
    });
});

test('mrm (no arguments)', function (t) {
    forkExecWait({
        argv: [MRM]
    }, function (err, info) {
        t.ok(err, 'mrm should fail');
        t.ok(/^path required/m.test(info.stderr), 'path required in stderr');
        t.done();
    });
});

test('mrm -I fails without tty', function (t) {
    forkExecWait({
        argv: [MRM, '-I', TESTDIR]
    }, function (err, info) {
        t.ok(err, 'mrm should fail');
        t.ok(/^stdin must be a tty/m.test(info.stderr), 'stdin must be a tty');
        t.done();
    });
});

test('mrm 1 directory', function (t) {
    var p = SUBDIRS.pop();

    safePath(p);

    forkExecWait({
        argv: [MRM, '-r', p]
    }, function (err) {
        t.ifError(err, err);
        t.done();
    });
});

test('remove remaining directories', function (t) {
    vasync.pipeline({funcs: [
        function (_, cb) {
            utils.mls(TESTDIR, function (err, list) {
                if (err) {
                    cb(err);
                    return;
                }

                var dirs = list.filter(function (o) {
                    return (o.type === 'directory');
                });

                t.equal(dirs.length, SUBDIRS.length, 'remaining dirs');
                cb();
            });
        },
        function (_, cb) {
            SUBDIRS.forEach(function (subdir) {
                safePath(subdir);
            });

            forkExecWait({
                argv: [MRM, '-r'].concat(SUBDIRS)
            }, cb);
        },
        function (_, cb) {
            utils.mls(TESTDIR, function (err, list) {
                if (err) {
                    cb(err);
                    return;
                }

                var dirs = list.filter(function (o) {
                    return (o.type === 'directory');
                });

                t.equal(dirs.length, 0, '0 remaining dirs');
                cb();
            });
        }
    ]}, function (err) {
        t.ifError(err, err);
        t.done();
    });
});

test('mrm 1 object', function (t) {
    var p = OBJECTS.pop();

    safePath(p);

    forkExecWait({
        argv: [MRM, p]
    }, function (err) {
        t.ifError(err, err);
        t.done();
    });
});

test('remove remaining objects', function (t) {
    vasync.pipeline({funcs: [
        function (_, cb) {
            utils.mls(TESTDIR, function (err, list) {
                if (err) {
                    cb(err);
                    return;
                }

                var objects = list.filter(function (o) {
                    return (o.type === 'object');
                });

                t.equal(objects.length, OBJECTS.length, 'remaining objects');
                cb();
            });
        },
        function (_, cb) {
            OBJECTS.forEach(function (object) {
                safePath(object);
            });

            forkExecWait({
                argv: [MRM].concat(OBJECTS)
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
        t.done();
    });
});

test('ensure test tree is empty', function (t) {
    utils.mls(TESTDIR, function (err, list) {
        if (err) {
            t.ifError(err, err);
            t.done();
            return;
        }

        t.equal(list.length, 0, '0 remaining entities');
        t.done();
    });
});

test('cleanup: rm test tree ' + TESTDIR, function (t) {
    // Sanity checks that we don't `mrm -r` a non-test dir.
    safePath(TESTDIR);

    forkExecWait({ argv: [MRM, '-r', TESTDIR]}, function (err) {
        t.ifError(err, err);
        t.done();
    });
});

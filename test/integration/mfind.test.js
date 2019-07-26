/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * Test `mfind`.
 */

var assert = require('assert-plus');
var forkExecWait = require('forkexec').forkExecWait;
var format = require('util').format;
var fs = require('fs');
var libuuid = require('uuid');
var path = require('path');
var test = require('tap').test;
var vasync = require('vasync');

var logging = require('../lib/logging');


// ---- globals

var log = logging.createLogger();

var BINDIR = path.resolve(__dirname, '../../bin');
var MFIND = path.resolve(BINDIR, 'mfind');
var MMKDIR = path.resolve(BINDIR, 'mmkdir');
var MPUT = path.resolve(BINDIR, 'mput');
var MRM = path.resolve(BINDIR, 'mrm');

var OPER;
var TESTDIR = format('/%s/stor/node-manta-test-mfind-%s',
    process.env.MANTA_USER || 'admin',
    libuuid.v4().split('-')[0]);
var TESTTREE = [
    {
        path: TESTDIR,
        type: 'directory'
    },
    {
        path: TESTDIR + '/afile.txt',
        type: 'object',
        content: 'afile'
    },
    {
        path: TESTDIR + '/adir',
        type: 'directory'
    },
    {
        path: TESTDIR + '/adir/bfile.txt',
        type: 'object',
        content: 'bfile'
    }
];


// ---- tests

test('setup: create test tree at ' + TESTDIR, function (t) {
    var tmpFile = '/var/tmp/node-manta-test-tmp-file-' + process.pid;

    vasync.forEachPipeline({
        inputs: TESTTREE,
        func: function createTreeItem(item, next) {
            log.trace({item: item}, 'create test tree item');
            if (item.type === 'directory') {
                forkExecWait({argv: [MMKDIR, '-p', item.path]}, next);
            } else {
                /*
                 * Would like a 'stdin' option to `forkExecWait`. For now I'll
                 * quick hack with a local file. An alternative would be
                 * to use the manta client.
                 */
                vasync.pipeline({funcs: [
                    function mkTmpFile(_, next2) {
                        fs.writeFile(tmpFile, item.content, next2);
                    },
                    function mputIt(_, next2) {
                        forkExecWait({argv: [MPUT, '-f', tmpFile, item.path]},
                            next2);
                    },
                    function rmTmpFile(_, next2) {
                        fs.unlink(tmpFile, next2);
                    }
                ]}, next);
            }
        }
    }, function (err) {
        t.ifError(err, err);
        t.end();
    });
});

test('check if operator (mfind forbidden)', function (t) {
    forkExecWait({
        argv: [MFIND, '-t', 'd', '--maxdepth=1', '/poseidon/stor']
    }, function (err, info) {
        if (err) {
            OPER = false;
            t.ok(/Forbidden/m.test(info.stderr), 'Forbidden in stderr');
        } else {
            OPER = true;
        }
        t.end();
    });
});

/*
 * node-manta#303 mfind should probably require at least one path argument
 */
test('mfind (no arguments)', function (t) {
    forkExecWait({
        argv: [MFIND]
    }, function (err, info) {
        t.ok(err, 'mfind should fail');
        t.ok(/^path required/m.test(info.stderr), 'path required in stderr');
        t.end();
    });
});

test('mfind TESTDIR', function (t) {
    forkExecWait({
        argv: [MFIND, TESTDIR]
    }, function (err, info) {
        t.ifError(err, err);
        t.ok(/afile.txt$/m.test(info.stdout), 'afile.txt in stdout');
        t.ok(/adir$/m.test(info.stdout), 'adir in stdout');
        t.ok(/adir\/bfile.txt$/m.test(info.stdout), 'adir/bfile.txt in stdout');
        t.end();
    });
});

/*
 * joyent/node-manta#251 specifying a path multiple times to mfind results in
 * crash.
 */
test('mfind TESTDIR TESTDIR (same argument multiple times)', function (t) {
    forkExecWait({
        argv: [MFIND, TESTDIR, TESTDIR]
    }, function (err, info) {
        t.ifError(err, err);
        t.end();
    });
});

test('mfind -j TESTDIR', function (t) {
    forkExecWait({
        argv: [MFIND, '-j', TESTDIR]
    }, function (err, info) {
        t.ifError(err, err);
        var hits = info.stdout.trim().split(/\n/g)
            .map(function (line) { return JSON.parse(line); });
        ['afile.txt', 'adir', 'bfile.txt'].forEach(function findHit(name) {
            var match = hits.filter(
                function (h) { return h.name === name; })[0];
            t.ok(match, format('found a matching hit for name "%s": %j',
                name, match));
        });

        // Assert fields on one of the hits.
        var hit = hits[0];
        t.equal(typeof (hit['name']), 'string', 'have "name" (string) field');
        t.equal(typeof (hit['type']), 'string', 'have "type" (string) field');
        t.equal(typeof (hit['mtime']), 'string', 'have "mtime" (string) field');
        t.equal(typeof (hit['parent']), 'string',
            'have "parent" (string) field');
        t.equal(typeof (hit['depth']), 'number', 'have "depth" (string) field');
        t.end();
    });
});

test('mfind TESTDIR/afile.txt', function (t) {
    forkExecWait({
        argv: [MFIND, TESTDIR + '/afile.txt']
    }, function (err, info) {
        t.ifError(err, err);
        t.ok(/afile.txt$/m.test(info.stdout), 'afile.txt in stdout');
        t.end();
    });
});

test('mfind TESTDIR/notafile.txt', function (t) {
    forkExecWait({
        argv: [MFIND, TESTDIR + '/notafile.txt']
    }, function (err, info) {
        t.ok(err);
        t.equal(info.status, 1);
        t.ok(/notafile\.txt/m.test(info.stderr), 'notafile.txt in stderr');
        t.ok(/NotFound/m.test(info.stderr), 'NotFound in stderr');
        t.end();
    });
});

test('mfind TESTDIR/notafile.txt TESTDIR/afile.txt', function (t) {
    forkExecWait({
        argv: [MFIND, TESTDIR + '/notafile.txt', TESTDIR + '/afile.txt']
    }, function (err, info) {
        t.ok(err);
        t.equal(info.status, 1);
        t.ok(/afile.txt$/m.test(info.stdout), 'afile.txt in stdout');
        t.ok(/notafile\.txt/m.test(info.stderr), 'notafile.txt in stderr');
        t.ok(/NotFound/m.test(info.stderr), 'NotFound in stderr');
        t.end();
    });
});

test('mfind /poseidon/stor TESTDIR/afile.txt', function (t) {
    if (OPER === true) {
        t.ok(true, 'mfind forbidden test', {
            skip: 'MANTA_USER=' + process.env.MANTA_USER + ' is an operator'
        });
        t.end();
        return;
    }
    forkExecWait({
        argv: [MFIND, '-p', '1', '/poseidon/stor', TESTDIR + '/afile.txt']
    }, function (err, info) {
        t.ok(err);
        t.equal(info.status, 1);
        /* XXX: Flakey due to node-manta#300 (can't control parallelism) */
        /* t.ok(!/afile.txt$/m.test(info.stdout), 'afile.txt in stdout'); */
        t.ok(/poseidon\/stor/m.test(info.stderr), 'poseidon/stor in stderr');
        t.ok(/Forbidden/m.test(info.stderr), 'Forbidden in stderr');
        t.end();
    });
});

test('cleanup: rm test tree ' + TESTDIR, function (t) {
    // Sanity checks that we don't `mrm -r` a non-test dir.
    assert.ok(TESTDIR);
    assert.ok(TESTDIR.indexOf('node-manta-test') !== -1);

    forkExecWait({argv: [MRM, '-r', TESTDIR]}, function (err) {
        t.ifError(err, err);
        t.end();
    });
});

/*
 * Copyright 2016 Joyent, Inc.
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
var vasync = require('vasync');

var logging = require('./lib/logging');


// ---- globals

var log = logging.createLogger();

var BINDIR = path.resolve(__dirname, '../bin');
var MFIND = path.resolve(BINDIR, 'mfind');
var MMKDIR = path.resolve(BINDIR, 'mmkdir');
var MPUT = path.resolve(BINDIR, 'mput');
var MRM = path.resolve(BINDIR, 'mrm');

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


// ---- helper functions

function test(name, testfunc) {
    module.exports[name] = testfunc;
}


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
        t.done();
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
        t.done();
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
                function (hit) { return hit.name === name; })[0];
            t.ok(match, format('found a matching hit for name "%s": %j',
                name, match));
        });
        t.done();
    });
});


test('cleanup: rm test tree ' + TESTDIR, function (t) {
    // Sanity checks that we don't `mrm -r` a non-test dir.
    assert.ok(TESTDIR);
    assert.ok(TESTDIR.indexOf('node-manta-test') !== -1);

    forkExecWait({argv: [MRM, '-r', TESTDIR]}, function (err) {
        t.ifError(err, err);
        t.done();
    });
});

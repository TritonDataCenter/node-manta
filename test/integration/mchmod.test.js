/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * Test the "mchmod" command.
 */

var assert = require('assert-plus');
var forkExecWait = require('forkexec').forkExecWait;
var fs = require('fs');
var libuuid = require('uuid');
var path = require('path');
var test = require('tap').test;
var vasync = require('vasync');
var sprintf = require('extsprintf').sprintf;

var logging = require('../lib/logging');


var log = logging.createLogger();

var BINDIR = path.resolve(__dirname, '../../bin');
var MMKDIR = path.resolve(BINDIR, 'mmkdir');
var MCHMOD = path.resolve(BINDIR, 'mchmod');
var MPUT = path.resolve(BINDIR, 'mput');
var MRM = path.resolve(BINDIR, 'mrm');
var MINFO = path.resolve(BINDIR, 'minfo');

var TMPDIR = process.env.TMPDIR || '/tmp';

var TESTDIR = sprintf('/%s/stor/node-manta-test-mchmod-%s',
    process.env.MANTA_USER || 'admin',
    libuuid.v4().split('-')[0]);
var TESTTREE = [
    {
        path: TESTDIR,
        type: 'directory'
    }
];

/*
 * Create three regular UNIX text files (linefeed separated, with a terminating
 * linefeed).
 */
var i;
for (i = 1; i <= 3; i++) {
    TESTTREE.push({
        path: sprintf('%s/%02d.txt', TESTDIR, i),
        type: 'object',
        content: sprintf('%s\nfile (%02d)\n',
            [ 'first', 'second', 'third' ][i - 1], i)
    });
}


/*
 * Create three data files that contain only a single character.  Of particular
 * note is the lack of a trailing linefeed.
 */
for (i = 1; i <= 3; i++) {
    TESTTREE.push({
        path: sprintf('%s/%02d.data', TESTDIR, i),
        type: 'object',
        content: sprintf('%s', String.fromCharCode('a'.charCodeAt(0) + i - 1))
    });
}

var testOpts = {
    skip: !process.env.MANTA_TEST_ROLE && 'MANTA_TEST_ROLE envvar not set'
};



// ---- helper functions

function unlinkIfExists(targ) {
    try {
        fs.unlinkSync(targ);
    } catch (ex) {
        if (ex.code === 'ENOENT')
            return;

        throw (ex);
    }
}


// ---- tests

/*
 * These tests require a role to be configured in triton to work properly so it
 * is condtional upon the user setting MANTA_TEST_ROLE in the environment.
 */
test('mchmod with role-tag', testOpts, function (suite) {

    suite.test('setup: create test tree at ' + TESTDIR, function (t) {
        var tmpFile = path.join(TMPDIR, 'node-manta-test-tmp-file-'
            + process.pid);

        vasync.forEachPipeline({
            inputs: TESTTREE,
            func: function createTreeItem(item, next) {
                log.trace({ item: item }, 'create test tree item');

                switch (item.type) {
                case 'directory':
                    forkExecWait({argv: [MMKDIR, '-p', item.path]}, next);
                    return;

                case 'object':
                    /*
                     * Would like a 'stdin' option to `forkExecWait`. For now
                     * I'll quick hack with a local file. An alternative would
                     * be to use the manta client.
                     */
                    vasync.pipeline({ funcs: [
                        function mkTmpFile(_, next2) {
                            fs.writeFile(tmpFile, item.content, next2);
                        },
                        function mputIt(_, next2) {
                            forkExecWait({
                                argv: [ MPUT, '-f', tmpFile, item.path ]
                            }, next2);
                        },
                        function rmTmpFile(_, next2) {
                            fs.unlink(tmpFile, next2);
                        }
                    ]}, next);
                    return;

                default:
                    t.ifError(new Error('invalid test tree type: '
                        + item.type));
                    return;
                }
            }
        }, function (err) {
            t.ifError(err, err);
            t.end();
        });
    });

    suite.test('minfo to verify lack of --role-tag header', function (t) {

        // Expect the role-tag header
        var role = process.env.MANTA_TEST_ROLE;
        var expectedHeader = 'role-tag: ' + role;
        var argv1 = [
            MINFO,
            sprintf('%s/%02d.data', TESTDIR, 1)
        ];

        forkExecWait({
            argv: argv1
        }, function (err, info) {
            t.ifError(err, err);

            t.equal(info.stderr, '', 'no stderr');

            var headerIndex = info.stdout.indexOf(expectedHeader);
            t.equal(headerIndex, -1,
                'minfo response does not contain role-tag header');

            t.end();
        });
    });

    suite.test('mchmod to add role-tag', function (t) {

        // Expect the role-tag header
        var role = process.env.MANTA_TEST_ROLE;
        var expectedHeader = 'role-tag: ' + role;

        var argv1 = [
            MCHMOD,
            '--',
            sprintf('+%s', role),
            sprintf('%s/%02d.data', TESTDIR, 1)
        ];

        var argv2 = [
            MINFO,
            sprintf('%s/%02d.data', TESTDIR, 1)
        ];

        forkExecWait({
            argv: argv1
        }, function (err, info) {
            t.ifError(err, err);

            t.equal(info.stderr, '', 'no stderr');

            forkExecWait({
                argv: argv2
            }, function (err2, info2) {
                t.ifError(err2, err2);
                t.equal(info2.stderr, '', 'no stderr');

                var headerIndex = info2.stdout.indexOf(expectedHeader);
                t.notEqual(headerIndex, -1,
                    'minfo response contains role-tag header');

                t.end();
            });
        });
    });

    suite.test('mchmod to remove role-tag', function (t) {

        // Expect the role-tag header
        var role = process.env.MANTA_TEST_ROLE;
        var expectedHeader = 'role-tag: ' + role;

        var argv1 = [
            MCHMOD,
            '--',
            sprintf('-%s', role),
            sprintf('%s/%02d.data', TESTDIR, 1)
        ];

        var argv2 = [
            MINFO,
            sprintf('%s/%02d.data', TESTDIR, 1)
        ];

        forkExecWait({
            argv: argv1
        }, function (err, info) {
            t.ifError(err, err);

            t.equal(info.stderr, '', 'no stderr');

            forkExecWait({
                argv: argv2
            }, function (err2, info2) {
                t.ifError(err2, err2);
                t.equal(info2.stderr, '', 'no stderr');

                var headerIndex = info2.stdout.indexOf(expectedHeader);
                t.equal(headerIndex, -1,
                    'minfo response does not contain role-tag header');

                t.end();
            });
        });
    });

    suite.test('cleanup: rm test tree ' + TESTDIR, function (t) {
        // Sanity checks that we don't `mrm -r` a non-test dir.
        assert.ok(TESTDIR);
        assert.ok(TESTDIR.indexOf('node-manta-test') !== -1);

        forkExecWait({ argv: [ MRM, '-r', TESTDIR ]}, function (err) {
            t.ifError(err, err);
            t.end();
        });
    });


    suite.test('cleanup: rm tmp directory ' + TMPDIR, function (t) {
        var tmpFile = path.join(TMPDIR, 'node-manta-test-tmp-file-'
            + process.pid);

        unlinkIfExists(tmpFile);

        t.end();
    });

    suite.end();
});

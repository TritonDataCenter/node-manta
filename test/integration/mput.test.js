/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * Test the "mput" command.
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
var MGET = path.resolve(BINDIR, 'mget');
var MMKDIR = path.resolve(BINDIR, 'mmkdir');
var MPUT = path.resolve(BINDIR, 'mput');
var MRM = path.resolve(BINDIR, 'mrm');
var MINFO = path.resolve(BINDIR, 'minfo');

var TMPDIR = process.env.TMPDIR || '/tmp';

var TESTDIR = sprintf('/%s/stor/node-manta-test-mput-%s',
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

test('setup: create test tree at ' + TESTDIR, function (t) {
    var tmpFile = path.join(TMPDIR, 'node-manta-test-tmp-file-' + process.pid);

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
                 * Would like a 'stdin' option to `forkExecWait`. For now I'll
                 * quick hack with a local file. An alternative would be
                 * to use the manta client.
                 */
                vasync.pipeline({ funcs: [
                    function mkTmpFile(_, next2) {
                        fs.writeFile(tmpFile, item.content, next2);
                    }
                ]}, next);
                return;

            default:
                t.ifError(new Error('invalid test tree type: ' + item.type));
                return;
            }
        }
    }, function (err) {
        t.ifError(err, err);
        t.end();
    });
});


/*
 * Put a file with a custom header whose value include colons. This verifies the
 * fix for https://github.com/joyent/node-manta/issues/312.
 */
test('mput with custom header value with colons', function (t) {
    // Expect the header to include the full timestamp including the colons
    var expectedHeader = 'm-start-time: 2017-06-30T18:18:18Z';

    var tmpFile = path.join(TMPDIR, 'node-manta-test-tmp-file-' + process.pid);

    var argv1 = [
        MPUT,
        '-H',
        sprintf('%s', expectedHeader),
        '-f',
        sprintf('%s', tmpFile),
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
            t.notEqual(headerIndex, -1, 'minfo response contains header');

            t.end();
        });
    });
});


/*
 * Put a file using the role-tag option and verify the role-tag header
 * is set on the object. This verifies the fix for
 * https://github.com/joyent/node-manta/issues/333. This test requires
 * a role to be configured in triton to work properly so it is condtional
 * upon the user setting MANTA_TEST_ROLE in the environment.
 */
if (process.env.MANTA_TEST_ROLE) {
    test('mput with --role-tag option', function (t) {

        // Expect the role-tag header
        var role = process.env.MANTA_TEST_ROLE;
        var expectedHeader = 'role-tag: ' + role;

        var tmpFile = path.join(TMPDIR,
            'node-manta-test-tmp-file-' + process.pid);

        var argv1 = [
            MPUT,
            '--role-tag',
            role,
            '-f',
            sprintf('%s', tmpFile),
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
                          'minfo response contains header');

                      t.end();
                  });
           });
    });
}


test('cleanup: rm test tree ' + TESTDIR, function (t) {
    // Sanity checks that we don't `mrm -r` a non-test dir.
    assert.ok(TESTDIR);
    assert.ok(TESTDIR.indexOf('node-manta-test') !== -1);

    forkExecWait({ argv: [ MRM, '-r', TESTDIR ]}, function (err) {
        t.ifError(err, err);
        t.end();
    });
});


test('cleanup: rm tmp directory ' + TMPDIR, function (t) {
    var tmpFile = path.join(TMPDIR, 'node-manta-test-tmp-file-' + process.pid);

    unlinkIfExists(tmpFile);

    t.end();
});

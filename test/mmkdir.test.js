/*
 * Copyright 2018 Joyent, Inc.
 */

/*
 * Test the "mmkdir" command.
 */

var assert = require('assert-plus');
var forkExecWait = require('forkexec').forkExecWait;
var fs = require('fs');
var libuuid = require('uuid');
var path = require('path');
var vasync = require('vasync');
var sprintf = require('extsprintf').sprintf;

var logging = require('./lib/logging');


var log = logging.createLogger();

var BINDIR = path.resolve(__dirname, '../bin');
var MMKDIR = path.resolve(BINDIR, 'mmkdir');
var MRM = path.resolve(BINDIR, 'mrm');
var MINFO = path.resolve(BINDIR, 'minfo');

var TESTDIR = sprintf('/%s/stor/node-manta-test-mput-%s',
    process.env.MANTA_USER || 'admin',
    libuuid.v4().split('-')[0]);



// ---- helper functions

function test(name, testfunc) {
    module.exports[name] = testfunc;
}


// ---- tests

/*
 * Create a directory using the role-tag option and verify the role-tag header
 * is set on the object. This verifies the fix for
 * https://github.com/joyent/node-manta/issues/333. This test requires
 * a role to be configured in triton to work properly so it is condtional
 * upon the user setting MANTA_TEST_ROLE in the environment.
 */
if (process.env.MANTA_TEST_ROLE) {
    test('mmkdir with --role-tag option', function (t) {
        // Expect the role-tag header
        var role = process.env.MANTA_TEST_ROLE;
        var expectedHeader = 'role-tag: ' + role;

        var argv1 = [
            MMKDIR,
            '--role-tag',
            role,
            TESTDIR
        ];

        var argv2 = [
            MINFO,
            TESTDIR
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

                      t.done();
                  });
           });
    });

    test('cleanup: rm test directory ' + TESTDIR, function (t) {
        // Sanity checks that we don't `mrm -r` a non-test dir.
        assert.ok(TESTDIR);
        assert.ok(TESTDIR.indexOf('node-manta-test') !== -1);

        forkExecWait({ argv: [ MRM, '-r', TESTDIR ]}, function (err) {
            t.ifError(err, err);
            t.done();
        });
    });
}

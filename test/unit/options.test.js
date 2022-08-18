/*
 * Copyright 2019 Joyent, Inc.
 * Copyright 2022 MNX Cloud, Inc.
 */

/*
 * Test the CLI options for different commands
 */

var forkExecWait = require('forkexec').forkExecWait;
var path = require('path');
var test = require('tap').test;
var vasync = require('vasync');

var BINDIR = path.resolve(__dirname, '../../bin');

const ALLCMDS = [ 'mchattr', 'mchmod', 'mfind', 'mget', 'minfo',
                  'mln', 'mlogin', 'mls', 'mmd5', 'mmkdir', 'mput',
                  'mrm', 'mrmdir', 'msign', 'muntar'
                ];

// ---- helper functions

function resolveCommand(cmd) {
    var r = path.resolve(BINDIR, cmd);
    return (r);
}


function forkCmdWithOption(input, option, cb) {
    forkExecWait({
        argv: [ input.cmd,
                option
              ],
        env: { MANTA_URL: '',
               PATH: process.env.PATH
             }
    }, function (err, info) {
           const t = input.test;
           const urlArgMsg = 'url is a required argument';

           t.ifError(err, err);
           t.equal(info.stderr.indexOf(urlArgMsg), -1);

           if (cb) {
               cb();
           }

           return;
    });
}


function forkHelpOption(cmd, cb) {
    forkCmdWithOption(cmd, '--help', cb);
}


function forkVersionOption(cmd, cb) {
    forkCmdWithOption(cmd, '--version', cb);
}


function inputObject(testObj) {
    const fn = function mkObject(command) {
        const resolvedCommand = resolveCommand(command);
        return { cmd: resolvedCommand,
                 test: testObj
               };
    };

    return (fn);
}


// ---- tests

/*
 * Test that specifying the --help option with no manta URL specified does not
 * result in a warning about the missing URL. This verifies the fix for
 * https://github.com/TritonDataCenter/node-manta/issues/328.
 */
test('Run commands with --help with no manta URL specified', function (t) {
    vasync.forEachPipeline({
        inputs: ALLCMDS.map(inputObject(t)),
        func: forkHelpOption
    }, function (err, results) {
           t.end();
       });
});


/*
 * Test that specifying the --version option with no manta URL specified does
 * not result in a warning about the missing URL. This verifies the fix for
 * https://github.com/TritonDataCenter/node-manta/issues/328.
 */
test('Run commands with --version with no manta URL specified', function (t) {
    vasync.forEachPipeline({
        inputs: ALLCMDS.map(inputObject(t)),
        func: forkVersionOption
    }, function (err, results) {
           t.end();
       });
});

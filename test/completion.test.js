/*
 * Copyright 2018 Joyent, Inc.
 */

/*
 * Test that the bash completion generation exits zero and emits output
 * that looks somewhat like Bash completion code.
 */

var fs = require('fs');
var path = require('path');

var forkExecWait = require('forkexec').forkExecWait;

/*
 * Globals
 */

var binDir = path.resolve(__dirname, '..', 'bin');

/*
 * Helper functions
 */

function test(name, testfunc) {
    module.exports[name] = testfunc;
}

/*
 * Tests
 */

fs.readdirSync(binDir).forEach(function (name) {
    // node-manta#327 completion tests could ignore hidden files
    if (name[0] === '.') {
        return;
    }

    var cmd = path.join(binDir, name);
    test(name + ' --completion', function (t) {
        forkExecWait({
            argv: [cmd, '--completion']
        }, function (err, info) {
            t.ifError(err);
            t.equal(info.stderr, '',
                'no stderr output from "' + name + ' --completion"');
            t.ok(/COMPREPLY/.test(info.stdout), 'stdout from "' + name +
                ' --completion" looks like Bash completion code');
            t.done();
        });
    });
});

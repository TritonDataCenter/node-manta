/*
 * Copyright 2016 Joyent, Inc.
 */

/*
 * Test that the bash completion generation exits zero and emits output
 * that looks somewhat like Bash completion code.
 */

var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');

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
    var cmd = path.join(binDir, name);

    test(name + ' --completion', function (t) {
        exec(cmd + ' --completion', function (err, stdout, stderr) {
            t.ifError(err);
            t.equal(stderr, '',
                'no stderr output from "' + name + ' --completion"');
            t.ok(/COMPREPLY/.test(stdout), 'stdout from "' + name +
                ' --completion" looks like Bash completion code');
            t.done();
        });
    });
});

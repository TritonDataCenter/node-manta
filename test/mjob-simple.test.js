/*
 * Copyright 2016 Joyent, Inc.
 */

/*
 * A very simple mjob test:
 *
 *      mjob create --close -or date
 */

var assert = require('assert-plus');
var path = require('path');
var spawn = require('child_process').spawn;

var logging = require('./lib/logging');


// ---- globals

var log = logging.createLogger();
var MJOB = path.resolve(__dirname, '../bin/mjob');


// ---- helper functions

function test(name, testfunc) {
    module.exports[name] = testfunc;
}

/*
 * For some reason that I don't want to chase right now, running the following
 * hangs:
 *      exec('.../mjob create --close -or date', function (err, o, e) { ... });
 * I don't think that should hang. I'm *guessing* that mjob is keeping
 * stdin open, but with '--close' it shouldn't be.
 *
 * So we'll wrap it up using spawn (explicitly closing stdin).
 */
function mjobExec(args, opts, cb) {
    assert.arrayOfString(args, 'args');
    if (cb === undefined) {
        cb = opts;
        opts = {};
    }
    assert.object(opts, 'opts');
    assert.func(cb, 'cb');

    var p = spawn(MJOB, args, opts);

    var stdoutChunks = [];
    p.stdout.on('data', function (chunk) { stdoutChunks.push(chunk); });

    var stderrChunks = [];
    p.stderr.on('data', function (chunk) { stderrChunks.push(chunk); });

    p.on('close', function (code) {
        var err = (code
            ? new Error('mjob error: exit status ' + code)
            : null);
        log.trace({err: err, args: args}, 'mjobExec: complete');
        cb(err, stdoutChunks.join(''), stderrChunks.join(''));
    });

    p.stdin.end();
}


// ---- tests

/*
 * Note the usage of '-or date' cuddled like that is ensuring we aren't
 * hitting <https://github.com/trentm/node-dashdash/issues/8>.
 */
test('mjob create --close -or date', function (t) {
    var args = ['create', '--close', '-or', 'date'];
    mjobExec(args, function (err, stdout, stderr) {
        t.ifError(err, err);
        t.equal(stderr, '', 'stderr is empty: ' + stderr);
        // Example: 'Fri Jun 24 19:05:33 UTC 2016\n'
        t.ok(/^\w{3} \w{3} [ \d]{2} [ :\d]{8} UTC \d{4}\n$/.test(stdout),
            'stdout is a date: ' + stdout);
        t.done();
    });
});

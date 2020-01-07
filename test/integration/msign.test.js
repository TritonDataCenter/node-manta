/*
 * Copyright 2020 Joyent, Inc.
 */

/*
 * Test `msign`.
 */

var f = require('util').format;
var forkExecWait = require('forkexec').forkExecWait;
var path = require('path');
var test = require('tap').test;
var url = require('url');


// ---- globals

var BINDIR = path.resolve(__dirname, '../../bin');
var MSIGN = path.resolve(BINDIR, 'msign');

// This doesn't really matter - msign doesn't check to see if the object exists
var PATH = '~~/stor/foo';


// ---- tests

test('msign (no arguments)', function (t) {
    forkExecWait({
        argv: [MSIGN]
    }, function (err, info) {
        t.ok(err, 'msign should fail');
        t.ok(/^path required/m.test(info.stderr), 'path required in stderr');
        t.end();
    });
});

test(f('msign %s', PATH), function (t) {
    var mantaUrl = process.env.MANTA_URL;

    forkExecWait({
        argv: [MSIGN, PATH]
    }, function (err, info) {
        t.ifError(err, err);

        // should be a signed URL
        var uri = info.stdout.trim();

        t.ok(uri.length > mantaUrl.length, 'uri.length > mantaUrl.length');
        t.equal(uri.slice(0, mantaUrl.length), mantaUrl, 'base URL correct');

        // ensure query paramaters are present that we expect
        var signed = url.parse(uri, true);
        var q = signed.query;
        t.ok(q, 'query');
        t.ok(q.signature, 'signature');
        t.ok(q.algorithm, 'algorithm');
        t.ok(q.expires, 'expires');
        t.ok(q.keyId, 'keyId');

        t.end();
    });
});

test(f('msign -e <expires> %s', PATH), function (t) {
    // 1 minute from now
    var expires = Math.floor(Date.now() / 1000) + 60;

    forkExecWait({
        argv: [MSIGN, '-e', expires.toString(), PATH]
    }, function (err, info) {
        t.ifError(err, err);

        var uri = info.stdout.trim();
        var signed = url.parse(uri, true);
        var q = signed.query;

        t.ok(q, 'query');
        t.equal(Number(q.expires), expires, 'expires');

        t.end();
    });
});

test(f('msign -E 1h %s', PATH), function (t) {
    // 1 hour from now
    var expires = Math.floor(Date.now() / 1000) + (1 * 60 * 60);

    forkExecWait({
        argv: [MSIGN, '-E', '1h', PATH]
    }, function (err, info) {
        t.ifError(err, err);

        var uri = info.stdout.trim();
        var signed = url.parse(uri, true);
        var q = signed.query;

        /*
         * Because there is some time from when we get the current time in this
         * test, to when `msign` gets the current time, it is possible that the
         * expires date set by `msign` will be a couple seconds ahead of us, so
         * allow for a slight variance.
         */
        t.ok(q.expires >= expires,
            f('q.expires >= expires (%s >= %s)', q.expires, expires));
        t.ok(q.expires < expires + 30,
            f('q.expires < expires + 30 (%s < %s + 30)', q.expires, expires));

        t.end();
    });
});

// Good arguments
[
    '1s',
    '1m',
    '1h',
    '1d',
    '1w',
    '1y'
].forEach(function (expires) {
    test(f('msign -E %s %s (good argument)', expires, PATH), function (t) {
        forkExecWait({
            argv: [MSIGN, '-E', expires, PATH]
        }, function (err, info) {
            t.ifError(err, err);
            t.end();
        });
    });
});

// Bad arguments
[
    'foo',
    '',
    '-5s',
    '74q',
    '0s',
    '0m',
    '0h',
    '0d',
    '0w',
    '0y'
].forEach(function (expires) {
    test(f('msign -E %s %s (bad argument)', expires, PATH), function (t) {
        forkExecWait({
            argv: [MSIGN, '-E', expires, PATH]
        }, function (err, info) {
            t.ok(err, 'msign should fail');
            t.ok(/invalid expires: /m.test(info.stderr),
                'invalid expires in stderr');
            t.end();
        });
    });
});

test('msign -E and -e together', function (t) {
    forkExecWait({
        argv: [MSIGN, '-E', '1h', '-e', '1234567', PATH]
    }, function (err, info) {
        t.ok(err, 'msign should fail');
        t.ok(/-e and -E cannot be specified together/m.test(info.stderr),
            '-e and -E cannot be specified together in stderr');
        t.end();
    });
});

/*
 * Copyright 2019 Joyent, Inc.
 */

var f = require('util').format;

var test = require('tap').test;

var manta = require('../..');


// a name on the left should match the name on the right
// when escaped.
test('escapePath encoding', function (t) {
    var tests = [
        // simple tests, no effect
        ['foo', 'foo'],
        ['bar', 'bar'],

        // special characters
        ['one\rtwo', 'one\\rtwo'],
        ['one\ntwo', 'one\\ntwo'],
        ['one\ttwo', 'one\\ttwo'],

        // ANSI escape chars
        ['red\x1b[31mcolor', 'red\\u001b[31mcolor']
    ];

    tests.forEach(function (_test) {
        var s = _test[0];
        t.equal(manta.escapePath(s), _test[1]);
    });
    t.end();
});

test('prettyBytes', function (t) {
    var goodTests = [
        [0, '0'],
        [1, '1'],

        [1024, '1K'],
        [2048, '2K'],
        [2058, '2.01K'],

        [12345, '12.06K'],
        [123456, '120.56K'],
        [1234567, '1.18M'],
        [12345678, '11.77M'],
        [123456789, '117.74M'],
        [1234567890, '1.15G'],
        [12345678901, '11.5G'],
        [123456789012, '114.98G'],
        [1234567890123, '1.12T'],

        [Math.pow(1024, 0), '1'],
        [Math.pow(1024, 1), '1K'],
        [Math.pow(1024, 2), '1M'],
        [Math.pow(1024, 3), '1G'],
        [Math.pow(1024, 4), '1T']
    ];
    goodTests.forEach(function (_test) {
        var bytes = _test[0];
        var out = _test[1];
        t.equal(manta.prettyBytes(bytes), out,
            f('prettyBytes(%d) == "%s"', bytes, out));
    });

    var badTests = [
        -1,
        NaN,
        '',
        true,
        {},
        [],
        new Date()
    ];
    badTests.forEach(function (value) {
        t.throws(function () {
            manta.prettyBytes(value);
        }, f('prettyBytes(%j) throws', value));
    });
    t.end();
});

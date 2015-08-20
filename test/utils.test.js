/*
 * Copyright 2015 Joyent, Inc.
 */

var manta = require('..');

function test(name, testfunc) {
    module.exports[name] = testfunc;
}

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
    t.done();
});

/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * Unit tests for lib/mantauri.js.
 */

var test = require('tap').test;

var logging = require('../lib/logging');
var MantaUri = require('../../lib/mantauri').MantaUri;


/*
 * Globals
 */

var log = logging.createLogger();


/*
 * Tests
 */

test('manta:mybucket/myobject.txt', function (t) {
    var muri = new MantaUri('manta:mybucket/myobject.txt');
    t.equal(muri.host, null);
    t.equal(muri.login, null);
    t.equal(muri.bucket, 'mybucket');
    t.equal(muri.object, 'myobject.txt');
    t.equal(muri.toString(), 'manta:mybucket/myobject.txt');
    t.end();
});

test('manta:mybucket/this/is/my/obj.jpg', function (t) {
    var muri = new MantaUri('manta:mybucket/this/is/my/obj.jpg');
    t.equal(muri.host, null);
    t.equal(muri.login, null);
    t.equal(muri.bucket, 'mybucket');
    t.equal(muri.object, 'this/is/my/obj.jpg');
    t.equal(muri.toString(), 'manta:mybucket/this/is/my/obj.jpg');
    t.end();
});

test('manta:mybucket', function (t) {
    var muri = new MantaUri('manta:mybucket');
    t.equal(muri.host, null);
    t.equal(muri.login, null);
    t.equal(muri.bucket, 'mybucket');
    t.equal(muri.object, null);
    t.equal(muri.toString(), 'manta:mybucket');
    t.end();
});

test('manta:mybucket/ (normalize trailing slash on bucket)', function (t) {
    var muri = new MantaUri('manta:mybucket/');
    t.equal(muri.host, null);
    t.equal(muri.login, null);
    t.equal(muri.bucket, 'mybucket');
    t.equal(muri.object, null);
    t.equal(muri.toString(), 'manta:mybucket');
    t.end();
});


test('manta:mybucket/myobject.txt (from component fields)', function (t) {
    var muri = new MantaUri(null, null, 'mybucket', 'myobject.txt');
    t.equal(muri.host, null);
    t.equal(muri.login, null);
    t.equal(muri.bucket, 'mybucket');
    t.equal(muri.object, 'myobject.txt');
    t.equal(muri.toString(), 'manta:mybucket/myobject.txt');
    t.end();
});


// Some expected failures

test('no args (parse fail, num of args)', function (t) {
    t.plan(1);
    try {
        // jsl:ignore
        var muri = new MantaUri();
        // jsl:end
    } catch (err) {
        t.ok(/incorrect number of arguments/.test(err.message), err.message);
    }
    t.end();
});

test('"" (parse fail)', function (t) {
    t.plan(1);
    try {
        var muri = new MantaUri('');
    } catch (err) {
        t.ok(/scheme is not "manta:"/.test(err.message), err.message);
    }
    t.end();
});

test('MANTA:mybucket/myobject.txt (parse fail, scheme case)', function (t) {
    t.plan(1);
    try {
        var muri = new MantaUri('MANTA:mybucket/myobject.txt');
    } catch (err) {
        t.ok(/scheme is not "manta:"/.test(err.message), err.message);
    }
    t.end();
});

test('manta: (parse fail, missing bucket)', function (t) {
    t.plan(1);
    try {
        var muri = new MantaUri('manta:');
    } catch (err) {
        t.ok(/missing bucket name/.test(err.message), err.message);
    }
    t.end();
});

test('manta://example.com/bob/mybucket/myobject.txt (parse fail, do not yet support long forms)', function (t) {
    t.plan(1);
    try {
        var muri = new MantaUri('manta://example.com/bob/mybucket/myobject.txt');
    } catch (err) {
        t.ok(/do not yet support long URI forms/.test(err.message), err.message);
    }
    t.end();
});

test('from components, host non null (parse fail, do not yet support long forms)', function (t) {
    t.plan(1);
    try {
        var muri = new MantaUri('example.com', null, 'mybucket', 'myobject.txt');
    } catch (err) {
        t.ok(/do not yet support long URI forms/.test(err.message), err.message);
    }
    t.end();
});

test('from components, login non null (parse fail, do not yet support long forms)', function (t) {
    t.plan(1);
    try {
        var muri = new MantaUri(null, 'bob', 'mybucket', 'myobject.txt');
    } catch (err) {
        t.ok(/do not yet support long URI forms/.test(err.message), err.message);
    }
    t.end();
});

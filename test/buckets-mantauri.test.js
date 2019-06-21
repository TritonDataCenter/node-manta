/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * Unit tests for lib/mantauri.js.
 */

var logging = require('./lib/logging');
var MantaUri = require('../lib/mantauri').MantaUri;


/*
 * Globals
 */

var log = logging.createLogger();


/*
 * Helper functions
 */

function test(name, testfunc) {
    module.exports[name] = testfunc;
}


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
    t.done();
});

test('manta:mybucket/this/is/my/obj.jpg', function (t) {
    var muri = new MantaUri('manta:mybucket/this/is/my/obj.jpg');
    t.equal(muri.host, null);
    t.equal(muri.login, null);
    t.equal(muri.bucket, 'mybucket');
    t.equal(muri.object, 'this/is/my/obj.jpg');
    t.equal(muri.toString(), 'manta:mybucket/this/is/my/obj.jpg');
    t.done();
});

test('manta:mybucket', function (t) {
    var muri = new MantaUri('manta:mybucket');
    t.equal(muri.host, null);
    t.equal(muri.login, null);
    t.equal(muri.bucket, 'mybucket');
    t.equal(muri.object, null);
    t.equal(muri.toString(), 'manta:mybucket');
    t.done();
});

test('manta:mybucket/ (normalize trailing slash on bucket)', function (t) {
    var muri = new MantaUri('manta:mybucket/');
    t.equal(muri.host, null);
    t.equal(muri.login, null);
    t.equal(muri.bucket, 'mybucket');
    t.equal(muri.object, null);
    t.equal(muri.toString(), 'manta:mybucket');
    t.done();
});


test('manta:mybucket/myobject.txt (from component fields)', function (t) {
    var muri = new MantaUri(null, null, 'mybucket', 'myobject.txt');
    t.equal(muri.host, null);
    t.equal(muri.login, null);
    t.equal(muri.bucket, 'mybucket');
    t.equal(muri.object, 'myobject.txt');
    t.equal(muri.toString(), 'manta:mybucket/myobject.txt');
    t.done();
});


// Some expected failures

test('no args (parse fail, num of args)', function (t) {
    t.expect(1);
    try {
        var muri = new MantaUri();
    } catch (err) {
        t.ok(/incorrect number of arguments/.test(err.message), err.message);
    }
    t.done();
});

test('"" (parse fail)', function (t) {
    t.expect(1);
    try {
        var muri = new MantaUri('');
    } catch (err) {
        t.ok(/scheme is not "manta:"/.test(err.message), err.message);
    }
    t.done();
});

test('MANTA:mybucket/myobject.txt (parse fail, scheme case)', function (t) {
    t.expect(1);
    try {
        var muri = new MantaUri('MANTA:mybucket/myobject.txt');
    } catch (err) {
        t.ok(/scheme is not "manta:"/.test(err.message), err.message);
    }
    t.done();
});

test('manta: (parse fail, missing bucket)', function (t) {
    t.expect(1);
    try {
        var muri = new MantaUri('manta:');
    } catch (err) {
        t.ok(/missing bucket name/.test(err.message), err.message);
    }
    t.done();
});

test('manta://example.com/bob/mybucket/myobject.txt (parse fail, do not yet support long forms)', function (t) {
    t.expect(1);
    try {
        var muri = new MantaUri('manta://example.com/bob/mybucket/myobject.txt');
    } catch (err) {
        t.ok(/do not yet support long URI forms/.test(err.message), err.message);
    }
    t.done();
});

test('from components, host non null (parse fail, do not yet support long forms)', function (t) {
    t.expect(1);
    try {
        var muri = new MantaUri('example.com', null, 'mybucket', 'myobject.txt');
    } catch (err) {
        t.ok(/do not yet support long URI forms/.test(err.message), err.message);
    }
    t.done();
});

test('from components, login non null (parse fail, do not yet support long forms)', function (t) {
    t.expect(1);
    try {
        var muri = new MantaUri(null, 'bob', 'mybucket', 'myobject.txt');
    } catch (err) {
        t.ok(/do not yet support long URI forms/.test(err.message), err.message);
    }
    t.done();
});


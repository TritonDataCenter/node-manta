/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * Unit tests for `mkBucketReqOpts` from lib/buckets.js.
 */

var bunyan = require('bunyan');
var libuuid = require('uuid');
var tap = require('tap');
var test = tap.test;

var logging = require('../lib/logging');
var mkBucketReqOpts = require('../../lib/buckets').mkBucketReqOpts;


/*
 * Globals
 */

var log = logging.createLogger();
var TEST_REQ_ID = libuuid.v4();


/*
 * Custom asserts
 */

const uuidRe = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
tap.Test.prototype.addAssert('uuid', 1, function (val, message, extra) {
    message = message || 'should be a UUID';
    return this.match(val, uuidRe, message, extra);
});


/*
 * Tests
 */

test('empty opts', function (t) {
    var reqOpts = mkBucketReqOpts('/bob/buckets');
    // -> {path: '...', headers: {'x-request-id': <new uuid>}, query: {}}
    t.uuid(reqOpts.headers['x-request-id']);
    delete reqOpts.headers['x-request-id'];
    t.strictDeepEqual(reqOpts, {path: '/bob/buckets', headers: {}, query: {}});
    t.end();
});

test('userOpts win', function (t) {
    var reqOpts = mkBucketReqOpts(
        '/bob/buckets',
        {connectTimeout: 300, headers: {foo: 'a', bar: 'b'}, query: {baz: 'c'}},
        {connectTimeout: 100, headers: {foo: 'd'}, query: {baz: 'e'}}
    );
    delete reqOpts.headers['x-request-id'];
    t.strictDeepEqual(reqOpts, {
        path: '/bob/buckets',
        connectTimeout: 100,
        headers: {foo: 'd', bar: 'b'},
        query: {baz: 'e'}
    });
    t.end();
});

test('normalize headers', function (t) {
    var reqOpts = mkBucketReqOpts(
        '/bob/buckets',
        {headers: {Foo: 'a', Bar: 'b'}},
        {headers: {FOO: 'c'}}
    );
    delete reqOpts.headers['x-request-id'];
    t.strictDeepEqual(reqOpts, {
        path: '/bob/buckets',
        headers: {foo: 'c', bar: 'b'},
        query: {}
    });
    t.end();
});

test('undefined values filtered out', function (t) {
    var reqOpts = mkBucketReqOpts(
        '/bob/buckets',
        {connectTimeout: 100, headers: {foo: 'a', caz: undefined}},
        {connectTimeout: undefined,
            headers: {bar: 'b', foo: undefined, dab: undefined}}
    );
    delete reqOpts.headers['x-request-id'];
    t.strictDeepEqual(reqOpts, {
        path: '/bob/buckets',
        connectTimeout: 100,
        headers: {foo: 'a', bar: 'b'},
        query: {}
    });
    t.end();
});

test('provided req_id is maintained', function (t) {
    var reqOpts = mkBucketReqOpts(
        '/bob/buckets',
        {headers: {foo: 'a'}},
        {headers: {bar: 'b', 'x-request-id': TEST_REQ_ID}}
    );
    t.equal(reqOpts.headers['x-request-id'], TEST_REQ_ID);
    t.end();
});

test('req_id field added to log', function (t) {
    var testLog = bunyan.createLogger({name: 'test1'});
    var reqOpts = mkBucketReqOpts(
        '/bob/buckets',
        {log: testLog},
        {headers: {'x-request-id': TEST_REQ_ID}}
    );
    t.ok(reqOpts.log);
    t.equal(reqOpts.log.fields.req_id, TEST_REQ_ID);
    t.end();
});

test('req_id field overwritten on log', function (t) {
    var testLog = bunyan.createLogger({name: 'test1', req_id: 'dummy'});
    var reqOpts = mkBucketReqOpts(
        '/bob/buckets',
        {log: testLog},
        {headers: {'x-request-id': TEST_REQ_ID}}
    );
    t.ok(reqOpts.log);
    t.equal(reqOpts.log.fields.req_id, TEST_REQ_ID);
    t.notEqual(reqOpts.log, testLog); // reqOpts.log is a new child logger
    t.end();
});

test('req_id field not overwritten on log if matching', function (t) {
    var testLog = bunyan.createLogger({name: 'test1', req_id: TEST_REQ_ID});
    var reqOpts = mkBucketReqOpts(
        '/bob/buckets',
        {log: testLog},
        {headers: {'x-request-id': TEST_REQ_ID}}
    );
    t.ok(reqOpts.log);
    t.equal(reqOpts.log.fields.req_id, TEST_REQ_ID);
    t.equal(reqOpts.log, testLog); // reqOpts.log is the unchanged `testLog`
    t.end();
});


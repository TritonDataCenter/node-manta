/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * Test the MantaBucketsClient and conditional requests, i.e. those using
 * these headers:
 *  - If-Modified-Since
 *  - If-Unmodified-Since
 *  - If-Match
 *  - If-None-Match
 *
 * At the time of writing the Buckets API authority
 * (https://github.com/joyent/rfd/tree/master/rfd/0155) said the following
 * endpoints support conditional request headers:
 *  - HeadBucketObject
 *  - CreateBucketObject
 *  - GetBucketObject
 *  - DeleteBucketObject
 *
 * No `if-modified-since` for PutBucketObject and DeleteBucketObject because
 * that header only makes sense with GET and HEAD. At least according to
 * https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Modified-Since
 * I am no expert on RFC 2616.
 */

var crypto = require('crypto');
var fs = require('fs');
var libuuid = require('uuid');
var os = require('os');
var path = require('path');
var test = require('tap').test;

var buckets = require('../../lib/buckets');
var logging = require('../lib/logging');
var manta = require('../../lib');
var testutils = require('../lib/utils');


/*
 * Globals
 */

var log = logging.createLogger();
var testOpts = {
    skip: !testutils.isBucketsEnabledSync(log) &&
        'this Manta does not support Buckets'
};

const TEST_RESOURCE_PREFIX = 'node-manta-test-buckets-client-condreq-' +
    libuuid.v4().split('-')[0] + '-';



/*
 * Tests
 */

test('buckets client conditional requests', testOpts, function (suite) {
    const BUCKET_NAME = TEST_RESOURCE_PREFIX + 'bucket';
    const OBJECT_NAME = TEST_RESOURCE_PREFIX + 'object';
    const SMALL_FILE_PATH = path.resolve(__dirname, 'corpus/small.file');
    const SMALL_FILE_SIZE = fs.statSync(SMALL_FILE_PATH).size;
    const SMALL_FILE_CONTENT = fs.readFileSync(SMALL_FILE_PATH);
    const SMALL_FILE_CONTENT_MD5 = crypto.createHash('md5').
        update(SMALL_FILE_CONTENT).digest('base64');

    var client;
    var mtime;

    test('setup: client', function (t) {
        var clientOpts = {
            log: log,
            klass: buckets.MantaBucketsClient
        };
        client = manta.createBinClient(clientOpts);
        t.end();
    });

    test('setup: create bucket: ' + BUCKET_NAME, function (t) {
        client.createBucket(BUCKET_NAME, function (err) {
            t.ifError(err);
            t.end();
        });
    });

    test('setup: create object: ' + OBJECT_NAME, function (t) {
        var inStream = fs.createReadStream(SMALL_FILE_PATH);
        var reqOpts = {
            headers: {
                // XXX
                'm-foo': 'bar'
            }
        };
        client.createBucketObject(inStream, BUCKET_NAME, OBJECT_NAME, reqOpts,
                                  function (err, res) {
            t.ifError(err);
            mtime = new Date(res.headers['last-modified']);
            t.ok(!isNaN(mtime.getTime()));
            t.end();
        });
    });


    // XXX This is incomplete. START HERE.
    test('HeadBucketObject: if-modified-since', function (t) {
        client.headBucketObject(
            BUCKET_NAME,
            OBJECT_NAME,
            {
                headers: {
                    'if-modified-since': 'XXX'
                }
            },
            function (err, res) {
                t.ifError(err);
                t.ok(res);
                t.equal(res.headers['content-md5'], SMALL_FILE_CONTENT_MD5);
                t.equal(res.headers['content-length'], SMALL_FILE_SIZE.toString());
                t.end();
            });
    });

 //*  - HeadBucketObject
 //*  - CreateBucketObject
 //*  - GetBucketObject
 //*  - DeleteBucketObject

 //*  - If-Modified-Since
 //*  - If-Unmodified-Since
 //*  - If-Match
 //*  - If-None-Match

    //test('headBucketObject', function (t) {
    //    clientMethodsToTest.delete('headBucketObject');
    //    client.headBucketObject(BUCKET_NAME, OBJECT_NAME,
    //                            function (err, res) {
    //        t.ifError(err);
    //        t.ok(res);
    //        t.equal(res.headers['content-md5'], SMALL_FILE_CONTENT_MD5);
    //        t.equal(res.headers['content-length'], SMALL_FILE_SIZE.toString());
    //        t.equal(res.headers['m-foo'], 'bar');
    //        t.end();
    //    });
    //});
    //
    //test('getBucketObject', function (t) {
    //    clientMethodsToTest.delete('getBucketObject');
    //    client.getBucketObject(BUCKET_NAME, OBJECT_NAME,
    //                            function (err, stream, res) {
    //        t.ifError(err);
    //
    //        t.ok(res);
    //        t.equal(res.headers['content-md5'], SMALL_FILE_CONTENT_MD5);
    //        t.equal(res.headers['content-length'], SMALL_FILE_SIZE.toString());
    //        t.equal(res.headers['m-foo'], 'bar');
    //
    //        t.ok(stream);
    //        var chunks = [];
    //        stream.on('data', function (chunk) {
    //            chunks.push(chunk);
    //        });
    //        stream.on('error', function (streamErr) {
    //            t.ifError(err);
    //            t.end();
    //        });
    //        stream.on('end', function (chunk) {
    //            var downloaded = Buffer.concat(chunks);
    //            t.strictDeepEqual(downloaded, SMALL_FILE_CONTENT);
    //            t.end();
    //        });
    //    });
    //});


    test('teardown: delete object', function (t) {
        client.deleteBucketObject(BUCKET_NAME, OBJECT_NAME, function (err) {
            t.ifError(err);
            t.end();
        });
    });

    test('teardown: delete bucket', function (t) {
        client.deleteBucket(BUCKET_NAME, function (err) {
            t.ifError(err);
            t.end();
        });
    });

    test('teardown: client', function (t) {
        if (client) {
            client.close();
        }
        t.end();
    });

    suite.end();
});

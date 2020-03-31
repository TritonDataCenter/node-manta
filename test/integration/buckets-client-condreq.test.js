/*
 * Copyright 2020 Joyent, Inc.
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
    var etag, mtime;


    /*
     * Convenience function for asserting a common response from a HEAD request.
     */
    function headAndAssert(t, cb) {
        client.headBucketObject(BUCKET_NAME, OBJECT_NAME, function (err, res) {
            t.ifError(err);
            t.ok(res);
            t.equal(res.headers['content-md5'], SMALL_FILE_CONTENT_MD5);
            t.equal(res.headers['content-length'], SMALL_FILE_SIZE.toString());

            cb(res);
        });
    }

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
            etag = res.headers['etag'];
            mtime = new Date(res.headers['last-modified']);
            t.ok(!isNaN(mtime.getTime()));
            t.end();
        });
    });

    /*
     * HEAD
     */

    test('HeadBucketObject: if-unmodified-since (bad date)', function (t) {
        client.headBucketObject(
            BUCKET_NAME,
            OBJECT_NAME,
            {
                headers: {
                    'if-unmodified-since': 'x'
                }
            },
            function (err, res) {
                t.ok(err);
                t.ok(res);
                t.equal(res.statusCode, 400);
                //console.log(err);
                t.end();
            });
    });

    test('HeadBucketObject: if-modified-since (good)', function (t) {
        var d = new Date('2000-01-01T10:00:00.000Z').toISOString();

        client.headBucketObject(
            BUCKET_NAME,
            OBJECT_NAME,
            {
                headers: {
                    'if-modified-since': d
                }
            },
            function (err, res) {
                t.ifError(err);
                t.ok(res);
                t.equal(res.headers['content-md5'], SMALL_FILE_CONTENT_MD5);
                t.equal(res.headers['content-length'],
                    SMALL_FILE_SIZE.toString());
                t.equal(res.headers['m-foo'], 'bar');
                t.end();
            });
    });

    test('HeadBucketObject: if-modified-since (bad)', function (t) {
        var d = new Date(mtime.getTime() + 1000).toISOString();

        client.headBucketObject(
            BUCKET_NAME,
            OBJECT_NAME,
            {
                headers: {
                    'if-modified-since': d
                }
            },
            function (err, res) {
                t.ifError(err);
                t.ok(res);
                t.equal(res.statusCode, 304);
                t.end();
            });
    });

    test('HeadBucketObject: if-unmodified-since (good)', function (t) {
        var d = new Date(mtime.getTime() + 1000).toISOString();

        client.headBucketObject(
            BUCKET_NAME,
            OBJECT_NAME,
            {
                headers: {
                    'if-unmodified-since': d
                }
            },
            function (err, res) {
                t.ifError(err);
                t.ok(res);
                t.equal(res.headers['content-md5'], SMALL_FILE_CONTENT_MD5);
                t.equal(res.headers['content-length'],
                    SMALL_FILE_SIZE.toString());
                t.end();
            });
    });

    test('HeadBucketObject: if-unmodified-since (bad)', function (t) {
        var d = new Date('2000-01-01T10:00:00.000Z').toISOString();

        client.headBucketObject(
            BUCKET_NAME,
            OBJECT_NAME,
            {
                headers: {
                    'if-unmodified-since': d
                }
            },
            function (err, res) {
                //t.ok(err);
                t.ok(res);
                t.equal(res.statusCode, 412);
                t.end();
            });
    });

    test('HeadBucketObject: if-match (good)', function (t) {
        client.headBucketObject(
            BUCKET_NAME,
            OBJECT_NAME,
            {
                headers: {
                    'if-match': etag
                }
            },
            function (err, res) {
                t.ifError(err);
                t.ok(res);
                t.equal(res.headers['content-md5'], SMALL_FILE_CONTENT_MD5);
                t.equal(res.headers['content-length'],
                    SMALL_FILE_SIZE.toString());
                t.end();
            });
    });

    test('HeadBucketObject: if-match (bad)', function (t) {
        client.headBucketObject(
            BUCKET_NAME,
            OBJECT_NAME,
            {
                headers: {
                    'if-match': libuuid.v4()
                }
            },
            function (err, res) {
                t.ok(err);
                t.ok(res);
                t.equal(res.statusCode, 412);
                t.end();
            });
    });

    test('HeadBucketObject: if-none-match (good)', function (t) {
        client.headBucketObject(
            BUCKET_NAME,
            OBJECT_NAME,
            {
                headers: {
                    'if-none-match': libuuid.v4()
                }
            },
            function (err, res) {
                t.ifError(err);
                t.ok(res);
                t.equal(res.headers['content-md5'], SMALL_FILE_CONTENT_MD5);
                t.equal(res.headers['content-length'],
                    SMALL_FILE_SIZE.toString());
                t.end();
            });
    });

    test('HeadBucketObject: if-none-match (bad)', function (t) {
        client.headBucketObject(
            BUCKET_NAME,
            OBJECT_NAME,
            {
                headers: {
                    'if-none-match': etag
                }
            },
            function (err, res) {
                t.ifError(err);
                t.ok(res);
                t.equal(res.statusCode, 304);
                t.end();
            });
    });

    /*
     * GET
     */

    test('GetBucketObject: if-match (good)', function (t) {
        client.getBucketObject(BUCKET_NAME, OBJECT_NAME, {
            headers: {
                'if-match': etag
            } }, function (err, stream, res) {

            t.ifError(err);

            t.ok(res);
            t.equal(res.headers['content-md5'], SMALL_FILE_CONTENT_MD5);
            t.equal(res.headers['content-length'], SMALL_FILE_SIZE.toString());
            t.equal(res.headers['m-foo'], 'bar');
            t.ok(stream);
            var chunks = [];
            stream.on('data', function (chunk) {
                chunks.push(chunk);
            });
            stream.on('error', function (streamErr) {
                t.ifError(err);
                t.end();
            });
            stream.on('end', function (chunk) {
                var downloaded = Buffer.concat(chunks);
                t.strictDeepEqual(downloaded, SMALL_FILE_CONTENT);
                t.end();
            });
        });
    });

    test('GetBucketObject: if-match (bad)', function (t) {
        client.getBucketObject(BUCKET_NAME, OBJECT_NAME, {
            headers: {
                'if-match': libuuid.v4()
            } }, function (err, stream, res) {

            t.ok(err);
            t.ok(res);
            t.equal(res.statusCode, 412);
            t.end();
        });
    });

    test('GetBucketObject: if-none-match (good)', function (t) {
        client.getBucketObject(BUCKET_NAME, OBJECT_NAME, {
            headers: {
                'if-match': etag
            } }, function (err, stream, res) {

            t.ifError(err);

            t.ok(res);
            t.equal(res.headers['content-md5'], SMALL_FILE_CONTENT_MD5);
            t.equal(res.headers['content-length'], SMALL_FILE_SIZE.toString());
            t.equal(res.headers['m-foo'], 'bar');
            t.ok(stream);
            var chunks = [];
            stream.on('data', function (chunk) {
                chunks.push(chunk);
            });
            stream.on('error', function (streamErr) {
                t.ifError(err);
                t.end();
            });
            stream.on('end', function (chunk) {
                var downloaded = Buffer.concat(chunks);
                t.strictDeepEqual(downloaded, SMALL_FILE_CONTENT);
                t.end();
            });
        });
    });

    test('GetBucketObject: if-none-match (bad)', function (t) {
        client.getBucketObject(BUCKET_NAME, OBJECT_NAME, {
            headers: {
                'if-none-match': etag
            } }, function (err, stream, res) {

            t.ifError(err);
            t.ok(res);
            t.equal(res.statusCode, 304);
            t.end();
        });
    });

    /*
     * CREATE
     */

    test('CreateBucketObject: if-match (bad)', function (t) {
        var inStream = fs.createReadStream(SMALL_FILE_PATH);
        var reqOpts = {
            headers: {
                'm-bar': 'wut',
                'if-match': libuuid.v4()
            }
        };
        client.createBucketObject(inStream, BUCKET_NAME, OBJECT_NAME, reqOpts,
                                  function (err, res) {

            t.ok(err);
            t.ok(res);

            t.equal(err.code, 'PreconditionFailed');

            headAndAssert(t, function (res) {
                t.equal(res.headers['m-foo'], 'bar');
                t.end();
            });
        });
    });

    test('CreateBucketObject: if-none-match (bad)', function (t) {
        var inStream = fs.createReadStream(SMALL_FILE_PATH);
        var reqOpts = {
            headers: {
                'm-bar': 'wut',
                'if-none-match': etag
            }
        };
        client.createBucketObject(inStream, BUCKET_NAME, OBJECT_NAME, reqOpts,
                                  function (err, res) {

            t.ok(err);
            t.ok(res);

            t.equal(err.code, 'PreconditionFailed');

            headAndAssert(t, function (res) {
                t.equal(res.headers['m-foo'], 'bar');
                t.end();
            });
        });
    });

    test('CreateBucketObject: if-match (good)', function (t) {
        var inStream = fs.createReadStream(SMALL_FILE_PATH);
        var reqOpts = {
            headers: {
                'if-match': etag,
                'm-bar': 'wut',
                'm-foo': 'bar'
            }
        };
        client.createBucketObject(inStream, BUCKET_NAME, OBJECT_NAME, reqOpts,
                                  function (err, res) {
            t.ifError(err);
            t.ok(res);

            headAndAssert(t, function (res) {
                t.equal(res.headers['m-foo'], 'bar');
                t.equal(res.headers['m-bar'], 'wut');
                t.ok(etag !== res.headers['etag']);
                etag = res.headers['etag'];
                mtime = new Date(res.headers['last-modified']);
                t.ok(!isNaN(mtime.getTime()));
                t.end();
            });
        });
    });

    /*
     * UPDATE
     */

    test('UpdateBucketObject: if-match (good)', function (t) {
        client.putBucketObjectMetadata(BUCKET_NAME, OBJECT_NAME, {
            headers: {
                'm-foo': 'wut',
                'if-match': etag
            } }, function (err, res) {

            t.ifError(err);
            t.ok(res);

            headAndAssert(t, function (res) {
                t.equal(res.headers['m-foo'], 'wut');
                t.ok(!res.headers['m-bar']);
                mtime = new Date(res.headers['last-modified']);
                t.ok(!isNaN(mtime.getTime()));
                t.end();
            });
        });
    });

    test('UpdateBucketObject: if-match (bad)', function (t) {
        client.putBucketObjectMetadata(BUCKET_NAME, OBJECT_NAME, {
            headers: {
                'm-foo': 'test',
                'if-match': libuuid.v4()
            } }, function (err, res) {

            t.ok(err);
            t.ok(res);
            /*
             * XXX Why no `res.statusCode` from client, like `get` does.
             */
            t.equal(err.code, 'PreconditionFailed');

            headAndAssert(t, function (res) {
                t.equal(res.headers['m-foo'], 'wut');
                t.ok(!res.headers['m-bar']);
                t.end();
            });
        });
    });

    /*
     * DELETE
     */

    test('DeleteBucketObject: if-match (bad)', function (t) {
        client.deleteBucketObject(BUCKET_NAME, OBJECT_NAME, {
            headers: {
                'if-match': libuuid.v4()
            }
        }, function (err, res) {
            t.ok(err);
            t.ok(res);
            t.equal(err.code, 'PreconditionFailed');
            t.end();
        });
    });

    test('DeleteBucketObject: if-match (good)', function (t) {
        client.deleteBucketObject(BUCKET_NAME, OBJECT_NAME, {
            headers: {
                'if-match': etag
            }
        }, function (err, res) {
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

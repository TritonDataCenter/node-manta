/*
 * Copyright 2020 Joyent, Inc.
 */

/*
 * Test bucket endpoints for proper validation of inputs
 */

var assert = require('assert-plus');
var fs = require('fs');
var libuuid = require('uuid');
var test = require('tap').test;
var util = require('util');
var f = util.format;

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

var BUCKET_NAME = 'node-manta-test-buckets-client-validation-' +
    libuuid.v4().split('-')[0];

function emptyStream() {
    return fs.createReadStream('/dev/null');
}

/*
 * Valid and invalid bucket names. See restrictions here:
 * https://github.com/joyent/manta-buckets-api/blob/master/docs/index.md#restrictions
 */
var VALID_BUCKET_NAMES = [
    '172.25.1234.1',

    'node-manta-has-hyphens',

    // 3 characters min
    'abc',

    // 63 characters max
    'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijk'
];

var INVALID_BUCKET_NAMES = [
    '1.1.1.1',
    '999.999.999.999',
    'contains spaces',
    'exclamation point!',

    'check-mark-✔',

    '안녕하세요',

    '-starts-with-hyphen',
    'ends-with-hyphen-',

    'Uppercase-Letters',

    'nul\u0000byte',

    // 2 characters (too short)
    'ab',

    // 64 characters (too long)
    'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijkl'
];

/*
 * Valid and invalid object names. See restrictions here:
 * https://github.com/joyent/manta-buckets-api/blob/master/docs/index.md#restrictions-1
 */

// string that is the maximum allowed size.
var maxBytesString = new Array(1024 + 1).join('a');

// string that is below the maximum allowed size in character count, but above
// it in bytes.  generated via http://generator.lorem-ipsum.info/_korean
/* JSSTYLED */
var wideString = '대통령은 국민의 보통·평등·직접·비밀선거에 의하여 선출한다. 국가는 청원에 대하여 심사할 의무를 진다. 헌법개정안은 국회가 의결한 후 30일 이내에 국민투표에 붙여 국회의원선거권자 과반수의 투표와 투표자 과반수의 찬성을 얻어야 한다. 국민의 모든 자유와 권리는 국가안전보장·질서유지 또는 공공복리를 위하여 필요한 경우에 한하여 법률로써 제한할 수 있으며. 대통령은 국민의 보통·평등·직접·비밀선거에 의하여 선출한다. 국가는 청원에 대하여 심사할 의무를 진다. 헌법개정안은 국회가 의결한 후 30일 이내에 국민투표에 붙여 국회의원선거권자 과반수의 투표와 투표자 과반수의 찬성을 얻어야 한다. 국민의 모든 자유와 권리는 국가안전보장·질서유지 또는 공공복리를 위하여 필요한 경우에 한하여 법률로써 제한할 수 있으며. 대통령은 국민의 보통·평등·직접·비밀선거에 의하여 선출한다. 국가는 청원에 대하여 심사할 의무를 진다. 헌법개정안은 국회가 의결한 후 30일 이내에 국민투표에 붙여 국회의원선거권자 과반수의 투표와 투표자 과반수의 찬성을 얻어야 한다. 국민의 모든 자유와 권리는 국가안전보장·질서유지 또는 공공복리를 위하여 필요한 경우에 한하여 법률로써 제한할 수 있으며.';
assert.ok(wideString.length <= 1024);
assert.ok(Buffer.byteLength(wideString) > 1024);

var VALID_OBJECT_NAMES = [
    'foo',
    'bar',
    'check-mark-✔',
    '안녕하세요',
    maxBytesString
];

// 1024 bytes max

var INVALID_OBJECT_NAMES = [
    'nul\u0000byte',
    wideString,
    maxBytesString + 'a'
];

/*
 * Valid and invalid query parameters to listBuckets
 * https://github.com/joyent/manta-buckets-api/blob/master/docs/index.md#query-parameters
 */
var VALID_LIST_BUCKETS_QUERY_OPTS = [
    // any unset options will assume defaults by node-manta
    {},
    { limit: 100 },
    { limit: 1, delimiter: '/' },
    { limit: 5, delimiter: '-', prefix: 'foo' },
    { limit: 10, delimiter: '_', prefix: 'bar', marker: 'abc' }
];

var INVALID_LIST_BUCKETS_QUERY_OPTS = [
    { limit: -1 },
    { limit: 0 },
    { limit: 1025 },
    { limit: 'foo' },
    { limit: false },

    { delimiter: -1 },
    { delimiter: false },
    { delimiter: 'AB' },

    // since "marker" and "prefix" are just strings, they can't be effectively
    // tested.  Any non-string data type will appear as a string after being
    // stringified as query parameters.
];

/*
 * Valid and invalid query parameters to listBuckets
 * https://github.com/joyent/manta-buckets-api/blob/master/docs/index.md#query-parameters--pagination
 */

// The logic to list objects is identical to the logic to list objects.  as
// such, all tests are merely copied.
var VALID_LIST_OBJECTS_QUERY_OPTS = VALID_LIST_BUCKETS_QUERY_OPTS;
var INVALID_LIST_OBJECTS_QUERY_OPTS = INVALID_LIST_BUCKETS_QUERY_OPTS;

/*
 * Tests
 */

test('buckets client validation', testOpts, function (suite) {
    var client;

    test('setup client', function (t) {
        var clientOpts = {
            log: log,
            klass: buckets.MantaBucketsClient
        };
        client = manta.createBinClient(clientOpts);

        t.end();
    });

    VALID_BUCKET_NAMES.forEach(function (bucket_name) {
        test(f('valid bucket (%j)', bucket_name), function (t) {
            client.createBucket(bucket_name, function (err) {
                t.ifError(err);

                // delete the bucket immediately
                client.deleteBucket(bucket_name, function (err2) {
                    t.ifError(err2);
                    t.end();
                });
            });
        });
    });

    INVALID_BUCKET_NAMES.forEach(function (bucket_name) {
        test(f('invalid bucket (%j)', bucket_name), function (t) {
            client.createBucket(bucket_name, function (err) {
                t.ok(err, f('error: %s', err && err.name));
                t.end();
            });
        });
    });

    VALID_LIST_BUCKETS_QUERY_OPTS.forEach(function (query_opts) {
        test(f('validating list buckets: %j', query_opts), function (t) {
            var s = client.createListBucketsStream({query: query_opts});

            s.on('readable', function onReadable() {
                while (s.read() !== null) {
                    // exhaust the stream
                }
            });

            s.once('error', function onError(err) {
                t.ifError(err);
                t.end();
            });

            s.once('end', function onEnd() {
                t.ok(true, 'end seen');
                t.end();
            });
        });
    });

    INVALID_LIST_BUCKETS_QUERY_OPTS.forEach(function (query_opts) {
        test(f('validating invalid list buckets: %j', query_opts),
            function (t) {

            var s;

            try {
                s = client.createListBucketsStream({query: query_opts});
            } catch (e) {
                t.ok(e, f('error in client validation: %s', e.message));
                t.end();
                return;
            }

            s.on('readable', function onReadable() {
                while (s.read() !== null) {
                    // exhaust the stream
                }
            });

            s.once('error', function onError(err) {
                t.ok(err, 'error seen: ' + err.message);
                t.end();
            });

            s.once('end', function onEnd() {
                // shouldn't be reached
                t.ok(false, 'end seen');
                t.end();
            });
        });
    });

    test('creating bucket for object testing', function (t) {
        client.createBucket(BUCKET_NAME, function (err) {
            t.ifError(err);
            t.end();
        });
    });

    VALID_OBJECT_NAMES.forEach(function (object_name) {
        test(f('valid object (%j)', object_name), function (t) {
            client.createBucketObject(emptyStream(), BUCKET_NAME,
                object_name, {}, function (err) {

                t.ifError(err);

                // delete the object immediately
                client.deleteBucketObject(BUCKET_NAME, object_name,
                    function (err2) {

                    t.ifError(err2);
                    t.end();
                });
            });
        });
    });

    INVALID_OBJECT_NAMES.forEach(function (object_name) {
        test(f('invalid object (%j)', object_name), function (t) {
            client.createBucketObject(emptyStream(), BUCKET_NAME,
                object_name, {}, function (err) {

                t.ok(err, f('error: %s', err && err.name));
                t.end();
            });
        });
    });

    VALID_LIST_OBJECTS_QUERY_OPTS.forEach(function (query_opts) {
        test(f('validating list objects: %j', query_opts), function (t) {
            var s = client.createListBucketObjectsStream(BUCKET_NAME,
                {query: query_opts});

            s.on('readable', function onReadable() {
                while (s.read() !== null) {
                    // exhaust the stream
                }
            });

            s.once('error', function onError(err) {
                t.ifError(err);
                t.end();
            });

            s.once('end', function onEnd() {
                t.ok(true, 'end seen');
                t.end();
            });
        });
    });

    INVALID_LIST_OBJECTS_QUERY_OPTS.forEach(function (query_opts) {
        test(f('validating invalid list objects: %j', query_opts),
            function (t) {

            var s;

            try {
                s = client.createListBucketObjectsStream(BUCKET_NAME,
                    {query: query_opts});
            } catch (e) {
                t.ok(e, f('error in client validation: %s', e.message));
                t.end();
                return;
            }

            s.on('readable', function onReadable() {
                while (s.read() !== null) {
                    // exhaust the stream
                }
            });

            s.once('error', function onError(err) {
                t.ok(err, 'error seen: ' + err.message);
                t.end();
            });

            s.once('end', function onEnd() {
                // shouldn't be reached
                t.ok(false, 'end seen');
                t.end();
            });
        });
    });

    test('removing bucket for object testing', function (t) {
        client.deleteBucket(BUCKET_NAME, function (err) {
            t.ifError(err);
            t.end();
        });
    });

    test('accessing object in removed bucket', function (t) {
        // this should fail as the containing bucket was removed
        client.getBucketObject(BUCKET_NAME, 'foo',
            function (err, stream, res) {

            t.ok(err, f('error in accessing removed bucket: %s', err.message));
            t.end();
        });
    });

    test('listing removed bucket', function (t) {
        // this should fail as the containing bucket was removed
        var s = client.createListBucketObjectsStream(BUCKET_NAME, {});

        s.on('readable', function onReadable() {
            while (s.read() !== null) {
                // exhaust the stream if received
            }
        });

        s.once('error', function onError(err) {
            t.ok(err, f('error seen listing removed bucket: %s', err.message));
            t.end();
        });

        s.once('end', function onEnd() {
            // shouldn't be reached
            t.ok(false, 'end seen');
            t.end();
        });
    });

    test('teardown', function (t) {
        if (client) {
            client.close();
        }
        t.end();
    });

    suite.end();
});

/*
 * Copyright 2020 Joyent, Inc.
 */

/*
 * Test bucket endpoints for proper validation of inputs
 */

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
var maxBytesString = new Array(1024 + 1).join('a');

var VALID_OBJECT_NAMES = [
    'foo',
    'bar',
    maxBytesString
];

// 1024 bytes max

var INVALID_OBJECT_NAMES = [
    'nul\u0000byte',
    maxBytesString + 'a'
];

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

    test('isBucketsSupported', function (t) {
        client.isBucketsSupported(function (err, isSupported) {
            t.ifError(err);
            t.ok(isSupported, 'isSupported');
            t.end();
        });
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

    test('removing bucket for object testing', function (t) {
        client.deleteBucket(BUCKET_NAME, function (err) {
            t.ifError(err);
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

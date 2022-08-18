/*
 * Copyright 2019 Joyent, Inc.
 * Copyright 2022 MNX Cloud, Inc.
 */

var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');

var libuuid = require('uuid');
var MemoryStream = require('readable-stream/passthrough.js');
var bunyan = require('bunyan');
var format = require('util').format;
var test = require('tap').test;
var vasync = require('vasync');

var logging = require('../lib/logging');
var manta = require('../../lib');


/*
 * Globals
 */

var client;
var log = logging.createLogger();

var ROOT = '/' + (process.env.MANTA_USER || 'admin') + '/stor';
var PUBLIC = '/' + (process.env.MANTA_USER || 'admin') + '/public';
var TSTDIR = ROOT + '/node-manta-test-muntar-' + libuuid.v4().split('-')[0];


/*
 * Tests
 */

test('setup', function (t) {
    var url = process.env.MANTA_URL || 'http://localhost:8080';
    var user = process.env.MANTA_USER || 'admin';

    function createClient(signer) {
        // `client` is intentionally global.
        client = manta.createClient({
            connectTimeout: 1000,
            log: log,
            rejectUnauthorized: (process.env.MANTA_TLS_INSECURE ?
                                    false : true),
            sign: signer,
            url: url,
            user: user
        });

        t.end();
    }

    if (process.env.MANTA_KEY_ID) {
        createClient(manta.cliSigner({
            user: user,
            keyId: process.env.MANTA_KEY_ID
        }));
    } else {
        var f = process.env.SSH_KEY || process.env.HOME + '/.ssh/id_rsa';
        var cmd = 'ssh-keygen -l -f ' +
            f + ' ' +
            '| awk \'{print $2}\'';
        fs.readFile(f, 'utf8', function (err, key) {
            if (err) {
                t.error(err);
                t.end();
                return;
            }

            exec(cmd, function (err2, stdout, stderr) {
                if (err2) {
                    t.error(err2);
                    t.end();
                    return;
                }
                createClient(manta.privateKeySigner({
                    key: key,
                    keyId: stdout.replace('\n', ''),
                    user: user
                }));
            });
        });
    }
});


var cases = [
    {
        tarpath: 'corpus/tar1.tar',
        checks: [
            {
                path: 'subdir1/',
                type: 'application/x-json-stream; type=directory'
            },
            {
                path: 'subdir1/test.txt',
                type: 'text/plain',
                size: 24,
                md5: 'jio1WnSoM7CbsXjNHfTqwg=='
            },
            {
                path: 'test.txt',
                type: 'text/plain',
                size: 20,
                md5: 'c6scKv46Y7irTX2ipN2zUQ=='
            }
        ]
    },
    {
        // Skipping, see
        // <https://github.com/TritonDataCenter/node-manta/issues/259>
        skip: true,
        tarpath: 'corpus/259-emptydir.tar',
        checks: [
            { path: 'emptydir/', type: 'directory' }
        ]
    }
];

cases.forEach(function (c, i) {
    if (c.skip) {
        return;
    }

    var name = format('muntar case %d: %s', i, c.tarpath);
    var cmd = format('%s -f %s %s', path.resolve(__dirname, '../../bin/muntar'),
        path.resolve(__dirname, c.tarpath), TSTDIR);
    log.debug({caseName: name, cmd: cmd}, 'run case');

    test(name, function (t) {
        exec(cmd, function (err, stdout, stderr) {
            t.ifError(err);
            vasync.forEachPipeline({
                func: function checkOne(check, cb) {
                    var mpath = path.join(TSTDIR, check.path);
                    client.info(mpath, function (err2, info) {
                        t.ifError(err2, err2);
                        if (!err2) {
                            t.equal(info.type, check.type, format(
                                '%s is expected type (%s): %s',
                                mpath, check.type, info.type));
                            if (check.size) {
                                t.equal(info.size, check.size, format(
                                    '%s is expected size (%s): %s',
                                    mpath, check.size, info.size));
                            }
                            if (check.md5) {
                                t.equal(info.md5, check.md5, format(
                                    '%s is expected md5 (%s): %s',
                                    mpath, check.md5, info.md5));
                            }
                        }
                        cb();
                    });
                },
                inputs: c.checks
            }, function (err3, results) {
                client.rmr(TSTDIR, function (rmErr) {
                    t.ifError(rmErr, rmErr);
                    t.end();
                });
            });
        });
    });
});


test('teardown', function (t) {
    if (client) {
        client.close();
        client = null;
    }
    t.end();
});

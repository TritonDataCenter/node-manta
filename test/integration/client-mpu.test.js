/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * Testing the client MPU-related methods
 */

var exec = require('child_process').exec;
var crypto = require('crypto');
var fs = require('fs');

var jsprim = require('jsprim');
var libuuid = require('uuid');
var MemoryStream = require('readable-stream/passthrough.js');
var test = require('tap').test;

var logging = require('../lib/logging');
var testutils = require('../lib/utils');
var manta = require('../../lib');


/*
 * Globals
 */

var client;
var log = logging.createLogger();

var ROOT = '/' + (process.env.MANTA_USER || 'admin') + '/stor';
var UPLOAD1; // committed upload
var UPLOAD2; // aborted upload
var PATH1 = ROOT + '/committed-obj';
var PATH2 = ROOT + '/aborted-obj';
var PATH3 = ROOT + '/#311-test';
var ETAGS1 = [];

var testOpts = {
    skip: !testutils.isMpuEnabledSync(log) &&
        'this Manta does not support multipart upload (MPU)'
};


/*
 * Tests
 */

test('mpu client usage', testOpts, function (suite) {

    suite.test('setup', function (t) {
        var url = process.env.MANTA_URL || 'http://localhost:8080';
        var user = process.env.MANTA_USER || 'admin';

        function createClient(signer) {
            // `client` is intentionally global.
            client = manta.createClient({
                connectTimeout: 1000,
                log: log,
                rejectUnauthorized: !process.env.MANTA_TLS_INSECURE,
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


    suite.test('create upload', function (t) {
        var opts = {
            account: client.user
        };

        client.createUpload(PATH1, opts, function (err, obj) {
            t.ifError(err);
            if (err) {
                t.end();
                return;
            }

            t.ok(obj);
            t.ok(obj.id);
            UPLOAD1 = obj.id;
            t.end();
        });
    });

    suite.test('upload part', function (t) {
        var text = 'The lazy brown fox \nsomething \nsomething foo';
        var stream = new MemoryStream();
        var opts = {
            account: client.user,
            md5: crypto.createHash('md5').update(text).digest('base64'),
            size: Buffer.byteLength(text),
            type: 'text/plain'
        };

        var pn = 0;
        client.uploadPart(stream, UPLOAD1, pn, opts, function (err, res) {
            t.ifError(err);
            if (err) {
                t.end();
                return;
            }

            t.ok(res);
            t.ok(res.headers && res.headers.etag);
            ETAGS1[pn] = res.headers.etag;
            t.end();
        });

        setImmediate(function () {
            stream.write(text);
            stream.end();
        });
    });

    suite.test('get upload', function (t) {
        var opts = {
            account: client.user
        };

        client.getUpload(UPLOAD1, opts, function (err, upload) {
            t.ifError(err);
            if (err) {
                t.end();
                return;
            }

            t.ok(upload);
            t.equal(upload.id, UPLOAD1);
            t.equal(upload.state, 'created');
            t.end();
        });
    });

    suite.test('commit upload', function (t) {
        var opts = {
            account: client.user
        };

        client.commitUpload(UPLOAD1, ETAGS1, opts, function (err, res) {
            t.ifError(err);
            if (err) {
                t.end();
                return;
            }
            t.ok(res);
            t.equal(res.statusCode, 201);
            client.getUpload(UPLOAD1, opts, function (err2, upload) {
                t.ifError(err2);
                if (err2) {
                    t.end();
                    return;
                }
                t.ok(upload);
                t.equal(upload.id, UPLOAD1);
                t.equal(upload.state, 'done');
                t.equal(upload.result, 'committed');

                client.get(PATH1, function (err3, stream) {
                    t.ifError(err3);
                    if (err3) {
                        t.end();
                        return;
                    }

                    var text = 'The lazy brown fox \nsomething \nsomething foo';
                    var data = '';
                    stream.setEncoding('utf8');
                    stream.on('data', function (chunk) {
                        data += chunk;
                    });
                    stream.on('end', function (chunk) {
                        t.equal(data, text);

                        client.unlink(PATH1, opts, function (err4) {
                            t.ifError(err4);
                            t.end();
                        });
                    });
                });
            });
        });
    });

    suite.test('errant commit upload returns undefined res', function (t) {
        var opts = {
            account: client.user
        };
        client.commitUpload(libuuid.v4(), ETAGS1, opts, function (err, res) {
            t.ok(err);
            t.ok(res === undefined);
            t.end();
        });
    });

    suite.test('abort upload', function (t) {
        var opts = {
            account: client.user
        };

        client.createUpload(PATH2, opts, function (err, obj) {
            t.ifError(err);
            if (err) {
                t.end();
                return;
            }

            t.ok(obj);
            t.ok(obj.id);
            UPLOAD2 = obj.id;

            client.abortUpload(UPLOAD2, opts, function (err2) {
                t.ifError(err2);
                if (err2) {
                    t.end();
                    return;
                }
                client.getUpload(UPLOAD2, opts, function (err3, upload) {
                    t.ifError(err3);
                    if (err3) {
                        t.end();
                        return;
                    }
                    t.ok(upload);
                    t.equal(upload.id, UPLOAD2);
                    t.equal(upload.state, 'done');
                    t.equal(upload.result, 'aborted');

                    t.end();
                });
            });
        });
    });

    suite.test('#311: create upload with special headers', function (t) {
        /*
         * Test adding some headers to the target object that are also parsed by
         * the Manta client, to ensure the headers for the target object are
         * sent in the body of the `mpu-create` request, not as headers on the
         * request itself.
         */
        var headers = {
            'accept':  'acceptstring',
            'role': 'rolestring',
            'content-length': 10,
            'content-md5': 'md5string',
            'content-type': 'text/plain',
            'expect': '100-continue',
            'location': 'locationstring',
            'x-request-id': 'requestidstring'
        };

        var createOpts = {
            account: client.user,
            headers: headers
        };

        client.createUpload(PATH3, createOpts, function (err, obj) {
            t.ifError(err);
            if (err) {
                t.end();
                return;
            }

            t.ok(obj);
            t.ok(obj.id);
            var id = obj.id;

            var getOpts = {
                account: client.user
            };
            client.getUpload(id, getOpts, function (err2, upload) {
                t.ifError(err2);
                if (err2) {
                    t.end();
                    return;
                }

                t.ok(upload);
                t.equal(upload.id, id);
                t.ok(upload.headers);
                t.ok(jsprim.deepEqual(headers, upload.headers));

                var abortOpts = {
                    account: client.user
                };
                client.abortUpload(id, abortOpts, function (err3) {
                    t.ifError(err3);
                    if (err3) {
                        t.end();
                        return;
                    }
                    t.end();
                });
            });
        });
    });

    suite.test('teardown', function (t) {
        if (client) {
            client.close();
            client = null;
        }
        t.end();
    });

    suite.end();
});

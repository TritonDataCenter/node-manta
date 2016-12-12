// Copyright 2017 Joyent, Inc.

var MemoryStream = require('readable-stream/passthrough.js');
var cse = require('../lib/cse');


// Only GCM encryption supported after node v1.0.0
var NODE_MAJOR = parseInt(process.versions.node.split('.')[0], 10);


function test(name, testfunc) {
    module.exports[name] = testfunc;
}


test('isSupported() returns false for invalid versions', function (t) {
    var versions = [
        '',
        null,
        'client/0',
        'client/0.',
        'client/b.b',
        'client/'
    ];

    versions.forEach(function (version) {
        t.ok(!cse.isSupported({ 'm-encrypt-type': version }));
    });
    t.done();
});


test('isSupported() returns true for valid versions', function (t) {
    var versions = [
        'client/1'
    ];

    versions.forEach(function (version) {
        t.ok(cse.isSupported({ 'm-encrypt-type': version }));
    });
    t.done();
});


test('encrypt() throws with missing options', function (t) {
    var input = new MemoryStream();

    t.throws(function () {
        cse.encrypt(null, input, function (err, res) {

        });
    }, /options \(object\) is required/);

    t.done();
});


test('encrypt() throws with unsupported cipher alg', function (t) {
    var options = {
        key: 'FFFFFFFBD96783C6C91E222211112222',
        cipher: 'AES/CFB/NoPadding',
        keyId: 'something',
        headers: {}
    };
    var input = new MemoryStream();

    t.throws(function () {
        cse.encrypt(options, input, function (err, res) {

        });
    }, /Unsupported cipher algorithm/);

    t.done();
});

test('encrypt() throws with alg "toString"', function (t) {
    var options = {
        key: 'FFFFFFFBD96783C6C91E222211112222',
        cipher: 'toString',
        keyId: 'something',
        headers: {}
    };
    var input = new MemoryStream();

    t.throws(function () {
        cse.encrypt(options, input, function (err, res) {

        });
    }, /Unsupported cipher algorithm/);

    t.done();
});

test('encrypt() throws with invalid key length', function (t) {
    var options = {
        key: 'FFFFFF',
        cipher: 'AES256/CTR/NoPadding',
        keyId: 'something',
        headers: {}
    };
    var input = new MemoryStream();

    t.throws(function () {
        cse.encrypt(options, input, function (err, res) {

        });
    }, /key size must be/);

    t.done();
});

test('encrypt() throws with invalid input', function (t) {
    var options = {
        key: 'FFFFFFFBD96783C6C91E222211112222',
        keyId: 'dev/test',
        cipher: 'AES256/CTR/NoPadding',
        headers: {}
    };

    t.throws(function () {
        cse.encrypt(options, null, function (err, res) {

        });
    }, /input \(stream\) is required/);

    t.done();
});

test('encrypt() works for aes256 algorithm', function (t) {
    var options = {
        key: (new Buffer(32).fill('1')).toString(),
        keyId: 'dev/test',
        cipher: 'AES256/CTR/NoPadding',
        headers: {
            'e-header': 'my value'
        }
    };
    var inputText = 'this is my text';
    var input = new MemoryStream();
    input.write(inputText);

    cse.encrypt(options, input, function (err, output) {
        t.ifError(err);
        input.end();

        var result = '';
        output.on('data', function (data) {
            result += data.toString();
        });

        output.on('error', function (outErr) {
            t.ifError(outErr);
        });

        output.once('end', function () {
            t.ok(result !== inputText);
            t.ok(options.headers['m-encrypt-hmac-type'] === 'HmacSHA256');
            t.ok(options.headers['m-encrypt-cipher'] ===
                'AES256/CTR/NoPadding');
            t.ok(options.headers['m-encrypt-iv']);
            t.ok(options.headers['m-encrypt-key-id'] === options.keyId);
            t.ok(options.headers['m-encrypt-metadata']);
            t.ok(options.headers['m-encrypt-metadata-hmac']);
            t.ok(options.headers['m-encrypt-metadata-iv']);
            t.done();
        });
    });
});

if (NODE_MAJOR) {
    test('encrypt() works for aes256-gcm algorithm', function (t) {
        var options = {
            key: (new Buffer(32).fill('1')).toString(),
            keyId: 'dev/test',
            cipher: 'AES256/GCM/NoPadding',
            headers: {
                'e-header': 'my value'
            }
        };
        var inputText = 'this is my text';
        var input = new MemoryStream();
        input.write(inputText);

        cse.encrypt(options, input, function (err, output) {
            t.ifError(err);
            input.end();

            var result = '';
            output.on('data', function (data) {
                result += data.toString();
            });

            output.on('error', function (outErr) {
                t.ifError(outErr);
            });

            output.once('end', function () {
                t.ok(result !== inputText);
                t.ok(!options.headers['m-encrypt-hmac-type']);
                t.ok(options.headers['m-encrypt-cipher'] ===
                    'AES256/GCM/NoPadding');
                t.ok(options.headers['m-encrypt-iv']);
                t.ok(options.headers['m-encrypt-key-id'] === options.keyId);
                t.ok(options.headers['m-encrypt-aead-tag-length'] === 16);
                t.ok(options.headers['m-encrypt-metadata']);
                t.ok(!options.headers['m-encrypt-metadata-hmac']);
                t.ok(options.headers['m-encrypt-metadata-aead-tag-length']);
                t.done();
            });
        });
    });
}

test('decrypt() throws with missing options', function (t) {
    var input = new MemoryStream();

    t.throws(function () {
        cse.decrypt(null, input, { headers: {} }, function (err, res) {

        });
    }, /options \(object\) is required/);

    t.done();
});

test('decrypt() throws with missing options.encrypt.getKey', function (t) {
    var input = new MemoryStream();

    t.throws(function () {
        cse.decrypt({}, input, { headers: {} }, function (err, res) {

        });
    }, /options\.getKey \(func\) is required/);

    t.done();
});

test('decrypt() throws with invalid input', function (t) {
    var options = {
        cse_getKey: function (keyId, cb) {
            cb();
        }
    };

    t.throws(function () {
        cse.decrypt(options, null, { headers: {} }, function (err, res) {

        });
    }, /encrypted \(stream\) is required/);

    t.done();
});

test('decrypt() works for aes256-ctr algorithm', function (t) {
    var key = (new Buffer(32).fill('1')).toString();

    var getKey = function (keyId, cb) {
        cb(null, key);
    };
    var inputText = 'this is my text';
    var options = {
        key: key,
        keyId: 'dev/test',
        cipher: 'AES256/CTR/NoPadding',
        headers: {
            'e-header': 'my value',
            'content-length': Buffer.byteLength(new Buffer(inputText))
        }
    };

    var input = new MemoryStream();
    input.write(inputText);

    cse.encrypt(options, input, function (encErr, encrypted) {
        t.ifError(encErr);
        input.end();

        var passthrough = new MemoryStream();

        encrypted.once('end', function () {
            var res = {
                headers: options.headers
            };
            t.ok(options.headers['m-encrypt-metadata']);

            cse.decrypt({ getKey: getKey }, passthrough, res, function (decErr,
                decrypted, decRes) {

                t.ifError(decErr);

                var result = '';
                decrypted.on('data', function (data) {
                    result += data.toString();
                });

                decrypted.on('error', function (outErr) {
                    t.ifError(outErr);
                });

                decrypted.once('end', function () {
                    t.ok(result === inputText);
                    t.ok(decRes.headers['e-header'] === 'my value');
                    t.done();
                });
            });
        });

        encrypted.pipe(passthrough);
    });
});

test('decrypt() works for aes256-cbc algorithm', function (t) {
    var key = (new Buffer(32).fill('1')).toString();

    var inputText = 'this is my text here';

    var getKey = function (keyId, cb) {
        cb(null, key);
    };
    var options = {
        key: key,
        keyId: 'dev/test',
        cipher: 'AES256/CBC/PKCS5Padding',
        headers: {
            'e-header': 'my value',
            'content-length': Buffer.byteLength(new Buffer(inputText))
        }
    };
    var input = new MemoryStream();
    input.write(inputText);

    cse.encrypt(options, input, function (encErr, encrypted) {
        t.ifError(encErr);
        input.end();

        var passthrough = new MemoryStream();

        encrypted.once('end', function () {
            var res = {
                headers: options.headers
            };

            t.ok(options.headers['m-encrypt-metadata']);

            cse.decrypt({ getKey: getKey }, passthrough, res, function (decErr,
                decrypted, decRes) {

                t.ifError(decErr);

                var result = '';
                decrypted.on('data', function (data) {
                    result += data.toString();
                });

                decrypted.on('error', function (outErr) {
                    t.ifError(outErr);
                });

                decrypted.once('end', function () {
                    t.ok(result === inputText);
                    t.ok(decRes.headers['e-header'] === 'my value');
                    t.done();
                });
            });
        });

        encrypted.pipe(passthrough);
    });
});

if (NODE_MAJOR) {
    test('decrypt() works for aes256-gcm algorithm', function (t) {
        var key = (new Buffer(32).fill('1')).toString();

        var getKey = function (keyId, cb) {
            cb(null, key);
        };
        var options = {
            key: key,
            keyId: 'dev/test',
            cipher: 'AES256/GCM/NoPadding',
            headers: {
                'e-header': 'my value'
            }
        };
        var inputText = 'this is my text';
        var input = new MemoryStream();
        input.write(inputText);

        cse.encrypt(options, input, function (encErr, encrypted) {
            t.ifError(encErr);
            input.end();

            var passthrough = new MemoryStream();
            var bytes = 0;

            encrypted.on('data', function (data) {
                bytes += Buffer.byteLength(data);
            });

            passthrough.once('finish', function () {
                var res = {
                    headers: options.headers
                };
                res.headers['content-length'] = bytes;
                t.ok(options.headers['m-encrypt-metadata']);

                cse.decrypt({ getKey: getKey }, passthrough, res,
                    function (decErr, decrypted, decRes) {

                    t.ifError(decErr);
                    var result = '';
                    decrypted.on('data', function (data) {
                        result += data.toString();
                    });

                    decrypted.on('error', function (outErr) {
                        t.ifError(outErr);
                    });

                    decrypted.once('end', function () {
                        t.ok(result === inputText);
                        t.ok(decRes.headers['e-header'] === 'my value');
                        t.done();
                    });
                });
            });

            encrypted.pipe(passthrough);
        });
    });
}

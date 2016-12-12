// Copyright 2017 Joyent, Inc.

var MemoryStream = require('readable-stream/passthrough.js');
var ParseEtMStream = require('../lib/parse_etm_stream');


function test(name, testfunc) {
    module.exports[name] = testfunc;
}


test('splits a digest from the parse_etm stream', function (t) {
    var inputCipher = new Buffer(50);
    var inputDigest = new Buffer(32);
    inputCipher.fill('3');
    inputDigest.fill('4');

    var input = new MemoryStream();
    var output = new ParseEtMStream({ bytes: 32 },
        Buffer.byteLength(inputCipher) + Buffer.byteLength(inputDigest));

    var cipher = new Buffer('');
    output.on('data', function (data) {
        cipher = Buffer.concat([cipher, data]);
    });

    output.once('end', function () {
        t.equal(cipher.toString(), inputCipher.toString());
        t.equal(output.digest().toString(), inputDigest.toString());
        t.done();
    });

    input.pipe(output);
    input.write(inputCipher);
    input.write(inputDigest);
});


test('splits a multi-chunk digest from the parse_etm stream', function (t) {
    var inputCipher = new Buffer(50);
    var inputDigest1 = new Buffer(16);
    var inputDigest2 = new Buffer(16);
    inputCipher.fill('3');
    inputDigest1.fill('4');
    inputDigest2.fill('4');

    var input = new MemoryStream();
    var output = new ParseEtMStream({ bytes: 32 },
        Buffer.byteLength(inputCipher) + Buffer.byteLength(inputDigest1) +
        Buffer.byteLength(inputDigest2));

    var cipher = new Buffer('');
    output.on('data', function (data) {
        cipher = Buffer.concat([cipher, data]);
    });

    output.once('end', function () {
        t.equal(cipher.toString(), inputCipher.toString());
        t.equal(output.digest().toString(), inputDigest1.toString() +
            inputDigest2.toString());
        t.done();
    });

    input.pipe(output);
    input.write(inputCipher);
    input.write(inputDigest1);
    input.write(inputDigest2);
});

test('splits a multi-chunk digest from multi-chunk cipher', function (t) {
    var inputCipher1 = new Buffer(50);
    var inputCipher2 = new Buffer(50);
    var inputDigest1 = new Buffer(16);
    var inputDigest2 = new Buffer(16);
    inputCipher1.fill('3');
    inputCipher2.fill('3');
    inputDigest1.fill('4');
    inputDigest2.fill('4');

    var input = new MemoryStream();
    var output = new ParseEtMStream({ bytes: 32 },
        Buffer.byteLength(inputCipher1) + Buffer.byteLength(inputCipher2) +
        Buffer.byteLength(inputDigest1) + Buffer.byteLength(inputDigest2));

    var cipher = new Buffer('');
    output.on('data', function (data) {
        cipher = Buffer.concat([cipher, data]);
    });

    output.once('end', function () {
        t.equal(cipher.toString(), inputCipher1.toString() +
            inputCipher2.toString());
        t.equal(output.digest().toString(), inputDigest1.toString() +
            inputDigest2.toString());
        t.done();
    });

    input.pipe(output);
    input.write(inputCipher1);
    input.write(inputCipher2);
    input.write(inputDigest1);
    input.write(inputDigest2);
});

test('splits a multi-chunk tag from chunked cipher', function (t) {
    var inputCipher1 = new Buffer(50);
    var inputCipher2 = new Buffer(50);
    var inputTag = new Buffer(16);
    inputCipher1.fill('3');
    inputCipher2.fill('3');
    inputTag.fill('4');

    var input = new MemoryStream();
    var output = new ParseEtMStream({ bytes: 32 },
        Buffer.byteLength(inputCipher1) + Buffer.byteLength(inputCipher2) +
        Buffer.byteLength(inputTag), 16);

    var cipher = new Buffer('');
    output.on('data', function (data) {
        cipher = Buffer.concat([cipher, data]);
    });

    output.once('end', function () {
        t.equal(cipher.toString(), inputCipher1.toString() +
            inputCipher2.toString());
        t.equal(output.tag().toString(), inputTag.toString());
        t.done();
    });

    input.pipe(output);
    input.write(inputCipher1);
    input.write(inputCipher2);
    input.write(inputTag);
});

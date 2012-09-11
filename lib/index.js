// Copyright (c) 2012, Joyent, Inc. All rights reserved.

var crypto = require('crypto');

var assert = require('assert-plus');
var bunyan = require('bunyan');
var clone = require('clone');
var restify = require('restify');

var MantaClient = require('./client');



///--- API

function privateKeySigner(options) {
        assert.object(options, 'options');
        assert.string(options.keyId, 'options.keyId');
        assert.string(options.key, 'options.key');
        assert.string(options.user, 'options.user');

        var algorithm = / DSA /.test(options.key) ? 'DSA-SHA1' : 'RSA-SHA256';
        var opts = clone(options);

        function sign(date, cb) {
                assert.string(date, 'date');
                assert.func(cb, 'callback');

                var signer = crypto.createSign(algorithm);
                signer.update(date);
                var res = {
                        algorithm: algorithm.toLowerCase(),
                        keyId: opts.keyId,
                        signature: signer.sign(opts.key, 'base64'),
                        user: opts.user
                };

                cb(null, res);
        }

        return (sign);
}


function createClient(options) {
        assert.object(options, 'options');
        assert.func(options.sign, 'options.sign');

        var opts = clone(options);
        if (opts.connectTimeout === undefined)
                opts.connectTimeout = 0;

        opts.log = options.log;
        if (!opts.log) {
                opts.log = bunyan.createLogger({
                        name: 'MantaClient',
                        stream: process.stderr,
                        level: 'fatal',
                        serializers: restify.bunyan.serializers
                });
        }
        opts.sign = options.sign;

        return (new MantaClient(options));
}



///--- Exports

module.exports = {
        MantaClient: MantaClient,
        createClient: createClient,
        privateKeySigner: privateKeySigner
};

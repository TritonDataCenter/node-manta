// Copyright (c) 2012, Joyent, Inc. All rights reserved.

var crypto = require('crypto');

var assert = require('assert-plus');
var clone = require('clone');
var SSHAgentClient = require('ssh-agent');


///--- Helpers

function fingerprint(key) {
        var digest;
        var fp = '';
        var hash = crypto.createHash('md5');

        hash.update(new Buffer(key, 'base64'));
        digest = hash.digest('hex');


        for (var i = 0; i < digest.length; i++) {
                if (i && i % 2 === 0)
                        fp += ':';

                fp += digest[i];
        }

        return (fp);
}



///--- API

function privateKeySigner(options) {
        assert.object(options, 'options');
        assert.string(options.keyId, 'options.keyId');
        assert.string(options.key, 'options.key');
        assert.string(options.user, 'options.user');

        var algorithm = / DSA /.test(options.key) ? 'DSA-SHA1' : 'RSA-SHA256';
        var opts = clone(options);

        function sign(str, cb) {
                assert.string(str, 'str');
                assert.func(cb, 'callback');

                var signer = crypto.createSign(algorithm);
                signer.update(str);
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


function sshAgentSigner(options) {
        assert.object(options, 'options');
        assert.object(options.log, 'options.log');
        assert.string(options.keyId, 'options.keyId');
        assert.string(options.user, 'options.user');

        var agent = new SSHAgentClient();
        var log = options.log;
        var keyId = options.keyId;
        var user = options.user;

        function sign(str, cb) {
                assert.string(str, 'string');
                assert.func(cb, 'callback');

                agent.requestIdentities(function (err, keys) {
                        if (err) {
                                log.error(err, 'No ssh-agent keys found');
                                cb(err);
                                return;
                        }

                        var key = (keys || []).filter(function (k) {
                                return (keyId === fingerprint(k.ssh_key));
                        }).pop();

                        if (!key) {
                                log.error('No ssh-agent keys found');
                                cb(new Error('no key ' + keyId +
                                             ' in ssh agent'));
                                return;
                        }

                        var buf = new Buffer(str);
                        agent.sign(key, buf, function (err2, signature) {
                                if (err2) {
                                        log.error(err2, 'unable to sign data');
                                        cb(err2);
                                        return;
                                }

                                /* JSSTYLED */
                                var alg = /.*rsa.*/i.test(signature.type) ?
                                        'rsa-sha1' : 'dsa-sha1';
                                var res = {
                                        algorithm: alg,
                                        keyId: keyId,
                                        signature: signature.signature,
                                        user: user
                                };

                                cb(null, res);
                                return;
                        });

                        return;
                });
        }

        return (sign);
}



///--- Exports

module.exports = {
        privateKeySigner: privateKeySigner,
        sshAgentSigner: sshAgentSigner
};
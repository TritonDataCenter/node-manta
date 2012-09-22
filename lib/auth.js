// Copyright (c) 2012, Joyent, Inc. All rights reserved.

var crypto = require('crypto');
var fs = require('fs');

var assert = require('assert-plus');
var clone = require('clone');
var SSHAgentClient = require('ssh-agent');
var vasync = require('vasync');



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


function loadSSHKey(fp, cb) {
        var p = process.env.HOME + '/.ssh';
        fs.readdir(p, function (err, files) {
                if (err) {
                        cb(err);
                        return;
                }

                var keys = (files || []).filter(function (f) {
                        return (/\.pub$/.test(f));
                });

                if (keys.length === 0) {
                        cb(new Error('no SSH keys in: ' + p));
                        return;
                }

                var done = false;
                var finished = 0;
                function _done(err2, _k) {
                        if (done)
                                return;

                        done = true;
                        if (err2) {
                                cb(err2);
                        } else {
                                fs.readFile(_k, 'utf8', cb);
                        }
                }

                function _checkPublic(fname, err2, blob) {
                        if (err2) {
                                _done(err2);
                        } else if (fingerprint(blob.split(' ')[1]) === fp) {
                                _done(null, fname.split(/\.pub$/)[0]);
                        } else if (++finished === keys.length) {
                                _done(new Error(fp + ' not found in: ' + p));
                        }
                }


                keys.forEach(function (f) {
                        var _p = p + '/' + f;
                        fs.readFile(_p, 'utf8', _checkPublic.bind(null, _p));
                });
        });
}


function sshAgentGetKey(client, fp, cb) {
        assert.object(client, 'sshAgentClient');
        assert.string(fp, 'fingerprint');
        assert.func(cb, 'callback');

        client.requestIdentities(function (err, keys) {
                if (err) {
                        cb(err);
                        return;
                }

                var key = (keys || []).filter(function (k) {
                        // DSA over agent doesn't work
                        if (k.type === 'ssh-dss')
                                return (false);
                        return (fp === fingerprint(k.ssh_key));
                }).pop();

                if (!key) {
                        cb(new Error('no key ' + fp + ' in ssh agent'));
                        return;
                }

                cb(null, key);
        });
}


function sshAgentSign(client, key, data, cb) {
        assert.object(client, 'sshAgentClient');
        assert.object(key, 'key');
        assert.object(data, 'data (Buffer)');
        assert.func(cb, 'callback');

        client.sign(key, data, function (err, signature) {
                if (err) {
                        cb(err);
                        return;
                }

                cb(null, {
                        algorithm: 'rsa-sha1',
                        signature: signature.signature
                });
        });
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

        function sign(str, cb) {
                assert.string(str, 'string');
                assert.func(cb, 'callback');

                sshAgentGetKey(agent, keyId, function (err, key) {
                        if (err) {
                                log.error({
                                        err: err,
                                        keyId: keyId
                                }, 'Unable to load key from ssh-agent');
                                cb(err);
                                return;
                        }

                        var data = new Buffer(str);
                        sshAgentSign(agent, key, data, function (err2, res) {
                                if (err2) {
                                        cb(err2);
                                } else {
                                        res.keyId = keyId;
                                        res.user = options.user;
                                        cb(null, res);
                                }
                        });
                });
        }

        return (sign);
}


function cliSigner(options) {
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

                var arg = {};
                vasync.pipeline({
                        funcs: [
                                function tryAgent(cookie, _cb) {

                                        function __cb(err, key) {
                                                if (err) {
                                                        log.debug({
                                                                err: err
                                                        }, 'key not in agent');
                                                        _cb();
                                                } else {
                                                        log.debug({
                                                                key: key.ssh_key
                                                        }, 'key in agent');
                                                        cookie.key = key;
                                                        _cb();
                                                }
                                        }

                                        log.debug('looking for %s in agent',
                                                  keyId);

                                        sshAgentGetKey(agent, keyId, __cb);
                                },
                                function agentSign(cookie, _cb) {
                                        if (!cookie.key) {
                                                _cb();
                                                return;
                                        }

                                        function __cb(err, res) {
                                                if (err) {
                                                        _cb(err);
                                                } else {
                                                        res.keyId = keyId;
                                                        res.user = options.user;
                                                        cookie.res = res;
                                                        _cb();
                                                }
                                        }

                                        log.debug('signing with agent');

                                        var data = new Buffer(str);
                                        sshAgentSign(agent,
                                                     cookie.key,
                                                     data,
                                                     __cb);
                                },
                                function loadKey(cookie, _cb) {
                                        if (cookie.res) {
                                                _cb();
                                                return;
                                        }

                                        function __cb(err, key) {
                                                if (err) {
                                                        log.debug({
                                                                err: err
                                                        }, 'loading private ' +
                                                                  'key failed');
                                                        _cb(err);
                                                        return;
                                                }

                                                var alg = / DSA /.test(key) ?
                                                        'DSA-SHA1' :
                                                        'RSA-SHA256';
                                                log.debug({
                                                        algorithm: alg
                                                }, 'loaded private key');
                                                cookie.alg = alg;
                                                cookie.key = key;
                                                _cb();
                                        }

                                        log.debug('loading private key');
                                        loadSSHKey(keyId, __cb);
                                },
                                function _sign(c, _cb) {
                                        if (c.res) {
                                                _cb();
                                                return;
                                        }

                                        var s = crypto.createSign(c.alg);
                                        s.update(str);
                                        var sig = s.sign(c.key, 'base64');
                                        c.res = {
                                                algorithm: c.alg.toLowerCase(),
                                                keyId: keyId,
                                                signature: sig,
                                                user: user
                                        };

                                        _cb(null);
                                }
                        ],
                        arg: arg
                }, function (err) {
                        if (err) {
                                cb(err);
                        } else {
                                cb(null, arg.res);
                        }
                });
        }

        return (sign);

}



///--- Exports

module.exports = {
        cliSigner: cliSigner,
        privateKeySigner: privateKeySigner,
        sshAgentSigner: sshAgentSigner
};
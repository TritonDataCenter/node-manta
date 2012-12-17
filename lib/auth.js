// Copyright (c) 2012, Joyent, Inc. All rights reserved.

var crypto = require('crypto');
var EventEmitter = require('events').EventEmitter;
var fs = require('fs');

var assert = require('assert-plus');
var clone = require('clone');
var SSHAgentClient = require('ssh-agent');
var once = require('once');
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
        assert.string(fp, 'fingerprint');
        assert.func(cb, 'callback');

        cb = once(cb);

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


function rfc3986(str) {
        return (encodeURIComponent(str)
                .replace(/[!'()]/g, escape)
                /* JSSTYLED */
                .replace(/\*/g, '%2A'));
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

function createSSHAgent(cb) {
        assert.func(cb, 'callback');

        var agent;
        try {
                agent = new SSHAgentClient();
        } catch (e) {
                cb(e);
                return;
        }

        agent._signCache = {};

        cb(null, agent);
}

function sshAgentSign(client, key, data, cb) {
        assert.object(client, 'sshAgentClient');
        assert.object(client._signCache, 'sshAgentClient');
        assert.object(key, 'key');
        assert.object(data, 'data (Buffer)');
        assert.func(cb, 'callback');
        var c = client._signCache;

        if (c.key === key.comment && c.data &&
            c.data.toString() === data.toString()) {
                if (c.signing) {
                        /*
                         * The cache has been tagged, but is currently being
                         * signed; add our callback to the queue to be serviced
                         * when the call completes.
                         */
                        c.cbs.push({ func: cb, t: this });
                        return;
                }

                if (c.sig) {
                        process.nextTick(cb.bind(this, null, c.sig));
                        return;
                }
        }

        c = {
                key: key.comment,
                data: data,
                signing: true,
                sig: false,
                cbs: [ { func: cb, t: this } ]
        };

        if (!client._signCache.signing)
                client._signCache = c;

        client.sign(key, data, function (err, signature) {
                c.signing = false;
                var cbs = c.cbs;

                if (err) {
                        cbs.forEach(function (_cb) {
                                _cb.func.call(_cb.t, err);
                        });
                        return;
                }

                var sig = {
                        algorithm: 'rsa-sha1',
                        signature: signature.signature
                };

                c.sig = sig;
                cbs.forEach(function (_cb) {
                        _cb.func.call(_cb.t, null, sig);
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
        assert.string(options.keyId, 'options.keyId');
        assert.string(options.user, 'options.user');

        var agent = new SSHAgentClient();
        var keyId = options.keyId;

        function sign(str, cb) {
                assert.string(str, 'string');
                assert.func(cb, 'callback');

                sshAgentGetKey(agent, keyId, function (err, key) {
                        if (err) {
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
        assert.string(options.keyId, 'options.keyId');
        assert.string(options.user, 'options.user');

        var initOpts = new EventEmitter();
        var keyId = options.keyId;
        var user = options.user;

        // This pipeline is to perform setup ahead of time; we don't want to
        // recheck the agent, or reload private keys, etc., if we're in a nested
        // case, like mfind. We use 'initOpts' as a node hack, where we tack
        // what we need on it, but use it as an "lock" if this function is
        // invoked _before_ the setup work is done.
        vasync.pipeline({
                funcs: [
                        function createAgent(opts, cb) {
                                createSSHAgent(function (err, agent) {
                                        if (err) {
                                                cb();
                                                return;
                                        }

                                        opts.agent = agent;
                                        cb();
                                });
                        },

                        function checkAgentForKey(opts, cb) {
                                if (!opts.agent) {
                                        cb();
                                        return;
                                }

                                var a = opts.agent;
                                sshAgentGetKey(a, keyId, function (err, key) {
                                        if (!err) {
                                                opts.key = key;
                                        }
                                        cb();
                                });

                        },

                        function loadKey(opts, cb) {
                                if (opts.key) {
                                        cb();
                                        return;
                                }

                                loadSSHKey(keyId, function (err, key) {
                                        if (err) {
                                                cb(err);
                                                return;
                                        }

                                        var alg = / DSA /.test(key) ?
                                                'DSA-SHA1' :
                                                'RSA-SHA256';
                                        opts.alg = opts.algorithm = alg;
                                        opts.key = key;
                                        cb();
                                });
                        }
                ],
                arg: initOpts
        }, function (err) {
                if (err) {
                        initOpts.emit('error', err);
                        return;
                }

                initOpts.ready = true;
                initOpts.emit('ready');
        });

        function sign(str, callback) {
                assert.string(str, 'string');
                assert.func(callback, 'callback');

                callback = once(callback);

                var arg = {};
                vasync.pipeline({
                        funcs: [
                                function waitForReady(opts, cb) {
                                        cb = once(cb);
                                        if (initOpts.ready) {
                                                cb();
                                                return;
                                        }

                                        initOpts.once('ready', cb);
                                        initOpts.once('error', cb);
                                },


                                function agentSign(opts, cb) {
                                        if (!initOpts.agent || !initOpts.key ||
                                            typeof (initOpts.key) !== 'object')
                                        {
                                                cb();
                                                return;
                                        }


                                        var a = initOpts.agent;
                                        var d = new Buffer(str);
                                        var k = initOpts.key;
                                        sshAgentSign(a, k, d, function (e, s) {
                                                if (e) {
                                                        cb(e);
                                                        return;
                                                }

                                                s.algorithm = 'rsa-sha1';
                                                s.keyId = keyId;
                                                s.user = options.user;
                                                opts.res = s;
                                                cb();
                                        });
                                },

                                function signWithPrivateKey(opts, cb) {
                                        if (opts.res) {
                                                cb();
                                                return;
                                        }

                                        var a = initOpts.algorithm;
                                        var k = initOpts.key;
                                        var s = crypto.createSign(a);
                                        s.update(str);
                                        var sig = s.sign(k, 'base64');
                                        opts.res = {
                                                algorithm: a.toLowerCase(),
                                                keyId: keyId,
                                                signature: sig,
                                                user: user
                                        };

                                        cb();
                                }
                        ],
                        arg: arg
                }, function (err) {
                        callback(err, arg.res);
                });
        }

        return (sign);

}


/**
 * Creates a presigned URL.
 *
 * Invoke with a signing callback (like other client APIs) and the keys/et al
 * needed to actually form a valid presigned request.
 *
 */
function signUrl(opts, cb) {
        assert.object(opts, 'options');
        assert.string(opts.algorithm, 'options.algorith,');
        assert.optionalNumber(opts.expires, 'options.expires');
        assert.string(opts.host, 'options.host,');
        assert.string(opts.keyId, 'options.keyId');
        assert.optionalString(opts.method, 'options.method');
        assert.string(opts.path, 'options.path');
        assert.optionalObject(opts.query, 'options.query');
        assert.func(opts.sign, 'options.sign');
        assert.func(cb, 'callback');

        var q = clone(opts.query || {});
        q.algorithm = opts.algorithm;
        q.expires = (opts.expires ||
                     Math.floor(((Date.now() + (1000 * 300))/1000)));
        q.keyId = '/' + opts.user + '/keys/' + opts.keyId;

        var line =
                (opts.method || 'GET') + '\n' +
                opts.host + '\n' +
                opts.path + '\n';
        var str = Object.keys(q).sort(function (a, b) {
                        return (a.localeCompare(b));
                }).map(function (k) {
                        return (rfc3986(k) + '=' + rfc3986(q[k]));
                }).join('&');
        line += str;

        if (opts.log) {
                opts.log.debug('signUrl: signing -->\n%s', line);
        }
        opts.sign(line, function (err, obj) {
                if (err)
                        return (cb(err));

                var u = opts.path + '?' + str + '&signature=' +
                        rfc3986(obj.signature);

                return (cb(null, u));
        });
}


///--- Exports

module.exports = {
        cliSigner: cliSigner,
        privateKeySigner: privateKeySigner,
        sshAgentSigner: sshAgentSigner,
        loadSSHKey: loadSSHKey,
        signUrl: signUrl
};

// Copyright (c) 2012, Joyent, Inc. All rights reserved.

var crypto = require('crypto');
var EventEmitter = require('events').EventEmitter;
var fs = require('fs');
var path = require('path');
var util = require('util');

var assert = require('assert-plus');
var clone = require('clone');
var SSHAgentClient = require('ssh-agent');
var once = require('once');
var vasync = require('vasync');



///--- Helpers


function SignatureCache(opts) {
    assert.optionalObject(opts, 'options');
    opts = opts || {};
    assert.optionalNumber(opts.expiry, 'options.expiry');

    this.expiry = opts.expiry || 10000;
    this.pending = new EventEmitter();
    this.pending.table = {};
    this.table = {};
    this.list = [];
}


SignatureCache.prototype.get = function get(k, cb) {
    assert.string(k, 'key');
    assert.func(cb, 'callback');

    cb = once(cb);

    var found = false;
    var self = this;

    function cachedResponse() {
        var val = self.table[k].value;
        cb(val.err, val.value);
    }

    if (this.table[k]) {
        found = true;
        process.nextTick(cachedResponse);
    } else if (this.pending.table[k]) {
        found = true;
        this.pending.once(k, cachedResponse);
    }

    return (found);
};


SignatureCache.prototype.put = function put(k, v) {
    assert.string(k, 'key');
    assert.ok(v, 'value');

    this.table[k] = {
        time: new Date().getTime(),
        value: v
    };

    if (this.pending.table[k])
        delete this.pending.table[k];

    this.pending.emit(k, v);
    this.purge();
};


SignatureCache.prototype.purge = function purge() {
    var list = [];
    var now = new Date().getTime();
    var self = this;

    Object.keys(this.table).forEach(function (k) {
        if (self.table[k].time + self.expiry < now)
            list.push(k);
    });

    list.forEach(function (k) {
        if (self.table[k])
            delete self.table[k];
    });
};


SignatureCache.prototype.toString = function toString() {
    var fmt = '[object SignatureCache<pending=%j, table=%j>]';
    return (util.format(fmt, this.pending.table, this.table));
};


function createCacheKey(opts) {
    assert.object(opts, 'options');
    assert.object(opts.key, 'options.key');
    assert.string(opts.data, 'options.data');

    return (opts.key.comment + '|' + opts.data);
}



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

    var p;

    if (process.platform == 'win32') {
        p = process.env.USERPROFILE;
    } else {
        p = process.env.HOME;
    }
    if (!p) {
        cb(new Error('cannot find HOME dir (HOME/USERPROFILE is not set)'));
        return;
    }

    p = path.join(p, '.ssh');

    fs.readdir(p, function (err, files) {
        if (err) {
            cb(err);
            return;
        }

        var keys = (files || []).filter(function (f) {
            return (/\.pub$/.test(f));
        });

        if (keys.length === 0) {
            cb(new Error('no public SSH keys in: ' + p));
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

    var cache = client._signCache;

    var _key = 'requestIdentities ' + fp;

    if (cache.get(_key, cb))
        return;

    client.requestIdentities(function (err, keys) {
        var _val = {
            err: null,
            value: null
        };

        if (err) {
            _val.err = err;
        } else {
            var key = (keys || []).filter(function (k) {
                // DSA over agent doesn't work
                if (k.type === 'ssh-dss')
                    return (false);
                return (fp === fingerprint(k.ssh_key));
            }).pop();

            if (!key) {
                _val.err = new Error('no key ' + fp + ' in ssh agent');
            } else {
                _val.value = key;
            }
        }

        cache.put(_key, _val);
        cb(_val.err, _val.value);
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

    agent._signCache = new SignatureCache();

    cb(null, agent);
}


function sshAgentSign(client, key, data, alg, cb) {
    assert.object(client, 'sshAgentClient');
    assert.object(client._signCache, 'sshAgentClient');
    assert.object(key, 'key');
    assert.object(data, 'data (Buffer)');
    if (typeof (alg) === 'function') {
        cb = alg;
        alg = 'rsa-sha1';
    }
    assert.string(alg, 'algorithm');
    assert.func(cb, 'callback');

    var cache = client._signCache;

    var _key = createCacheKey({
        key: key,
        data: data.toString()
    });

    if (cache.get(_key, cb))
        return;

    client.sign(key, data, function (err, signature) {
        var _val = {};

        if (err) {
            _val.err = err;
            cb(err);
        } else {
            _val.err = null;
            _val.value = {
                algorithm: alg,
                signature: (signature || {}).signature
            };

            cb(null, _val.value);
        }

        cache.put(_key, _val);
    });
}



///--- API

function privateKeySigner(options) {
    assert.object(options, 'options');
    assert.optionalString(options.algorithm, 'options.algorithm');
    assert.string(options.keyId, 'options.keyId');
    assert.string(options.key, 'options.key');
    assert.string(options.user, 'options.user');

    var algorithm = options.algorithm ? options.algorithm :
        (/ DSA /.test(options.key) ? 'DSA-SHA1' : 'RSA-SHA256');

    algorithm = algorithm.toUpperCase();

    // GH-180, sniff test for  a garbage key
    if (options.key.length === 0 ||
        (!/RSA/.test(options.key) && !/DSA/.test(options.key))) {
        throw new Error('"key" is not a valid private key');
    }

    var opts = {
        keyId: options.keyId,
        key: options.key,
        user: options.user
    };

    function sign(str, cb) {
        assert.string(str, 'str');
        assert.func(cb, 'callback');

        var signer = crypto.createSign(algorithm);
        signer.update(str);
        var res = {
            algorithm: sign.algorithm,
            keyId: opts.keyId,
            signature: signer.sign(opts.key, 'base64'),
            user: opts.user
        };

        cb(null, res);
    }

    sign.algorithm = algorithm.toLowerCase();
    sign.keyId = options.keyId;
    sign.user = options.user;

    return (sign);
}


function sshAgentSigner(options) {
    assert.object(options, 'options');
    assert.string(options.keyId, 'options.keyId');
    assert.string(options.user, 'options.user');

    var agent = new SSHAgentClient();
    var keyId = options.keyId;

    agent._signCache = new SignatureCache();

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

    sign.algorithm = 'rsa-sha1';
    sign.keyId = options.keyId;
    sign.user = options.user;

    return (sign);
}


function cliSigner(options) {
    assert.object(options, 'options');
    assert.string(options.keyId, 'options.keyId');
    assert.string(options.user, 'options.user');

    var alg = options.algorithm ? options.algorithm.toLowerCase() : 'rsa-sha1';
    var initOpts = new EventEmitter();
    initOpts.setMaxListeners(Infinity);
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

                    if (alg !== 'rsa-sha1') {
                        cb(new Error('SSH agent only supports RSA-SHA1'));
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
                    if (!err)
                        opts.key = key;

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

                    if (alg && / DSA /.test(key) && /rsa/.test(alg)) {
                        cb(new Error('RSA signing requested; DSA key loaded'));
                        return;
                    }

                    opts.algorithm = alg || (/ DSA /.test(key) ?
                        'DSA-SHA1' :
                        'RSA-SHA256');
                    opts.key = key;
                    cb();
                });
            }
        ],
        arg: initOpts
    }, function (err) {
        if (err) {
            initOpts.error = err;
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
                    } else if (initOpts.error) {
                        cb(initOpts.error);
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
                    sshAgentSign(a, k, d, alg, function (e, s) {
                        if (e) {
                            cb(e);
                            return;
                        }

                        s.algorithm = alg;
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


                    var a = (initOpts.algorithm || alg).toUpperCase();
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
            if (err) {
                callback(err);
            } else {
                sign.algorithm = arg.res.algorithm;
                sign.keyId = keyId;
                sign.user = user;
                callback(null, arg.res);
            }
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
    assert.optionalNumber(opts.expires, 'options.expires');
    assert.string(opts.host, 'options.host,');
    assert.string(opts.keyId, 'options.keyId');
    assert.string(opts.user, 'options.user');
    assert.string(opts.path, 'options.path');
    assert.optionalObject(opts.query, 'options.query');
    assert.func(opts.sign, 'options.sign');
    assert.func(cb, 'callback');

    if (opts.method !== undefined) {
        if (Array.isArray(opts.method)) {
            assert.ok(opts.method.length >= 1);
            opts.method.forEach(function (m) {
                assert.string(m, 'options.method');
            });
        } else {
            assert.string(opts.method, 'options.method');
            opts.method = [opts.method];
        }
    } else {
        opts.method = ['GET', 'HEAD'];
    }
    opts.method.sort();
    var method = opts.method.join(',');

    var q = clone(opts.query || {});
    q.algorithm = opts.algorithm || opts.sign.algorithm;
    q.expires = (opts.expires ||
                 Math.floor(((Date.now() + (1000 * 300))/1000)));
    q.keyId = '/' + opts.user + '/keys/' + opts.keyId;

    if (opts.method.length > 1)
        q.method = method;

    var line =
        method + '\n' +
        opts.host + '\n' +
        opts.path + '\n';
    var str = Object.keys(q).sort(function (a, b) {
        return (a.localeCompare(b));
    }).map(function (k) {
        return (rfc3986(k) + '=' + rfc3986(q[k]));
    }).join('&');
    line += str;

    if (opts.log)
        opts.log.debug('signUrl: signing -->\n%s', line);

    opts.sign(line, function onSignature(err, obj) {
        if (err) {
            cb(err);
        } else {
            var u = opts.path + '?' +
                str +
                '&signature=' + rfc3986(obj.signature);
            cb(null, u);
        }
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

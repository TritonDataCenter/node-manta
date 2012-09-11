// Copyright 2012 Joyent, Inc.  All rights reserved.

var EventEmitter = require('events').EventEmitter;
var crypto = require('crypto');
var path = require('path');
var util = require('util');

var assert = require('assert-plus');
var bunyan = require('bunyan');
var clone = require('clone');
var carrier = require('carrier');
var httpSignature = require('http-signature');
var MemoryStream = require('memorystream');
var mime = require('mime');
var restify = require('restify');
var uuid = require('node-uuid');



///--- Globals

var sprintf = util.format;

mime.define({
        'application/x-json-stream; type=directory': ['directory'],
        'application/x-json-stream; type=job': ['job']
});

var SIGNATURE = 'Signature keyId="/%s/keys/%s",algorithm="%s" %s';



///--- Helpers

function ChecksumError(actual, expected) {
        Error.call(this);

        this.name = ChecksumError;
        this.message = sprintf('content-md5 expected to be %s, but was %s',
                               expected, actual);
        Error.captureStackTrace(this, ChecksumError);
}
util.inherits(ChecksumError, Error);


function cloneJob(job) {
        if (typeof (job) === 'string') {
                return ({phases: [{exec: job}]});
        } else if (Array.isArray(job)) {
                return ({
                        phases: job.map(function (j) {
                                if (typeof (j) === 'object') {
                                        return (j);
                                } else if (typeof (j) === 'string') {
                                        return ({
                                                exec: j
                                        });
                                } else {
                                        throw new TypeError(util.inspect(j) +
                                                            ' invalid');
                                }
                        })
                });
        } else if (typeof (job) === 'object') {
                return (clone(job));
        } else {
                throw new TypeError('job (object) required');
        }
}


function createOptions(opts, userOpts) {
        assert.object(opts, 'options');
        assert.string(opts.path, 'options.path');
        assert.object(userOpts, 'userOptions');

        var id = opts.req_id || uuid.v4();
        var options = {
                headers: clone(userOpts.headers || {}),
                id: id,
                path: opts.path
        };

        options.headers.accept = options.headers.accept || opts.accept || '*/*';

        if (options.headers['content-length'] || opts.contentLength) {
                options.headers['content-length'] =
                        options.headers['content-length'] ||
                        opts.contentLength;
        }

        if (options.headers['content-type'] || opts.contentType) {
                options.headers['content-type'] =
                        options.headers['content-type'] ||
                        opts.contentType;
        }

        options.headers.date = new Date().toUTCString();

        if (options.headers['expect'] || opts.expect) {
                options.headers.expect = options.headers.expect || opts.expect;
        }

        if (options.headers['location'] || opts.location) {
                options.headers.location =
                        options.headers.location ||
                        opts.location;
        }

        options.headers['x-request-id'] = options.headers['x-request-id'] || id;

        return (options);
}


function createRestifyClient(opts, type) {
        var client = restify.createClient({
                connectTimeout: opts.connectTimeout,
                headers: opts.headers,
                log: opts.log,
                retry: opts.retry,
                type: type,
                url: opts.url,
                version: '~1.0'
        });

        return (client);
}



function getPath(p, user) {
        var _path;

        if (user) {
                _path = '/' + user + '/stor/' + p;
        } else {
                _path = p;
        }

        return (path.normalize(_path));
}


function getJobPath(p, user) {
        var _path;

        if (user) {
                _path = '/' + user + '/jobs/' + p;
        } else {
                _path = p;
        }

        return (path.normalize(_path).replace(/\/$/, ''));
}


function onRequestCallback(opts) {
        function onRequest(err, req) {
                if (err) {
                        opts.log.debug(err, '%s: error', opts.name);
                        opts.cb(err);
                } else {
                        req.once('result', opts.onResult);
                        if (opts.reqCb) {
                                opts.reqCb(req);
                        }
                }
        }

        return (onRequest);
}


function onResultCallback(opts) {
        function onResult(err, res) {
                if (err) {
                        readError(err, res, function onReadDone() {
                                opts.log.debug(err, '%s: error', opts.name);
                                opts.cb(err);
                        });
                } else {
                        res.once('end', function onEnd() {
                                opts.log.debug('%s: done', opts.name);
                                opts.cb(null);
                        });
                }
        }

        return (onResult);
}


function readError(err, res, cb) {
        assert.object(err);
        assert.object(res);
        assert.func(cb);

        if (res === null)
                return (cb(null, err));

        var body = '';
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
                body += chunk;
        });

        res.once('end', function () {
                err._body = body;

                try {
                        err.body = JSON.parse(body);
                } catch (e) {
                }

                err.body = err.body || {};
                err.code = err.body.code;
                err.message = err.body.message;
                err.name = err.body.code;
                if (!/.*Error$/.test(err.name))
                        err.name += 'Error';

                cb(null, err);
        });

        return (undefined);
}


function signRequest(opts, cb) {
        assert.object(opts, 'options');
        assert.object(opts.headers, 'options.headers');
        assert.func(opts.sign, 'options.sign');
        assert.func(cb, 'callback');

        opts.sign(opts.headers.date, function (err, obj) {
                if (err)
                        return (cb(err));

                opts.headers.authorization = sprintf(SIGNATURE,
                                                     obj.user,
                                                     obj.keyId,
                                                     obj.algorithm,
                                                     obj.signature);

                return (cb(null));
        });
}



///--- API

function MantaClient(options) {
        assert.object(options, 'options');
        assert.number(options.connectTimeout, 'options.connectTimeout');
        assert.optionalObject(options.headers, 'options.headers');
        assert.object(options.log, 'options.log');
        assert.func(options.sign, 'options.sign');
        assert.string(options.url, 'options.url');
        assert.optionalString(options.user, 'options.user');

        EventEmitter.call(this);

        var self = this;
        this.log = options.log.child({component: 'MantaClient'}, true);
        var restifyOpts = {
                connectTimeout: options.connectTimeout,
                headers: options.headers || {},
                log: self.log,
                retry: options.retry,
                type: 'http',
                url: options.url,
                version: '~1.0'
        };

        this.client = createRestifyClient(restifyOpts, 'http');
        this.jsonClient = createRestifyClient(restifyOpts, 'json');
        this.sign = options.sign;
        this.user = options.user || false;

        // debugging only
        this._url = options.url;
        this._version = '~1.0';
}
util.inherits(MantaClient, EventEmitter);
module.exports = MantaClient;


MantaClient.prototype.toString = function toString() {
        var str = sprintf('[object MantaClient<url=%s, user=%s, version=%s]',
                          this._url, this.user, this._version);
        return (str);
};


///--- Storage API

MantaClient.prototype.get = function get(p, opts, cb) {
        assert.string(p, 'path');
        if (typeof (opts) === 'function') {
                cb = opts;
                opts = {};
        }
        assert.func(cb, 'callback');

        var _path = getPath(p, this.user);
        var options = createOptions({
                accept: opts.accept || '*/*',
                path: _path
        }, opts);
        var log = this.log.child({
                path: _path,
                req_id: options.id
        }, true);
        var self = this;

        function onResult(err, res) {
                if (err) {
                        readError(err, res, function () {
                                log.debug(err, 'get: error');
                                cb(err);
                        });
                        return;
                }

                res.pause();

                var hash = crypto.createHash('md5');
                var stream = new MemoryStream();
                cb(null, stream);

                res.pipe(stream, {end: false});

                res.on('data', function onData(chunk) {
                        hash.update(chunk);
                });

                res.once('end', function onEnd() {
                        log.debug('get: done');
                        var _md5 = res.headers['content-md5'];
                        var md5 = hash.digest('base64');
                        if (md5 !== _md5) {
                                stream.emit('error',
                                            new ChecksumError(md5, _md5));
                        } else {
                                stream.end();
                        }
                });

                process.nextTick(function () {
                        res.resume();
                });
        }

        log.debug(options, 'get: entered');
        signRequest({
                headers: options.headers,
                sign: self.sign
        }, function onSignRequest(err) {
                if (err) {
                        cb(err);
                        return;
                }

                self.client.get(options, onRequestCallback({
                        cb: cb,
                        log: log,
                        name: 'get',
                        onResult: onResult
                }));

                return;
        });
};


MantaClient.prototype.info = function info(p, opts, cb) {
        assert.string(p, 'path');
        if (typeof (opts) === 'function') {
                cb = opts;
                opts = {};
        }
        assert.object(opts, 'options');
        assert.func(cb, 'callback');

        var _path = getPath(p, this.user);
        var options = createOptions({
                accept: 'application/json, */*',
                path: _path
        }, opts);
        var log = this.log.child({
                path: _path,
                req_id: options.id
        }, true);
        var self = this;

        function onResult(err, res) {
                if (err) {
                        readError(err, res, function () {
                                log.debug(err, 'ls: error');
                                cb(err);
                        });
                        return;
                }

                res.once('end', function onEnd() {
                        var ct = res.headers['content-type'];
                        var headers = res.headers;
                        var _info = {
                                extension: mime.extension(ct),
                                type: ct

                        };
                        if (headers.etag)
                                _info.etag = headers.etag;
                        if (headers['content-md5'])
                                _info.md5 = headers['content-md5'];
                        if (headers['content-length'])
                                _info.size = headers['content-length'];

                        log.debug(_info, 'info: done');
                        cb(null, _info);
                });
        }

        log.debug(options, 'info: entered');
        signRequest({
                headers: options.headers,
                sign: self.sign
        }, function onSignRequest(err) {
                if (err) {
                        cb(err);
                        return;
                }

                self.client.get(options, onRequestCallback({
                        cb: cb,
                        log: log,
                        name: 'info',
                        onResult: onResult
                }));

                return;
        });
};


MantaClient.prototype.ln = function ln(src, p, opts, cb) {
        assert.string(src, 'source');
        assert.string(p, 'path');
        if (typeof (opts) === 'function') {
                cb = opts;
                opts = {};
        }
        assert.object(opts, 'options');
        assert.func(cb, 'callback');

        var _path = getPath(p, this.user);
        var _src = getPath(src, this.user);
        var options = createOptions({
                accept: 'application/json',
                contentType: 'application/json; type=link',
                location: _src,
                path: _path
        }, opts);
        var log = this.log.child({
                path: _path,
                source: _src,
                req_id: options.id
        }, true);
        var self = this;

        log.debug(options, 'ln: entered');
        signRequest({
                headers: options.headers,
                sign: self.sign
        }, function onSignRequest(err) {
                if (err) {
                        cb(err);
                        return;
                }

                self.client.put(options, onRequestCallback({
                        cb: cb,
                        log: log,
                        name: 'ln',
                        onResult: onResultCallback({
                                cb: cb,
                                log: log,
                                name: 'ln'
                        }),
                        reqCb: function (req) {
                                req.end();
                        }
                }));

                return;
        });
};


MantaClient.prototype.ls = function ls(dir, opts, cb) {
        assert.string(dir, 'directory');
        if (typeof (opts) === 'function') {
                cb = opts;
                opts = {};
        }
        assert.object(opts, 'options');
        assert.func(cb, 'callback');

        var directory = getPath(dir, this.user);
        var emitter = new EventEmitter();
        var options = createOptions({
                accept: 'application/x-json-stream, application/json',
                path: directory
        }, opts);
        var log = this.log.child({
                path: directory,
                req_id: options.id
        }, true);
        var self = this;

        // Our callback to handle a list directory result
        function onResult(err, res) {
                if (err) {
                        readError(err, res, function () {
                                log.debug(err, 'ls: error');
                                emitter.emit('error', err);
                        });
                        return;
                }

                var carry = carrier.carry(res);
                carry.on('line', function onLine(line) {
                        log.debug({line: line}, 'ls: line received');
                        var l;
                        try {
                                l = JSON.parse(line);
                                log.debug(l, 'ls: line received');
                        } catch (e) {
                                log.warn(e, 'ls: invalid JSON data');
                                carry.removeAllListeners('line');
                                res.removeAllListeners('data');
                                res.removeAllListeners('end');
                                res.removeAllListeners('error');
                                return (emitter.emit('error', e));
                        }

                        emitter.emit(l.type, l);
                        return (undefined);
                });

                res.once('end', function ls_onEnd() {
                        carry.removeAllListeners('line');
                        var trailers = res.trailers || {};
                        if (trailers['x-stream-error'] !== 'false') {
                                emitter.emit('error',
                                             new Error('stream failed'));
                        } else {
                                log.debug('ls: done');
                                emitter.emit('end');
                        }
                });

                return;
        }

        log.debug('ls: entered');
        signRequest({
                headers: options.headers,
                sign: self.sign
        }, function onSignRequest(err) {
                if (err) {
                        cb(err);
                        return;
                }

                self.client.get(options, onRequestCallback({
                        cb: cb,
                        log: log,
                        name: 'ls',
                        onResult: onResult,
                        reqCb: function () {
                                cb(null, emitter);
                        }
                }));

                return;
        });
};


MantaClient.prototype.mkdir = function mkdir(dir, opts, cb) {
        assert.string(dir, 'directory');
        if (typeof (opts) === 'function') {
                cb = opts;
                opts = {};
        }
        assert.object(opts, 'options');
        assert.func(cb, 'callback');

        var directory = getPath(dir, this.user);
        var options = createOptions({
                accept: 'application/json',
                contentType: 'application/json; type=directory',
                path: directory
        }, opts);
        var log = this.log.child({
                path: directory,
                req_id: options.id
        }, true);
        var self = this;

        log.debug(options, 'mkdir: entered');
        signRequest({
                headers: options.headers,
                sign: self.sign
        }, function onSignRequest(err) {
                if (err) {
                        cb(err);
                        return;
                }

                self.client.put(options, onRequestCallback({
                        cb: cb,
                        log: log,
                        name: 'mkdir',
                        onResult: onResultCallback({
                                cb: cb,
                                log: log,
                                name: 'mkdir'
                        }),
                        reqCb: function (req) {
                                req.end();
                        }
                }));

                return;
        });
};


MantaClient.prototype.put = function put(p, input, opts, cb) {
        assert.string(p, 'path');
        assert.stream(input, 'input');
        assert.object(opts, 'options');
        assert.number(opts.size, 'options.size');
        assert.func(cb, 'callback');

        var _path = getPath(p, this.user);
        var options = createOptions({
                accept: 'application/json',
                contentMD5: opts.md5,
                contentType: (opts.type ||
                              mime.lookup(_path) ||
                              'application/octet-stream'),
                contentLength: opts.size,
                expect: '100-continue',
                path: _path
        }, opts);
        var log = this.log.child({
                path: _path,
                req_id: options.id
        }, true);
        var self = this;

        log.debug(options, 'put: entered');
        input.pause();
        signRequest({
                headers: options.headers,
                sign: self.sign
        }, function onSignRequest(err) {
                if (err) {
                        cb(err);
                        return;
                }

                self.client.put(options, onRequestCallback({
                        cb: cb,
                        log: log,
                        name: 'put',
                        onResult: onResultCallback({
                                cb: cb,
                                log: log,
                                name: 'put'
                        }),
                        reqCb: function (req) {
                                req.once('continue', function onContinue() {
                                        log.debug('put: continue receieved');
                                        input.pipe(req);
                                        input.resume();
                                });
                        }
                }));

                return;
        });
};


MantaClient.prototype.unlink = function unlink(p, opts, cb) {
        assert.string(p, 'path');
        if (typeof (opts) === 'function') {
                cb = opts;
                opts = {};
        }
        assert.object(opts, 'options');
        assert.func(cb, 'callback');

        var _path = getPath(p, this.user);
        var options = createOptions({
                accept: 'application/json',
                path: _path
        }, opts);
        var log = this.log.child({
                path: _path,
                req_id: options.id
        }, true);
        var self = this;

        log.debug(options, 'unlink: entered');
        signRequest({
                headers: options.headers,
                sign: self.sign
        }, function onSignRequest(err) {
                if (err) {
                        cb(err);
                        return;
                }

                self.client.del(options, onRequestCallback({
                        cb: cb,
                        log: log,
                        name: 'unlink',
                        onResult: onResultCallback({
                                cb: cb,
                                log: log,
                                name: 'unlink'
                        })
                }));

                return;
        });
};


///--- Jobs API

MantaClient.prototype.createJob = function createJob(j, opts, cb) {
        var job = cloneJob(j);
        assert.object(job, 'job');
        if (typeof (opts) === 'function') {
                cb = opts;
                opts = {};
        }
        assert.func(cb, 'callback');
        assert.ok(opts.user || this.user, 'user must be specified');

        var _path = getJobPath('', opts.user || this.user);
        var options = createOptions({
                accept: 'application/json',
                contentType: 'application/json; type=job',
                path: _path
        }, opts);
        var log = this.log.child({
                path: _path,
                req_id: options.id
        }, true);
        var self = this;

        if (!job.name)
                job.name = uuid.v4().substr(0, 7);

        log.debug({
                job: job,
                options: options
        }, 'createJob: entered');
        signRequest({
                headers: options.headers,
                sign: self.sign
        }, function onSignRequest(err) {
                if (err) {
                        cb(err);
                        return;
                }

                self.jsonClient.post(options, job, function (err2, _, res) {
                        if (err2) {
                                log.debug(err, 'createJob: failed');
                                cb(err2);
                        } else {
                                var l = res.headers.location;
                                if (self.user)
                                        l = l.split(/\/.+\/jobs\//).pop();

                                log.debug({job: l}, 'createJob: done');
                                cb(null, l);
                        }
                });

                return;
        });
};


MantaClient.prototype.job = function getJob(j, opts, cb) {
        assert.string(j, 'job');
        if (typeof (opts) === 'function') {
                cb = opts;
                opts = {};
        }
        assert.func(cb, 'callback');

        var _path = getJobPath(j, this.user);
        var options = createOptions({
                accept: 'application/json',
                path: _path
        }, opts);
        var log = this.log.child({
                path: _path,
                req_id: options.id
        }, true);
        var self = this;

        log.debug({
                job: j,
                options: options
        }, 'getJob: entered');
        signRequest({
                headers: options.headers,
                sign: self.sign
        }, function onSignRequest(err) {
                if (err) {
                        cb(err);
                        return;
                }

                self.jsonClient.get(options, function (err2, _, __, obj) {
                        if (err2) {
                                log.debug(err, 'createJob: failed');
                                cb(err2);
                        } else {
                                log.debug({job: obj}, 'getJob: done');
                                cb(null, obj);
                        }
                });

                return;
        });
};


MantaClient.prototype.addJobKey = function addJobKey(j, k, opts, cb) {
        assert.string(j, 'job');
        if (!Array.isArray(k)) {
                assert.string(k, 'key');
                k = [k];
        } else {
                assert.arrayOfString(k, 'keys');
        }
        if (typeof (opts) === 'function') {
                cb = opts;
                opts = {};
        }
        assert.func(cb, 'callback');

        var self = this;
        var _path = getJobPath(j, this.user) + '/in';
        var options = createOptions({
                accept: 'application/json',
                contentType: 'text/plain',
                path: _path
        }, opts);
        var keys = k.map(function (key) {
                /* JSSTYLED */
                if (/^\/.*\/stor\/.*/.test(key))
                        return (key);
                return (getPath(key, self.user));
        });
        var log = this.log.child({
                path: _path,
                req_id: options.id
        }, true);

        if (opts.end)
                options.path += '?end=true';

        log.debug({
                job: j,
                keys: keys,
                options: options
        }, 'addJobKey: entered');
        signRequest({
                headers: options.headers,
                sign: self.sign
        }, function onSignRequest(err) {
                if (err) {
                        cb(err);
                        return;
                }

                self.client.post(options, onRequestCallback({
                        cb: cb,
                        log: log,
                        name: 'addJobJey',
                        onResult: onResultCallback({
                                cb: cb,
                                log: log,
                                name: 'addJobJey'
                        }),
                        reqCb: function (req) {
                                req.write(keys.join('\r\n'));
                                req.end();
                        }
                }));

                return;
        });
};


MantaClient.prototype.endJob = function endJob(j, opts, cb) {
        assert.string(j, 'job');
        if (typeof (opts) === 'function') {
                cb = opts;
                opts = {};
        }
        assert.func(cb, 'callback');

        var _path = getJobPath(j, this.user) + '/in/end';
        var options = createOptions({
                accept: 'application/json',
                contentLength: 0,
                contentType: 'application/json',
                path: _path
        }, opts);
        var log = this.log.child({
                path: _path,
                req_id: options.id
        }, true);
        var self = this;

        log.debug({
                job: j,
                options: options
        }, 'endJob: entered');
        signRequest({
                headers: options.headers,
                sign: self.sign
        }, function onSignRequest(err) {
                if (err) {
                        cb(err);
                        return;
                }

                self.jsonClient.post(options, function (err2) {
                        if (err2) {
                                log.debug(err, 'endJob: error');
                                cb(err2);
                        } else {
                                log.debug('endJob: done');
                                cb(null);
                        }
                });

                return;
        });
};

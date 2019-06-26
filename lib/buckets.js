/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * Manta buckets common functionality.
 */

var util = require('util');

var assert = require('assert-plus');
var LOMStream = require('lomstream').LOMStream;

// We use "WError" when wrapping Buckets API error responses which have an
// empty err.message. Otherwise our wrapped error message gets VError's
// ": " suffix.
var verror = require('verror'),
    VError = verror.VError,
    WError = verror.WError;

var MantaClient = require('./client').MantaClient;
var StreamingJSONStream = require('./streaming_json_stream');


/*
 * Dev Note: Buckets-specific parts of the `client.MantaClient` are here in
 * a subclass of that. This is to try to reduce the size of "client.js".
 * The common `manta.createClient()` methods take a `klass` option that can
 * be set to this `MantaBucketsClient` to use.
 *
 */
function MantaBucketsClient(opts) {
    assert.object(opts, 'opts');

    MantaClient.call(this, opts);
}
util.inherits(MantaBucketsClient, MantaClient);


/*
 * IsBucketsSupported (OPTIONS /:login/buckets)
 *
 * Check whether this Manta supports buckets.
 *
 * @param {Object} opts - The usual request overrides.
 *      XXX document these supported override somewhere
 * @param {Function} cb - `function (err, isSupported)` where `isSupported`
 *      is `true` or `false`. If there is an `err`, then `isSupported` will
 *      be `null`.
 */
MantaBucketsClient.prototype.isBucketsSupported =
function isBucketsSupported(opts, cb) {
    assert.object(opts, 'opts');

    // XXX use createOptions
    var self = this;
    var reqOpts = {
        headers: {},
        path: self.path('~~/buckets')
    };

    self.signRequest({
        headers: reqOpts.headers
    }, function onSignRequest(signErr) {
        if (signErr) {
            cb(signErr);
            return;
        }

        self.client.opts(reqOpts, function onReq(reqErr, req) {
            if (reqErr) {
                self.log.debug(reqErr, 'IsBucketsSupported error');
                cb(reqErr);
                return;
            }

            req.once('result', function onRes(resErr, res) {
                if (resErr && !res) {
                    cb(resErr, null);
                    return;
                }

                res.once('end', function onEnd() {
                    switch (res.statusCode) {
                        case 204:
                            cb(null, true);
                            break;
                        case 404:
                            cb(null, false);
                            break;
                        case 405:
                            // MethodNotAllowed: for buckets-supporting muskie
                            // before this endpoint was allowed. After a short
                            // while this branch can be removed.
                            cb(null, false);
                            break;
                        default:
                            cb(new VError('unexpected IsBucketsSupported ' +
                                'response status: %s', res.statusCode));
                            break;
                    }
                });

                res.resume();
            });
        });
    });
};


/*
 * Create and return a stream of buckets objects.
 *
 * Usage example:
 *
 *      var s = client.createListBucketsStream({});
 *      s.on('readable', function onReadable() {
 *          var bucket;
 *          while ((bucket = s.read()) !== null) {
 *              console.log('BUCKET:', bucket);
 *          }
 *      });
 *      s.once('error', function onError(err) {
 *          cb(new VError(err, 'createListBucketsStream stream error'));
 *      });
 *      s.once('end', function onEnd() {
 *          cb();
 *      });
 *
 * @param {Object} opts - Optional.
 * @param {Boolean} opts.rawString - Optional. Just stream back the raw response
 *      chunks as strings (not bytes, not *that* raw) without spending the
 *      cycles to parse the JSON.
 */
MantaBucketsClient.prototype.createListBucketsStream =
function createListBucketsStream(opts) {
    assert.optionalObject(opts, 'opts');
    if (!opts) {
        opts = {};
    }
    assert.optionalBool(opts.rawString, 'opts.rawString');

    var self = this;
    // XXX Default this to 1000 when have pagination.
    var limit = 2147483647;
    var endpoint = self.path('~~/buckets')

    // XXX There are some options we should perhaps being including
    // from client.js#createOptions. Perhaps a local `createOptions` for the
    // set applying to buckets endpoints?
    var reqOpts = {
        headers: {},
        query: {}
    };

    function fetch(_fetchArg, limitObj, dataCb, doneCb) {
        reqOpts.query.limit = limitObj.limit;
        reqOpts.query.offset = limitObj.offset;

        self.signRequest({
            headers: reqOpts.headers
        }, function onSignRequest(signErr) {
            if (signErr) {
                doneCb(signErr);
                return;
            }

            self.get(endpoint, reqOpts, function onGet(getErr, stream, res) {
                if (getErr) {
                    doneCb(new VError(getErr, 'Manta ListBuckets error: %s',
                        getErr.name));
                    return;
                }

                var sjs;
                var terminus; // The last stream in the pipeline.
                var handleErr = function (err) {
                    // XXX need to guard against double call?
                    if (sjs) {
                        stream.unpipe(sjs);
                    }
                    if (res && res.socket && res.socket.destroy) {
                        res.socket.destroy();
                    }
                    doneCb(err);
                };

                stream.once('error', handleErr);

                if (opts.rawString) {
                    // Don't parse the incoming JSON. Still assume it is UTF-8.
                    stream.setEncoding('utf8');
                    terminus = stream;
                } else {
                    // Parse the incoming newline-separated JSON.
                    sjs = new StreamingJSONStream();
                    sjs.once('error', handleErr);
                    setImmediate(function () { stream.pipe(sjs); });
                    terminus = sjs;
                }

                terminus.on('readable', function onReadable() {
                    var ent;
                    while ((ent = terminus.read()) !== null) {
                        dataCb(ent);
                    }
                });
                terminus.once('end', function onEnd() {
                    // XXX need to handle 'end' after 'error'?

                    // Ensure this transfer (if transfer-encoding: chunked)
                    // is complete.
                    // Dev Note: Perhaps this should be in MantaClient.get?
                    if (!res.complete) {
                        doneCb(new VError(
                            'incomplete chunked encoding transfer (req_id=%s)',
                            res.headers['x-request-id']));
                        return;
                    }

                    // XXX ListBuckets paging isn't yet implemented, so `done`
                    // is always true for now.
                    doneCb(null, {done: true, results: []});
                });
            });
        });
    }

    return new LOMStream({
        fetch: fetch,
        limit: limit,
        offset: true
    });
};

/*
 * Get info (headers from a HEAD request) on a bucket.
 *
 * @param {String} bucketName
 * @param {Object} opts - Optional. The usual request overrides.
 *      XXX document these supported override somewhere
 * @param {Function} cb - `function (err, res)`. If there is an error
 *      `err` will be set and the other args will be undefined. Otherwise,
 *      `res` is the response object with the headers.
 */
MantaBucketsClient.prototype.headBucket =
function headBucket(bucketName, opts, cb) {
    assert.string(bucketName, 'bucketName');
    if (typeof (opts) === 'function') {
        cb = opts;
        opts = {};
    }
    assert.object(opts, 'opts');
    assert.func(cb, 'cb');

    var self = this;
    // XXX use createOptions
    var reqOpts = {
        // XXX self.path is encodeURIComponent'ing for us. Not sure it should
        path: self.path('~~/buckets/' + bucketName),
        headers: {}
    };

    self.signRequest({
        headers: reqOpts.headers
    }, function onSignRequest(err) {
        if (err) {
            cb(err);
            return;
        }

        self.client.head(reqOpts, function onReq(reqErr, req) {
            if (reqErr) {
                self.log.debug(reqErr, 'HeadBucket error');
                cb(reqErr);
                return;
            }

            req.once('result', function onRes(resErr, res) {
                if (!res) {
                    cb(resErr);
                    return;
                }

                res.once('end', function onEnd() {
                    cb(null, res);
                });

                res.resume();
            });
        });
    });
};


/*
 * CreateBucket (PUT /:login/buckets/:bucket)
 *
 * Create the given bucket name.
 *
 * @param {String} bucketName
 * @param {Object} opts - The usual request overrides.
 *      XXX document these supported override somewhere
 * @param {Function} cb - `function (err)`
 */
MantaBucketsClient.prototype.createBucket =
function createBucket(bucketName, opts, cb) {
    assert.string(bucketName, 'bucketName');
    assert.object(opts, 'opts');
    assert.func(cb, 'cb');

    // XXX use createOptions
    var self = this;
    var reqOpts = {
        headers: {
            'content-type': 'application/json; type=bucket'
        },
        // XXX self.path is encodeURIComponent'ing for us. Not sure it should
        path: self.path('~~/buckets/' + bucketName)
    };

    self.signRequest({
        headers: reqOpts.headers
    }, function onSignRequest(signErr) {
        if (signErr) {
            cb(signErr);
            return;
        }

        self.client.put(reqOpts, function onReq(reqErr, req) {
            if (reqErr) {
                self.log.debug(reqErr, 'CreateBucket error');
                cb(reqErr);
                return;
            }

            req.once('result', function onRes(resErr, res) {
                if (resErr) {
                    if (res && res.statusCode === 409) {
                        cb(new WError(resErr, 'bucket "%s" already exists',
                            bucketName));
                    } else {
                        cb(new VError('unexpected CreateBucket error: %s',
                            resErr));
                    }
                    return;
                }

                res.once('end', function onEnd() {
                    switch (res.statusCode) {
                        case 204:
                            cb(null);
                            break;
                        default:
                            cb(new VError('unexpected CreateBucket ' +
                                'response status: %s', res.statusCode));
                            break;
                    }
                });

                res.resume();
            });

            req.end();
        });
    });
};


/*
 * DeleteBucket (DELETE /:login/buckets/:bucket)
 *
 * Delete the given bucket name.
 *
 * @param {String} bucketName
 * @param {Object} opts - The usual request overrides.
 *      XXX document these supported override somewhere
 * @param {Function} cb - `function (err)`
 */
MantaBucketsClient.prototype.deleteBucket =
function deleteBucket(bucketName, opts, cb) {
    assert.string(bucketName, 'bucketName');
    assert.object(opts, 'opts');
    assert.func(cb, 'cb');

    // XXX use createOptions
    var self = this;
    var reqOpts = {
        headers: {
            'content-type': 'application/json; type=bucket'
        },
        // XXX self.path is encodeURIComponent'ing for us. Not sure it should
        path: self.path('~~/buckets/' + bucketName)
    };

    self.signRequest({
        headers: reqOpts.headers
    }, function onSignRequest(signErr) {
        if (signErr) {
            cb(signErr);
            return;
        }

        self.client.del(reqOpts, function onReq(reqErr, req) {
            if (reqErr) {
                self.log.debug(reqErr, 'DeleteBucket error');
                cb(reqErr);
                return;
            }

            req.once('result', function onRes(resErr, res) {
                if (resErr) {
                    if (res && res.statusCode === 404) {
                        cb(new WError(resErr, 'bucket "%s" does not exist',
                            bucketName));
                    } else {
                        cb(new VError('unexpected DeleteBucket error: %s',
                            resErr));
                    }
                    return;
                }

                res.once('end', function onEnd() {
                    switch (res.statusCode) {
                        case 204:
                            cb(null);
                            break;
                        default:
                            cb(new VError('unexpected DeleteBucket ' +
                                'response status: %s', res.statusCode));
                            break;
                    }
                });

                res.resume();
            });
        });
    });
};




/*
 * ListBucketObjects (GET /:login/buckets/:bucket_name/objects)
 *
 * List objects in a bucket.
 *
 * XXX no pagination yet. We shall see if it still does transfer-encoding:chunked
 *     or a single larger JSON object. If the former, then want
 *     `createListBucketObjects` stream. If the latter, then
 *     `listBucketObjects`.
 *
 * Usage example:
 *
 *      var s = client.createListBucketsStream({});
 *      s.on('readable', function onReadable() {
 *          var bucket;
 *          while ((bucket = s.read()) !== null) {
 *              console.log('BUCKET:', bucket);
 *          }
 *      });
 *      s.once('error', function onError(err) {
 *          cb(new VError(err, 'createListBucketsStream stream error'));
 *      });
 *      s.once('end', function onEnd() {
 *          cb();
 *      });
 *
 * @param {String} bucketName - Required.
 * @param {Object} opts - Optional.
 *      - {Boolean} opts.rawString - Optional. Just stream back the raw response
 *        chunks as strings (not bytes, not *that* raw) without spending the
 *        cycles to parse the JSON.
 */
MantaBucketsClient.prototype.createListBucketObjectsStream =
function createListBucketObjectsStream(bucketName, opts) {
    assert.string(bucketName, 'bucketName');
    assert.optionalObject(opts, 'opts');
    if (!opts) {
        opts = {};
    }
    assert.optionalBool(opts.rawString, 'opts.rawString');

    var self = this;
    // XXX Default this to 1000 when have pagination.
    var limit = 2147483647;

    // XXX self.path is encodeURIComponent'ing for us. Not sure it should.
    var endpoint = self.path('~~/buckets/' + bucketName + '/objects');
    // XXX There are some options we should perhaps being including
    // from client.js#createOptions. Perhaps a local `createOptions` for the
    // set applying to buckets endpoints?
    var reqOpts = {
        headers: {},
        query: {}
    };

    function fetch(_fetchArg, limitObj, dataCb, doneCb) {
        reqOpts.query.limit = limitObj.limit;
        reqOpts.query.offset = limitObj.offset;

        self.signRequest({
            headers: reqOpts.headers
        }, function onSignRequest(signErr) {
            if (signErr) {
                doneCb(signErr);
                return;
            }

            self.get(endpoint, reqOpts, function onGet(getErr, stream, res) {
                if (getErr) {
                    doneCb(new VError(getErr,
                        'Manta ListBucketObjects error: %s', getErr.name));
                    return;
                }

                var sjs;
                var terminus; // The last stream in the pipeline.
                var handleErr = function (err) {
                    // XXX need to guard against double call?
                    if (sjs) {
                        stream.unpipe(sjs);
                    }
                    if (res && res.socket && res.socket.destroy) {
                        res.socket.destroy();
                    }
                    doneCb(err);
                };

                stream.once('error', handleErr);

                if (opts.rawString) {
                    // Don't parse the incoming JSON. Still assume it is UTF-8.
                    stream.setEncoding('utf8');
                    terminus = stream;
                } else {
                    // Parse the incoming newline-separated JSON.
                    sjs = new StreamingJSONStream();
                    sjs.once('error', handleErr);
                    setImmediate(function () { stream.pipe(sjs); });
                    terminus = sjs;
                }

                terminus.on('readable', function onReadable() {
                    var ent;
                    while ((ent = terminus.read()) !== null) {
                        dataCb(ent);
                    }
                });
                terminus.once('end', function onEnd() {
                    // XXX need to handle 'end' after 'error'?

                    // Ensure this transfer (if transfer-encoding: chunked)
                    // is complete.
                    // Dev Note: Perhaps this should be in MantaClient.get?
                    if (!res.complete) {
                        doneCb(new VError(
                            'incomplete chunked encoding transfer (req_id=%s)',
                            res.headers['x-request-id']));
                        return;
                    }

                    // XXX ListBucketObjects paging isn't yet implemented, so
                    // `done` is always true for now.
                    doneCb(null, {done: true, results: []});
                });
            });
        });
    }

    return new LOMStream({
        fetch: fetch,
        limit: limit,
        offset: true
    });
};

/*
 * XXX doc this
 * XXX will probably want to pass back `res` for higher level err handling
 */
MantaBucketsClient.prototype.createBucketObject =
function createBucketObject(inStream, bucketName, objectName, opts, cb) {
    assert.string(bucketName, 'bucketName');
    assert.string(objectName, 'objectName');
    assert.object(opts, 'opts');
    assert.func(cb, 'cb');

    // XXX use createOptions
    var self = this;
    var reqOpts = {
        headers: {
            // XXX content-type

            // XXX grok server usage of this
            expect: '100-continue'
        },
        // XXX Is `self.path`s "helpful" encodeURIComponent'ing going to
        // double-encode our object path, which we must encode ourself? Grr.
        path: self.path('~~/buckets/' + bucketName + '/objects/' +
            encodeURIComponent(objectName))
    };

    self.signRequest({
        headers: reqOpts.headers
    }, function onSignRequest(signErr) {
        if (signErr) {
            cb(signErr);
            return;
        }


        self.client.put(reqOpts, function onReq(reqErr, req) {
            if (reqErr) {
                self.log.debug(reqErr, 'PutBucketObject error');
                cb(reqErr);
                return;
            }

            req.once('result', function onRes(resErr, res) {
                if (resErr) {
                    // XXX handle "known" error codes?
                    cb(new VError('unexpected PutBucketObject error: %s',
                        resErr));
                    return;
                }

                res.once('end', function onEnd() {
                    switch (res.statusCode) {
                        case 204:
                            cb(null);
                            break;
                        default:
                            cb(new VError('unexpected PutBucketObject ' +
                                'response status: %s', res.statusCode));
                            break;
                    }
                });

                res.resume();
            });

            req.once('continue', function onContinue() {
                //log.debug('put: continue received');
                // XXX when is the input not readable? Zero bytes? If not,
                //      should we error out instead?
                if (inStream.readable) {
                    inStream.pipe(req);
                    inStream.resume();
                } else {
                    console.log('XXX inStream is not readable, do we just want to end here?');
                    req.end();
                }
            });
        });
    });
};


/*
 * Get a read stream for a bucket object.
 *
 * The returned `stream` will emit an 'error' event if:
 * - the downloaded number of bytes doesn't match the content-length
 *   response header, or
 * - the downloaded number content MD5 hash doesn't match the content-md5
 *   response header
 *
 * Note that the response stream is resumed in the `nextTick` so one must
 * hook up 'error' event handlers and pipe'ing immediately on callback.
 *
 * If the Manta connection is dropped, this will attempt to resume the
 * download via Range gets.
 *
 * @param {String} bucketName
 * @param {String} objectName
 * @param {Object} opts - The usual request overrides.
 *      XXX document these supported override somewhere
 * @param {Function} cb - `function (err, stream, res)`. If there is an error
 *      getting the stream, `err` will be set and the other args will be
 *      undefined. Otherwise, `stream` is a readable stream, and `res` is
 *      the response object.
 */
MantaBucketsClient.prototype.getBucketObject =
function getBucketObject(bucketName, objectName, opts, cb) {
    assert.string(bucketName, 'bucketName');
    assert.string(objectName, 'objectName');
    assert.object(opts, 'opts');
    assert.func(cb, 'cb');

    // XXX use createOptions
    var self = this;
    // XXX Is `self.path`s "helpful" encodeURIComponent'ing going to
    // double-encode our object path, which we must encode ourself? Grr.
    var endpoint = self.path('~~/buckets/' + bucketName + '/objects/' +
        encodeURIComponent(objectName));
    var reqOpts = {};

    self.get(endpoint, reqOpts, cb);
    // XXX Do we want wrapped errors and logging for unexpected GetBucketObject
    //     errors like we have for other client methods here? See above.
};


/*
 * Get info (headers from a HEAD request) on a bucket object.
 *
 * @param {String} bucketName
 * @param {String} objectName
 * @param {Object} opts - Optional. The usual request overrides.
 *      XXX document these supported override somewhere
 * @param {Function} cb - `function (err, res)`. If there is an error
 *      `err` will be set and the other args will be undefined. Otherwise,
 *      `res` is the response object with the headers.
 */
MantaBucketsClient.prototype.headBucketObject =
function headBucketObject(bucketName, objectName, opts, cb) {
    assert.string(bucketName, 'bucketName');
    assert.string(objectName, 'objectName');
    if (typeof (opts) === 'function') {
        cb = opts;
        opts = {};
    }
    assert.object(opts, 'opts');
    assert.func(cb, 'cb');

    var self = this;
    // XXX use createOptions
    var reqOpts = {
        // XXX Is `self.path`s "helpful" encodeURIComponent'ing going to
        // double-encode our object path, which we must encode ourself? Grr.
        path: self.path('~~/buckets/' + bucketName + '/objects/' +
            encodeURIComponent(objectName)),
        headers: {}
    };

    self.signRequest({
        headers: reqOpts.headers
    }, function onSignRequest(err) {
        if (err) {
            cb(err);
            return;
        }

        self.client.head(reqOpts, function onReq(reqErr, req) {
            if (reqErr) {
                self.log.debug(reqErr, 'HeadBucketObject error');
                cb(reqErr);
                return;
            }

            req.once('result', function onRes(resErr, res) {
                if (!res) {
                    cb(resErr);
                    return;
                }

                res.once('end', function onEnd() {
                    cb(null, res);
                });

                res.resume();
            });
        });
    });
};

/*
 * DeleteBucketObject (DELETE /:login/buckets/:bucket/objects/:object)
 *
 * Delete the given bucket object.
 *
 * Note that it is not an error to delete an object that doesn't exist.
 *
 * @param {String} bucketName
 * @param {String} objectName
 * @param {Object} opts - Optional. The usual request overrides.
 *      XXX document these supported override somewhere
 * @param {Function} cb - `function (err)`
 */
MantaBucketsClient.prototype.deleteBucketObject =
function deleteBucketObject(bucketName, objectName, opts, cb) {
    assert.string(bucketName, 'bucketName');
    assert.string(objectName, 'objectName');
    if (typeof (opts) === 'function') {
        cb = opts;
        opts = {};
    }
    assert.func(cb, 'cb');

    var self = this;
    // XXX use createOptions
    var reqOpts = {
        headers: {
            'content-type': 'application/json; type=bucket'
        },
        // XXX Is `self.path`s "helpful" encodeURIComponent'ing going to
        // double-encode our object path, which we must encode ourself? Grr.
        path: self.path('~~/buckets/' + bucketName + '/objects/' +
            encodeURIComponent(objectName))
    };

    self.signRequest({
        headers: reqOpts.headers
    }, function onSignRequest(signErr) {
        if (signErr) {
            cb(signErr);
            return;
        }

        self.client.del(reqOpts, function onReq(reqErr, req) {
            if (reqErr) {
                self.log.debug(reqErr, 'DeleteBucketObject error');
                cb(reqErr);
                return;
            }

            req.once('result', function onRes(resErr, res) {
                if (resErr) {
                    if (res && res.statusCode === 404) {
                        cb(new WError(resErr, 'bucket "%s" does not exist',
                            bucketName));
                    } else {
                        cb(new VError('unexpected DeleteBucketObject error: %s',
                            resErr));
                    }
                    return;
                }

                res.once('end', function onEnd() {
                    switch (res.statusCode) {
                        case 204:
                            cb(null);
                            break;
                        default:
                            cb(new VError('unexpected DeleteBucketObject ' +
                                'response status: %s', res.statusCode));
                            break;
                    }
                });

                res.resume();
            });
        });
    });
};


// ---- exports

module.exports = {
    MantaBucketsClient: MantaBucketsClient
};

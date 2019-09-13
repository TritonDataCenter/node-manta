/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * Manta Buckets API client.
 */

var path = require('path');
var util = require('util');
var format = util.format;

var assert = require('assert-plus');
var libuuid = require('uuid');
var LOMStream = require('lomstream').LOMStream;

// We use "WError" when wrapping Buckets API error responses which have an
// empty err.message. Otherwise our wrapped error message gets VError's
// ": " suffix.
var verror = require('verror'),
    VError = verror.VError,
    WError = verror.WError;

var MantaClient = require('./client').MantaClient;
var StreamingJSONStream = require('./streaming_json_stream');
var utils = require('./utils');


// ---- support functions

// `jsprim.mergeObjects` doesn't strip `undefined` values like we want here.
function mergeObjects(defaults, provided) {
    var k;
    var rv = {};

    if (defaults) {
        for (k in defaults) {
            if (defaults[k] !== undefined) {
                rv[k] = defaults[k];
            }
        }
    }
    if (provided) {
        for (k in provided) {
            if (provided[k] !== undefined) {
                rv[k] = provided[k];
            }
        }
    }

    return (rv);
}

/*
 * Create the restify-client request options for a Buckets API request.
 *
 * (This is similar to client.js:createOptions() used for dir-style Manta
 * endpoints, but by design does not offer top-level options as an abstraction
 * for HTTP headers, e.g. `opts.contentMD5` for `opts.headers['content-md5']`.)
 *
 * The return object is created as follows:
 *
 * 1. `defaultOpts` and `userOpts` are shallow merged (`userOpts` win).
 * 2. `defaultOpts.headers` and `userOpts.headers` are shallow merged
 *    (an header names are lowercased as a normalization).
 * 3. `defaultOpts.query` and `userOpts.query` are shallow merged.
 * 4. `headers['x-request-id'] = <new v4 UUID>` is added if one was not already
 *    set, because setting a request ID is typically always wanted.
 * 5. If there is `reqOpts.log`, it is replaced with a Bunyan child logger
 *    with a "req_id" field set to the x-request-id from above. This will
 *    result in the restify-client log messages including the "req_id".
 *
 * Examples:
 *    > mkBucketReqOpts('/bob/buckets')
 *    { headers: { 'x-request-id': '320bd6a6-e233-4878-a49c-2a618c37606f' },
 *      query: {},
 *      path: '/bob/buckets' }
 *
 *    > mkBucketReqOpts('/bob/buckets',
 *    ... {headers: {foo: 'a', bar: 'b'}},
 *    ... {connectTimeout: 1000, headers: {foo: 'c'}})
 *    { headers:
 *       { foo: 'c',
 *         bar: 'b',
 *         'x-request-id': '12b08131-7e11-4e3b-a602-58e6f7801732' },
 *      connectTimeout: 1000,
 *      query: {},
 *      path: '/bob/buckets' }
 *
 *
 * Any of the `*Opts` vars may include any of the fields accepted by
 * restify-clients get/put/post/del/etc. methods. These are *somewhat*
 * documented at <http://restify.com/docs/client-guide/>. The relevant code
 * is the `HttpClient.prototype._options` method, currently here:
 * <https://github.com/restify/clients/blob/master/lib/HttpClient.js#L940>
 * Note that many are specified on the *client* instance already.
 *
 * Common request options are:
 *
 *      {
 *          headers: { ... headers ... },
 *          log: <bunyan logger object>
 *          query: { ... query params ... },
 *
 *          // Less common:
 *          connectTimeout: <ms>,
 *          requestTimeout: <ms>,
 *          retry: <false or retry options object>,
 *      }
 *
 * Refer to the Buckets API docs (currently RFD 155) for which query params
 * and headers are supported for each endpoint.
 *
 *
 * The intended/expected usage is as follows:
 *
 *      MantaBucketsClient.prototype.someEndpoint = function (..., opts, cb) {
 *          // ...
 *
 *          var reqOpts = mkBucketReqOpts(
 *              '/some/api/path',
 *              {
 *                  log: self.log,
 *                  ... any default options for this endpoint ...
 *              },
 *              opts   // the caller-provided endpoint options
 *          );
 *
 *          // ...
 *
 *          self.signRequest({
 *              headers: reqOpts.headers
 *          }, function onSignRequest(err) {
 *              if (err) {
 *                  cb(err);
 *                  return;
 *              }
 *
 *              self.client.get(reqOpts, function onReq(reqErr, req) {
 *                  // Note: use `req.log` for logging (set via `reqOpts.log`).
 *                  // ...
 *              });
 *          });
 *      };
 *
 * @param {String} urlPath - The URL path. Required.
 * @param {Object} defaultOpts - Optional.
 * @param {Object} userOpts - Optional. The caller-provided request options.
 *      These "win" over `defaultOpts`.
 */
function mkBucketReqOpts(urlPath, defaultOpts, userOpts) {
    assert.string(urlPath, 'urlPath');
    assert.optionalObject(defaultOpts, 'defaultOpts');
    assert.optionalObject(userOpts, 'userOpts');

    // Merge the options (this strips `undefined` values).
    var reqOpts = mergeObjects(defaultOpts, userOpts);
    reqOpts.headers = mergeObjects(
        defaultOpts && utils.normalizeHeaders(defaultOpts.headers),
        userOpts && utils.normalizeHeaders(userOpts.headers));
    reqOpts.query = mergeObjects(
        defaultOpts && defaultOpts.query,
        userOpts && userOpts.query);

    // It is up to the caller to encode special chars in the path.
    reqOpts.path = urlPath;

    // Always ensure a 'x-request-id' header.
    var req_id = reqOpts.headers['x-request-id'];
    if (!req_id) {
        req_id = reqOpts.headers['x-request-id'] = libuuid.v4();
    }

    // If there is a `reqOpts.log` Bunyan logger, ensure it has a matching
    // `req_id` field.
    if (reqOpts.log && reqOpts.log.fields.req_id !== req_id) {
        reqOpts.log = reqOpts.log.child({req_id: req_id}, true);
    }

    assert.object(reqOpts, 'reqOpts');
    return (reqOpts);
}


/*
 * Attempt to read the body and glean error info from a Buckets API response
 * that is an error. Extra error info is expected to be per:
 * https://github.com/joyent/eng/blob/master/docs/index.md#error-handling
 *
 * @param {Object} httpErr - The basic HTTP Error object from restify-clients'
 *      `req.on('result')`. This is wholely derived from the HTTP status code.
 *      If the response body cannot be read or parsed, then this err is
 *      returned.
 * @param {Object} res - The response object.
 * @param {Function} cb - `function (err)` where `err` is either (a) the
 *      given `httpErr` if no extra error info could be gleaned, or
 *      (b) a VError with extra error info:
 *          - the `name` is set appropriately (derived from the "code" in the
 *            body, appending "Error" if that is not already the case)
 *          - the `message` is set from the parsed body
 *          - the parsed body is set as VError "info"
 *            (see https://github.com/joyent/node-verror#verrorinfoerr)
 *
 */
function readBucketApiErr(httpErr, res, cb) {
    assert.object(httpErr, 'httpErr');
    assert.optionalObject(res, 'res');
    assert.func(cb, 'cb');

    var chunks = [];

    if (!res) {
        // If we don't have a response from which to read data, then all we
        // can do is provide the raw `httpErr` we already have.
        cb(httpErr);
        return;
    }

    // We are assuming the Buckets API is never going to return binary
    // body content for an error response.
    res.setEncoding('utf8');
    res.on('data', function onData(chunk) {
        chunks.push(chunk);
    });

    res.once('end', function onEnd() {
        var bodyStr = chunks.join('');
        var info = null;
        try {
            info = JSON.parse(bodyStr);
        } catch (parseErr) {
            res.log.trace({err: parseErr, bodyStr: bodyStr},
                'could not parse API response body');
        }

        if (!info) {
            // TODO: Consider showing some/all of a HTML error from, say, an LB
            // if have a repro for that.
            cb(httpErr);
            return;
        }

        // JSSTYLED
        // Minimal https://github.com/joyent/eng/blob/master/docs/index.md#error-handling
        // schema checking.
        if (typeof (info.code) !== 'string' ||
            typeof (info.message) !== 'string') {
            res.log.trace({body: info},
                'parsed API response body does not have expected ' +
                '"code" and "message"');
            cb(httpErr);
            return;
        }

        var code = info.code;
        var message = info.message;
        var name = code;
        if (!/Error$/.test(name)) {
            name += 'Error';
        }
        delete info.message;
        delete info.code;
        info['x-request-id'] = res.headers['x-request-id'];

        var err = new VError({name: name, info: info}, message);

        // Set err.code because cmdln.main will print that (showCode=true).
        err.code = code;

        cb(err);
    });
}


// ---- MantaBucketsClient

/*
 * Dev Note: Buckets-specific parts of the `client.MantaClient` are here in
 * a subclass of that. This is to try to reduce the size of "client.js".
 * The common `manta.createClient()` methods take a `klass` option that can
 * be set to `MantaBucketsClient`.
 *
 * Example usage:
 *
 *      var buckets = require('manta');
 *      var manta = require('manta');
 *
 *      var client = manta.createBinClient({
 *          klass: buckets.MantaBucketsClient,
 *          log: log,
 *          // ...
 *      });
 */
function MantaBucketsClient(opts) {
    assert.object(opts, 'opts');

    MantaClient.call(this, opts);
}
util.inherits(MantaBucketsClient, MantaClient);


/*
 * Return an API path for the given bucket endpoint.
 *
 * @param {String} bucketName - Optional. If not given, then the
 *      `/$login/buckets` base API path is returned.
 */
MantaBucketsClient.prototype.bPath = function bPath(bucketName) {
    assert.string(this.user, 'this.user');
    assert.optionalString(bucketName, 'bucketName');

    if (bucketName === undefined) {
        return (format('/%s/buckets', this.user));
    } else {
        assert.ok(bucketName.length, 'bucketName cannot be the empty string');
        return (format('/%s/buckets/%s', this.user,
            encodeURIComponent(bucketName)));
    }
};

/*
 * Return an API path for the given bucket **objects** endpoint.
 *
 * @param {String} bucketName - Required. The bucket name.
 * @param {String} objectName - Optional. If not given, then the
 *      `/$login/buckets/$bucketName/objects` base path is returned.
 */
MantaBucketsClient.prototype.boPath = function boPath(bucketName, objectName) {
    assert.string(this.user, 'this.user');
    assert.string(bucketName, 'bucketName');
    assert.ok(bucketName.length, 'bucketName cannot be the empty string');
    assert.optionalString(objectName, 'objectName');

    if (objectName === undefined) {
        return format('/%s/buckets/%s/objects',
            this.user,
            encodeURIComponent(bucketName));
    } else {
        assert.ok(objectName.length, 'objectName cannot be the empty string');
        return format('/%s/buckets/%s/objects/%s',
            this.user,
            encodeURIComponent(bucketName),
            encodeURIComponent(objectName));
    }
};


/*
 * IsBucketsSupported (OPTIONS /:login/buckets)
 *
 * Check whether this Manta supports buckets.
 *
 * @param {Object} opts - Request options. See `mkBucketReqOpts` for defaults.
 * @param {Function} cb - `function (err, isSupported)` where `isSupported`
 *      is `true` or `false`. If there is an `err`, then `isSupported` will
 *      be `null`.
 */
MantaBucketsClient.prototype.isBucketsSupported =
function isBucketsSupported(opts, cb) {
    if (typeof (opts) === 'function') {
        cb = opts;
        opts = null;
    } else {
        assert.object(opts, 'opts');
    }
    assert.func(cb, 'cb');

    var self = this;
    var reqOpts = mkBucketReqOpts(
        self.bPath(),
        {
            log: self.log
        },
        opts);

    self.signRequest({
        headers: reqOpts.headers
    }, function onSignRequest(signErr) {
        if (signErr) {
            cb(signErr);
            return;
        }

        self.client.opts(reqOpts, function onReq(reqErr, req) {
            if (reqErr) {
                req.log.debug(reqErr, 'IsBucketsSupported error');
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
                            readBucketApiErr(resErr, res, cb);
                            break;
                    }
                });

                res.resume();
            });
        });
    });
};


/*
 * ListBuckets (GET /:login/buckets) -- with pagination
 *
 * Create and return a stream of buckets records. This will page through all
 * results, possibly making multiple requests to the server.
 *
 * Usage example:
 *
 *      var s = client.createListBucketsStream();
 *      s.on('readable', function onReadable() {
 *          var result;
 *          while ((result = s.read()) !== null) {
 *              console.log('BUCKET or GROUP result:', result);
 *          }
 *      });
 *      s.once('error', function onError(err) {
 *          cb(new VError(err, 'createListBucketsStream stream error'));
 *      });
 *      s.once('end', function onEnd() {
 *          cb();
 *      });
 *
 * Records look like this:
 *      {"name":"bukkit1100","type":"bucket","mtime":"2019-08-07T23:02:06.870Z"}
 *
 * If 'delimiter' is given, then one may get group records like this (in this
 * example `delimiter = '-'`):
 *      {"name":"foo-","type":"group"}
 *
 * @param {Object} opts - Request options. See `mkBucketReqOpts` for defaults.
 *      - {Boolean} rawString - Optional. Just stream back the raw response
 *        chunks as strings (not bytes, not *that* raw) without spending the
 *        cycles to parse the JSON.
 *      - query:
 *          - limit - An integer number of results to return for each
 *            request. This defaults to 1024.
 *          - prefix - A string prefix that bucket names must match to be
 *            returned.
 *          - marker - A continuation marker at which to start results.
 *            (Note: Typically this query parameter is only used internally for
 *            pagination and is not specified directly by the caller.)
 *          - delimiter - A character to use to *group* names with a common
 *            prefix delineated by this character. (Note: Typically this
 *            query parameter is not used for *bucket* listing. It is more
 *            common for *object* listing.)
 */
MantaBucketsClient.prototype.createListBucketsStream =
function createListBucketsStream(opts) {
    assert.optionalObject(opts, 'opts');
    if (opts) {
        assert.optionalBool(opts.rawString, 'opts.rawString');
    }

    var self = this;
    var numReqs = 0;  // number of requests made
    var reqOpts = mkBucketReqOpts(
        self.bPath(),
        {
            log: self.log,
            query: {
                limit: 1024
            }
        },
        opts);

    // Determining the marker for the next page of results.
    //
    // LOMStream has a hook function to get the marker from the last *object*
    // (or chunk) of streamed results. For the ListBuckets API, however, the
    // marker is determined by the "Next-Marker" response header. Therefore
    // we save the last response headers and ignore the given "_obj" to
    // determine the marker.
    //
    // Note that LOMStream calls this `markerFromObj` hook for *every*
    // object/chunk, so the function should be reasonably efficient.
    var lastResHeaders;
    var markerFromObj = function (_obj) {
        return (lastResHeaders['next-marker']);
    };

    function fetch(_fetchArg, limitObj, dataCb, doneCb) {
        reqOpts.query.limit = limitObj.limit;
        if (numReqs === 0) {
            // If this is the first request, then allow a given initial
            // `marker` query param.
            // jsl:pass
        } else if (limitObj.marker) {
            reqOpts.query.marker = limitObj.marker;
        } else {
            delete reqOpts.query.marker;
        }
        numReqs++;

        self.signRequest({
            headers: reqOpts.headers
        }, function onSignRequest(signErr) {
            if (signErr) {
                doneCb(signErr);
                return;
            }

            self.get(reqOpts.path, reqOpts,
                     function onGet(getErr, stream, res) {
                lastResHeaders = res.headers;
                if (getErr) {
                    doneCb(new VError(getErr, 'Manta ListBuckets error: %s',
                        getErr.name));
                    return;
                }

                var sjs;
                var terminus; // The last stream in the pipeline.
                var handleErr = function (err) {
                    // TODO: Should this need to guard against double call?
                    if (sjs) {
                        stream.unpipe(sjs);
                    }
                    if (res && res.socket && res.socket.destroy) {
                        res.socket.destroy();
                    }
                    doneCb(err);
                };

                stream.once('error', handleErr);

                if (reqOpts.rawString) {
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
                    // Ensure this transfer (if transfer-encoding: chunked)
                    // is complete.
                    // Dev Note: Perhaps this should be in MantaClient.get?
                    if (!res.complete) {
                        doneCb(new VError(
                            'incomplete chunked encoding transfer (req_id=%s)',
                            res.headers['x-request-id']));
                        return;
                    }

                    var done = ! Object.prototype.hasOwnProperty.call(
                        res.headers, 'next-marker');

                    // `results: []` is LOMStream-speak for "I've no extra
                    // results to provide, because I've been using `dataCb`
                    // for all results."
                    doneCb(null, {done: done, results: []});
                });
            });
        });
    }

    return new LOMStream({
        fetch: fetch,
        limit: reqOpts.query.limit,
        marker: markerFromObj
    });
};

/*
 * HeadBucket (HEAD /:login/buckets/:bucket)
 *
 * Get info (headers from a HEAD request) on a bucket.
 *
 * @param {String} bucketName
 * @param {Object} opts - Request options. See `mkBucketReqOpts` for defaults.
 * @param {Function} cb - `function (err, res)`. If there is an error
 *      `err` will be set and the other args will be undefined. Otherwise,
 *      `res` is the response object with the headers.
 */
MantaBucketsClient.prototype.headBucket =
function headBucket(bucketName, opts, cb) {
    assert.string(bucketName, 'bucketName');
    if (typeof (opts) === 'function') {
        cb = opts;
        opts = null;
    } else {
        assert.object(opts, 'opts');
    }
    assert.func(cb, 'cb');

    var self = this;
    var reqOpts = mkBucketReqOpts(
        self.bPath(bucketName),
        {
            log: self.log
        },
        opts);

    self.signRequest({
        headers: reqOpts.headers
    }, function onSignRequest(err) {
        if (err) {
            cb(err);
            return;
        }

        self.client.head(reqOpts, function onReq(reqErr, req) {
            if (reqErr) {
                req.log.debug(reqErr, 'HeadBucket error');
                cb(reqErr);
                return;
            }

            req.once('result', function onRes(resErr, res) {
                if (!res) {
                    readBucketApiErr(resErr, res, cb);
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
 * @param {Object} opts - Request options. See `mkBucketReqOpts` for defaults.
 * @param {Function} cb - `function (err)`
 */
MantaBucketsClient.prototype.createBucket =
function createBucket(bucketName, opts, cb) {
    assert.string(bucketName, 'bucketName');
    if (typeof (opts) === 'function') {
        cb = opts;
        opts = null;
    } else {
        assert.object(opts, 'opts');
    }
    assert.func(cb, 'cb');

    var self = this;
    var reqOpts = mkBucketReqOpts(
        self.bPath(bucketName),
        {
            log: self.log
        },
        opts);

    self.signRequest({
        headers: reqOpts.headers
    }, function onSignRequest(signErr) {
        if (signErr) {
            cb(signErr);
            return;
        }

        self.client.put(reqOpts, function onReq(reqErr, req) {
            if (reqErr) {
                req.log.debug(reqErr, 'CreateBucket error');
                cb(reqErr);
                return;
            }

            req.once('result', function onRes(resErr, res) {
                if (resErr) {
                    if (res && res.statusCode === 409) {
                        cb(new WError(resErr, 'bucket "%s" already exists',
                            bucketName));
                    } else {
                        readBucketApiErr(resErr, res, cb);
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
 * @param {Object} opts - Request options. See `mkBucketReqOpts` for defaults.
 * @param {Function} cb - `function (err)`
 */
MantaBucketsClient.prototype.deleteBucket =
function deleteBucket(bucketName, opts, cb) {
    assert.string(bucketName, 'bucketName');
    if (typeof (opts) === 'function') {
        cb = opts;
        opts = null;
    } else {
        assert.object(opts, 'opts');
    }
    assert.func(cb, 'cb');

    var self = this;
    var reqOpts = mkBucketReqOpts(
        self.bPath(bucketName),
        {
            log: self.log
        },
        opts);

    self.signRequest({
        headers: reqOpts.headers
    }, function onSignRequest(signErr) {
        if (signErr) {
            cb(signErr);
            return;
        }

        self.client.del(reqOpts, function onReq(reqErr, req) {
            if (reqErr) {
                req.log.debug(reqErr, 'DeleteBucket error');
                cb(reqErr);
                return;
            }

            req.once('result', function onRes(resErr, res) {
                if (resErr) {
                    switch (res && res.statusCode) {
                        case 404:
                            cb(new WError(resErr, 'bucket "%s" does not exist',
                                bucketName));
                            break;
                        case 409:
                            cb(new WError(resErr, 'bucket "%s" is not empty',
                                bucketName));
                            break;
                        default:
                            readBucketApiErr(resErr, res, cb);
                            break;
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
 * Create and return a stream of bucket object records. This will page through
 * all results, possibly making multiple requests to the server.
 *
 * Usage example:
 *
 *      var s = client.createListBucketObjectsStream();
 *      s.on('readable', function onReadable() {
 *          var result;
 *          while ((result = s.read()) !== null) {
 *              console.log('OBJECT or GROUP result:', result);
 *          }
 *      });
 *      s.once('error', function onError(err) {
 *          cb(new VError(err, 'createListBucketObjectsStream stream error'));
 *      });
 *      s.once('end', function onEnd() {
 *          cb();
 *      });
 *
 * Records look like this (here split over multiple lines for readability):
 *      {
 *        "name": "myfile",
 *        "type": "bucketobject",
 *        "etag": "088a7d49-3efa-e399-ede7-a6f656d7a289",
 *        "size": 1234,
 *        "contentType": "application/octet-stream",
 *        "contentMD5": "1B2M2Y8AsgTpgAmY7PhCfg==",
 *        "mtime": "2019-08-19T19:38:11.096Z"
 *      }
 *
 * If 'delimiter' is given, then one may get group records like this (in this
 * example `delimiter = '/'`):
 *      {"name":"mydir/","type":"group"}
 *      {"name":"anotherdir/","type":"group"}
 *
 * @param {Object} opts - Request options. See `mkBucketReqOpts` for defaults.
 *      - {Boolean} rawString - Optional. Just stream back the raw response
 *        chunks as strings (not bytes, not *that* raw) without spending the
 *        cycles to parse the JSON.
 *      - query:
 *          - limit - An integer number of results to return for each
 *            request. This defaults to 1024.
 *          - prefix - A string prefix that object names must match to be
 *            returned.
 *          - marker - A continuation marker at which to start results.
 *            (Note: Typically this query parameter is only used internally for
 *            pagination and is not specified directly by the caller.)
 *          - delimiter - A character to use to *group* names with a common
 *            prefix delineated by this character.
 */
MantaBucketsClient.prototype.createListBucketObjectsStream =
function createListBucketObjectsStream(bucketName, opts) {
    assert.string(bucketName, 'bucketName');
    assert.optionalObject(opts, 'opts');
    if (opts) {
        assert.optionalBool(opts.rawString, 'opts.rawString');
    }

    var self = this;
    var numReqs = 0;  // number of requests made
    var reqOpts = mkBucketReqOpts(
        self.boPath(bucketName),
        {
            log: self.log,
            query: {
                limit: 1024
            }
        },
        opts);

    // Determining the marker for the next page of results.
    //
    // LOMStream has a hook function to get the marker from the last *object*
    // (or chunk) of streamed results. For the ListBucketObjects API, however,
    // the marker is determined by the "Next-Marker" response header. Therefore
    // we save the last response headers and ignore the given "_obj" to
    // determine the marker.
    //
    // Note that LOMStream calls this `markerFromObj` hook for *every*
    // object/chunk, so the function should be reasonably efficient.
    var lastResHeaders;
    var markerFromObj = function (_obj) {
        return (lastResHeaders['next-marker']);
    };

    function fetch(_fetchArg, limitObj, dataCb, doneCb) {
        reqOpts.query.limit = limitObj.limit;
        if (numReqs === 0) {
            // If this is the first request, then allow a given initial
            // `marker` query param.
            // jsl:pass
        } else if (limitObj.marker) {
            reqOpts.query.marker = limitObj.marker;
        } else {
            delete reqOpts.query.marker;
        }
        numReqs++;

        self.signRequest({
            headers: reqOpts.headers
        }, function onSignRequest(signErr) {
            if (signErr) {
                doneCb(signErr);
                return;
            }

            self.get(reqOpts.path, reqOpts,
                     function onGet(getErr, stream, res) {
                lastResHeaders = res.headers;
                if (getErr) {
                    doneCb(new VError(getErr,
                        'Manta ListBucketObjects error: %s', getErr.name));
                    return;
                }

                var sjs;
                var terminus; // The last stream in the pipeline.
                var handleErr = function (err) {
                    // TODO: Need this guard against double call?
                    if (sjs) {
                        stream.unpipe(sjs);
                    }
                    if (res && res.socket && res.socket.destroy) {
                        res.socket.destroy();
                    }
                    doneCb(err);
                };

                stream.once('error', handleErr);

                if (reqOpts.rawString) {
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
                    // Ensure this transfer (if transfer-encoding: chunked)
                    // is complete.
                    // Dev Note: Perhaps this should be in MantaClient.get?
                    if (!res.complete) {
                        doneCb(new VError(
                            'incomplete chunked encoding transfer (req_id=%s)',
                            res.headers['x-request-id']));
                        return;
                    }

                    var done = ! Object.prototype.hasOwnProperty.call(
                        res.headers, 'next-marker');

                    // `results: []` is LOMStream-speak for "I've no extra
                    // results to provide, because I've been using `dataCb`
                    // for all results."
                    doneCb(null, {done: done, results: []});
                });
            });
        });
    }

    return new LOMStream({
        fetch: fetch,
        limit: reqOpts.query.limit,
        marker: markerFromObj
    });
};

/*
 * CreateBucketObject (PUT /:login/buckets/:bucketName/objects/:objectName)
 *
 * @param {stream} inStream - A readable and *paused* input stream.
 * @param {String} bucketName
 * @param {String} objectName
 * @param {Object} opts - Optional. Request options. See `mkBucketReqOpts`
 *      for defaults.
 *      - headers:
 *          - `m-*` headers enable custom metadata to be attached to an
 *            object. E.g. use `{"headers": {"m-foo": "bar"}}` to have a
 *            "foo" metadatum with value "bar" associated with the created
 *            object. Metadata names are case-insensitive
 *            (they will be lowercased) and values must be a string.
 *          - content-md5 XXX
 *          - durability-level - Set to an integer number of copies to store
 *            on the server. The server-side default is 2.
 *              XXX test
 *          - if-unmodified-since XXX
 *          - if-match XXX
 *          - if-none-match XXX
 * @param {Function} cb - `function (err, stream, res)`. If there is an error
 *      getting the stream, `err` will be set and the other args will be
 *      undefined. Otherwise, `stream` is a readable stream, and `res` is
 *      the response object.
 */
MantaBucketsClient.prototype.createBucketObject =
function createBucketObject(inStream, bucketName, objectName, opts, cb) {
    assert.object(inStream, 'inStream');
    assert.string(bucketName, 'bucketName');
    assert.string(objectName, 'objectName');
    if (typeof (opts) === 'function') {
        cb = opts;
        opts = null;
    } else {
        assert.object(opts, 'opts');
    }
    assert.func(cb, 'cb');

    var self = this;
    var reqOpts = mkBucketReqOpts(
        self.boPath(bucketName, objectName),
        {
            headers: {
                expect: '100-continue'
            },
            log: self.log
        },
        opts);

    self.signRequest({
        headers: reqOpts.headers
    }, function onSignRequest(signErr) {
        if (signErr) {
            cb(signErr);
            return;
        }

        self.client.put(reqOpts, function onReq(reqErr, req) {
            if (reqErr) {
                req.log.debug(reqErr, 'PutBucketObject error');
                cb(reqErr);
                return;
            }

            req.once('result', function onRes(resErr, res) {
                if (resErr) {
                    readBucketApiErr(resErr, res, cb);
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
                req.log.debug('continue received');
                if (inStream.readable) {
                    inStream.pipe(req);
                    inStream.resume();
                } else {
                    // TODO: When is the input not readable? Zero bytes?
                    req.log.trace('inStream is not readable');
                    req.end();
                }
            });
        });
    });
};


/*
 * GetBucketObject (GET /:login/buckets/:bucket/objects/:object)
 *
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
 * @param {Object} opts - Request options. See `mkBucketReqOpts` for defaults.
 *      - headers:
 *          - if-modified-since XXX
 *          - if-unmodified-since XXX
 *          - if-match XXX
 *          - if-none-match XXX
 * @param {Function} cb - `function (err, stream, res)`. If there is an error
 *      getting the stream, `err` will be set and the other args will be
 *      undefined. Otherwise, `stream` is a readable stream, and `res` is
 *      the response object.
 */
MantaBucketsClient.prototype.getBucketObject =
function getBucketObject(bucketName, objectName, opts, cb) {
    assert.string(bucketName, 'bucketName');
    assert.string(objectName, 'objectName');
    if (typeof (opts) === 'function') {
        cb = opts;
        opts = null;
    } else {
        assert.object(opts, 'opts');
    }
    assert.func(cb, 'cb');

    var self = this;
    var reqOpts = mkBucketReqOpts(
        self.boPath(bucketName, objectName),
        {
            log: self.log,
            // See note below about using `self.get()`.
            skipEncode: true
        },
        opts);

    // We re-use the `MantaClient.get` method because it has handy handling
    // for resuming on disconnect, and erroring on content-length or
    // content-md5 failures. However, many of MantaClient methods have
    // "directory-based Manta API"-isms. E.g.:
    // - They tend to (re-)encode the URL path components via
    //   `MantaClient.path`, which breaks our already encoded path, `endpoint`.
    //   Because `objectName` can include URI-encoded '/' chars we cannot use
    //   `MantaClient.path`. This is why we pass `reqOpts.skipEncode = true`.
    // - client.js#createOptions includes handling for options specific to
    //   dir-based Manta.
    self.get(reqOpts.path, reqOpts, cb);
};


/*
 * HeadBucketObject (HEAD /:login/buckets/:bucket/objects/:object)
 *
 * Get info (headers from a HEAD request) on a bucket object.
 *
 * @param {String} bucketName
 * @param {String} objectName
 * @param {Object} opts - Request options. See `mkBucketReqOpts` for defaults.
 *      - headers:
 *          - if-modified-since XXX
 *          - if-unmodified-since XXX
 *          - if-match XXX
 *          - if-none-match XXX
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
        opts = null;
    } else {
        assert.object(opts, 'opts');
    }
    assert.func(cb, 'cb');

    var self = this;
    var reqOpts = mkBucketReqOpts(
        self.boPath(bucketName, objectName),
        {
            log: self.log
        },
        opts);

    self.signRequest({
        headers: reqOpts.headers
    }, function onSignRequest(err) {
        if (err) {
            cb(err);
            return;
        }

        self.client.head(reqOpts, function onReq(reqErr, req) {
            if (reqErr) {
                req.log.debug(reqErr, 'HeadBucketObject error');
                cb(reqErr);
                return;
            }

            req.once('result', function onRes(resErr, res) {
                if (!res) {
                    readBucketApiErr(resErr, res, cb);
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
 * @param {Object} opts - Request options. See `mkBucketReqOpts` for defaults.
 *      - headers:
 *          - if-unmodified-since XXX
 *          - if-match XXX
 *          - if-none-match XXX
 * @param {Function} cb - `function (err)`
 */
MantaBucketsClient.prototype.deleteBucketObject =
function deleteBucketObject(bucketName, objectName, opts, cb) {
    assert.string(bucketName, 'bucketName');
    assert.string(objectName, 'objectName');
    if (typeof (opts) === 'function') {
        cb = opts;
        opts = null;
    } else {
        assert.object(opts, 'opts');
    }
    assert.func(cb, 'cb');

    var self = this;
    var reqOpts = mkBucketReqOpts(
        self.boPath(bucketName, objectName),
        {
            log: self.log
        },
        opts);

    self.signRequest({
        headers: reqOpts.headers
    }, function onSignRequest(signErr) {
        if (signErr) {
            cb(signErr);
            return;
        }

        self.client.del(reqOpts, function onReq(reqErr, req) {
            if (reqErr) {
                req.log.debug(reqErr, 'DeleteBucketObject error');
                cb(reqErr);
                return;
            }

            req.once('result', function onRes(resErr, res) {
                if (resErr) {
                    if (res && res.statusCode === 404) {
                        cb(new WError(resErr, 'bucket "%s" does not exist',
                            bucketName));
                    } else {
                        readBucketApiErr(resErr, res, cb);
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
    MantaBucketsClient: MantaBucketsClient,
    // Exported for testing.
    mkBucketReqOpts: mkBucketReqOpts
};

/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * Manta buckets common functionality.
 */

var util = require('util');

var assert = require('assert-plus');
var LOMStream = require('lomstream').LOMStream;
var VError = require('verror');

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



// --- exports

module.exports = {
    MantaBucketsClient: MantaBucketsClient
};

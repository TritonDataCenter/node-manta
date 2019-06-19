/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * Manta buckets common functionality.
 */

var util = require('util');

var assert = require('assert-plus');
var LOMStream = require('lomstream').LOMStream;

var MantaClient = require('./client').MantaClient;


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

// XXX This should change to a createListBucketsStream using lomstream
//      when paging is supported.
MantaBucketsClient.prototype.listBuckets = function listBuckets(cb) {
    XXXlistBuckets
};

// XXX doc opts
// XXX How does the user use this? I totally forget LOMStream usage.
MantaBucketsClient.prototype.createListBucketsStream =
function createListBucketsStream(opts) {
    assert.object(opts, 'opts');

    var self = this;
    var endpoint = self._path('~~/buckets');
    // If a `limit` is specified, we don't paginate.
    var once = opts.limit !== undefined;

    return new LOMStream({
        fetch: fetch,
        limit: 1000,
        offset: true
    });

    function fetch(_fetchArg, limitObj, _dataCb, doneCb) {
        opts.limit = limitObj.limit;
        opts.offset = limitObj.offset;

        // XXX wrap up _request here?
        self._request(endpoint, function (err, req, res, body) {
            if (err) {
                doneCb(err);
                return;
            }

            // XXX ListBuckets paging isn't yet implemented, so I don't know
            //     the mechanism for noticing that we are "done". This is
            //     what CloudAPI ListMachines does:
            // var resourcecount = res.headers['x-resource-count'];
            // var done = once || resourcecount < options.limit;
            done = true;

            doneCb(null, {done: done, results: body});
        });
    }
};



// --- exports

module.exports = {
    MantaBucketsClient: MantaBucketsClient
};

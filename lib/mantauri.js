/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * Parsing and validation of Manta URIs.
 *
 *
 * # Limitation: only short-form Manta URIs are currently supported
 *
 * Currently this module only supports the shortest form of Manta URIs:
 *
 *      manta:<bucket name>[/<prefix or object>]
 *
 * `MantaUri` objects have `host` and `login` fields. With the current
 * implementation those will always be `null`.
 *
 * Why the limitation? The longer "manta:" URIs forms support referring
 * (should we need) to another account's bucket in the same Manta region:
 *
 *      manta:/bob/somebucket/bar.txt
 *
 * and a bucket in another region:
 *
 *       manta://manta.staging.joyent.us/nightly/nightly-1-logs/sapi/...42.log
 *
 * However, the current Buckets system doesn't support this access, so there
 * hasn't yet been a need for the full parsing implementation.
 *
 *
 * # Manta URIs
 *
 * A *full* manta URI looks like this:
 *
 *      manta://<manta url>/<account login>/<bucket name>[/<prefix or object>]
 *              HOST                     LOGIN  BUCKET   KEY
 *              ------------------------ ------ -------- -------
 *      manta://us-east.manta.joyent.com/trentm/mybucket/foo.txt
 *
 * The intent is to follow URI rules per RFD 3986. Per that RFD we can provide
 * shorter forms:
 *
 * - The "host" part (called "authority" in the RFD) can be elided, which
 *   means it will default to the current `MANTA_URL`:
 *
 *          manta:/<account login>/<bucket name>[/<prefix or object>]
 *          # E.g.:
 *          manta:///trentm/mybucket/foo.txt
 *          manta:/trentm/mybucket/foo.txt
 *
 *   Note that *two* leading slashes, e.g. `manta://trentm/bucket/foo.txt`,
 *   is incorrect. That would put the `<account login>` in the HOST position.
 *
 * - Manta URIs implicitly are interpreted with a base path of
 *   `/<account login>`, such that when only working with buckets owned
 *   by the current `MANTA_USER` we can use:
 *
 *          manta:<bucket name>[/<prefix or object>]
 *          # E.g.:
 *          manta:mybucket/foo.txt
 *          manta:mybucket/my/other/object.jpg
 *
 * The following are equivalent (assuming `MANTA_USER=trentm` and
 * `MANTA_URL=https://us-east.manta.joyent.com`.
 *
 *          manta://us-east.manta.joyent.com/trentm/mybucket/foo.txt
 *          manta:///trentm/mybucket/foo.txt
 *          manta:/trentm/mybucket/foo.txt
 *          manta:mybucket/foo.txt
 *
 *
 * # Usage
 *
 *      > var MantaUri = require('./lib/mantauri').MantaUri;
 *
 *
 * From a "manta:..." URI string:
 *
 *      > muri = new MantaUri('manta:mybucket/foo.txt')
 *      MantaUri { host: null, login: null, bucket: 'mybucket', object: 'foo.txt' }
 *      > muri.toString()
 *      'manta:mybucket/foo.txt'
 *
 * From the individual four components:
 *
 *      > muri = new MantaUri(null, null, 'mybucket', 'foo.txt');
 *      MantaUri { host: null, login: null, bucket: 'mybucket', object: 'foo.txt' }
 *      > muri.toString()
 *      'manta:mybucket/foo.txt'
 */

var assert = require('assert-plus');
var VError = require('verror');


// Dev Note: Should the node.js Manta bucket name parsing rules be shared
// with muskie code? Probably.
function isValidBucketName(_bucket) {
    // XXX Discussing whether to have a shared module with muskie for validation
    // or just leave it to server validataion.
    return true;
}

function isValidObjectPath(_object) {
    // XXX Check if muskie will have code to validate these.
    return true;
}

/*
 * Create a new MantaUri object either from:
 *
 * - a "manta:..." URI string, or
 * - from the 4 components: host, login, bucket, object
 *
 * This throws if the string cannot be parsed as a Manta URI or any of the four
 * components are invalid.
 */
function MantaUri(s) {
    // XXX do the dance with missing `new`?

    if (arguments.length === 1) {
        assert.string(s, 'Manta URI string');
        this._parse(s);
    } else if (arguments.length === 4) {
        assert.optionalString(arguments[0], 'host');
        assert.optionalString(arguments[1], 'login');
        assert.string(arguments[2], 'bucket');
        assert.optionalString(arguments[3], 'object');

        if (arguments[0] === null) {
            this.host = arguments[0];
        } else {
            throw new VError('"%s": host is non-null: ' +
                'do not yet support long URI forms', arguments[0]);
        }
        if (arguments[1] === null) {
            this.login = arguments[1];
        } else {
            throw new VError('"%s": login is non-null: ' +
                'do not yet support long URI forms', arguments[1]);
        }
        if (isValidBucketName(arguments[2])) {
            this.bucket = arguments[2];
        } else {
            throw new VError('invalid Manta bucket name: "%s"', arguments[2]);
        }
        if (isValidObjectPath(arguments[3])) {
            this.object = arguments[3];
        } else {
            throw new VError('invalid Manta object path: "%s"', arguments[3]);
        }
    } else {
        throw new Error('incorrect number of arguments');
    }

}

MantaUri.prototype._parse = function _parse(s) {
    // Limitation: Only support `manta:<bucket>[/<prefix or object>]` form.

    var part;
    var slashIdx;

    this.host = null;
    this.login = null;
    this.bucket = null;
    this.object = null;

    if (s.slice(0, 6) !== 'manta:') {
        throw new VError(
            '"%s": cannot parse as a Manta URI: scheme is not "manta:"', s);
    }

    if (s.length === 6) {
        throw new VError(
            '"%s": cannot parse as a Manta URI: missing bucket name', s);
    }

    if (s[6] === '/') {
        throw new VError('"%s": cannot parse as a Manta URI: ' +
            'do not yet support long URI forms', s);
    }

    slashIdx = s.indexOf('/');
    if (slashIdx === -1) {
        part = s.slice(6);
    } else {
        part = s.slice(6, slashIdx);
    }
    if (!isValidBucketName(part)) {
        throw new VError('"%s": bucket name "%s" is invalid', s, part);
    }
    this.bucket = part;

    if (slashIdx !== -1) {
        part = s.slice(slashIdx + 1);
        if (part) {
            if (!isValidObjectPath(part)) {
                throw new VError('"%s": object path "%s" is invalid', s, part);
            }
            this.object = part;
        }
    }
};

MantaUri.prototype.toString = function toString() {
    assert.equal(this.host, null);
    assert.equal(this.login, null);
    assert.string(this.bucket, 'this.bucket');

    var parts = [this.bucket];
    if (this.object) {
        parts.push(this.object);
    }
    return 'manta:' + parts.join('/');
};


// ---- exports

module.exports = {
    MantaUri: MantaUri
};

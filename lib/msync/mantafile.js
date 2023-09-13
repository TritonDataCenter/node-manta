/**
 * manta file object
 *
 * Author: Dave Eddy <dave@daveeddy.com>
 * Date: January 24, 2015
 * License: MIT
 */

var EventEmitter = require('events').EventEmitter;
var util = require('util');

var File = require('./file');
var path = require('path-platform');

module.exports = MantaFile;

util.inherits(MantaFile, File);
function MantaFile(_path, _client) {
    File.call(this);
    this.path = _path;
    this.client = _client;
}

// get manta info
MantaFile.prototype.info = function info(opts, cb) {
    var self = this;
    if (typeof (opts) === 'function') {
        cb = opts;
        opts = null;
    }
    opts = opts || {};

    // return cached version if available
    if (this._cached_info) {
        cb(null, this._cached_info);
        return;
    }

    // get the info and cache it
    this.client.info(this.path, function (err, _info) {
        if (err)
            return (cb(err));

        _info.md5 = new Buffer.from(_info.md5, 'base64').toString('hex');
        self._cached_info = _info;

        return (cb(null, _info));
    });
};

// remove the remote filex
MantaFile.prototype.remove = function remove(cb) {
    return (this.client.unlink(this.path, cb));
};

// create a read stream
MantaFile.prototype.createReadStream = function createReadStream() {
    return (this.client.createReadStream(this.path));
};

// put a file
MantaFile.prototype.put = function put(rs, opts, cb) {
    return (this.client.put(this.path, rs, opts, cb));
};

// list manta files
MantaFile.prototype.ftw = function ftw(opts, cb) {
    var self = this;
    if (typeof (opts) === 'function') {
        cb = opts;
        opts = null;
    }
    opts = opts || {};

    var ee = new EventEmitter();
    self.client.ftw(self.path, opts, function (err, res) {
        if (err)
            return (cb(err));

        cb(null, ee);

        process.nextTick(function () {
            res.on('entry', function (d) {
                if (d.type !== 'object')
                    return;
                ee.emit('file', path.posix.join(d.parent, d.name));
            });
            res.on('end', function () {
                ee.emit('end');
            });
        });
        return (0);
    });
};

/**
 * local file object
 *
 * Author: Dave Eddy <dave@daveeddy.com>
 * Date: January 24, 2015
 * License: MIT
 */

var crypto = require('crypto');
var EventEmitter = require('events').EventEmitter;
var fs = require('fs');
var path = require('path');
var util = require('util');

var mkdirp = require('mkdirp');
var once = require('once');

var File = require('./file');
var Finder = require('./finder');

module.exports = LocalFile;

util.inherits(LocalFile, File);
function LocalFile(_path, _stat) {
    File.call(this);
    this.path = _path;
    this.stat = _stat;
}

// get local file info by doing a stat(2), and optionally
// getting the md5, stat(2) object will also be cached
LocalFile.prototype.info = function info(opts, cb) {
    var self = this;
    if (typeof (opts) === 'function') {
        cb = opts;
        opts = null;
    }
    opts = opts || {};

    // use cached stat data if available
    if (this.stat)
        statcb(null, this.stat);
    else
        fs.stat(this.path, statcb);

    // called when stat(2) data is available
    function statcb(err, stats) {
        if (err)
            return (cb(err));

        self.stat = stats;

        if (!self.stat.md5 && opts.md5) {
            // get the md5sum
            var md5sum = crypto.createHash('md5');
            var rs = self.createReadStream();
            rs.on('error', function (_err) {
                return (cb(_err));
            });
            rs.on('data', md5sum.update.bind(md5sum));
            rs.on('end', function () {
                self.stat.md5 = md5sum.digest('hex');
                cb(null, self.stat);
            });
        } else {
            cb(null, self.stat);
        }
        return (0);
    }
};

// remove the local file
LocalFile.prototype.remove = function remove(cb) {
    return (fs.unlink(this.path, cb));
};

// create a read stream
LocalFile.prototype.createReadStream = function createReadStream() {
    return (fs.createReadStream(this.path));
};

// put a file
LocalFile.prototype.put = function put(rs, opts, cb) {
    var self = this;
    if (typeof (opts) === 'function') {
        cb = opts;
        opts = null;
    }
    opts = opts || {};
    cb = once(cb);

    if (opts.mkdirs)
        mkdirp(path.dirname(this.path), write);
    else
        write();

    function write() {
        var ws = fs.createWriteStream(self.path);
        ws.on('error', cb);
        rs.on('error', cb);
        ws.on('finish', function () {
            cb();
        });
        rs.pipe(ws);
    }
};

// list local files
LocalFile.prototype.ftw = function ftw(opts, cb) {
    var self = this;
    if (typeof (opts) === 'function') {
        cb = opts;
        opts = null;
    }
    opts = opts || {};

    var ee = new EventEmitter();
    cb(null, ee);

    process.nextTick(function () {
        var f = new Finder(self.path, opts);
        f.on('file', function (fullpath, stat) {
            ee.emit('file', fullpath);
        });
        f.on('end', function () {
            ee.emit('end');
        });
    });
};

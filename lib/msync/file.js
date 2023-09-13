/**
 * generic file wrapper (abstract class)
 *
 * this class describes a "File" object, and should be subclassed
 * to define specific types of files, like "MantaFile", "LocalFile", etc.
 *
 * Author: Dave Eddy <dave@daveeddy.com>
 * Date: January 24, 2015
 * License: MIT
 */

module.exports = File;

function File() {
}

// get file info and return it as cb(e, info)
File.prototype.info = function info(cb) {
    throw new Error('not implemented');
};

// create a read stream and return it
File.prototype.createReadStream = function createReadStream() {
    throw new Error('not implemented');
};

// put a file
File.prototype.put = function put() {
    throw new Error('not implemented');
};

// delete a file
File.prototype.remove = function remove() {
    throw new Error('not implemented');
};

// ftw
File.prototype.ftw = function ftw() {
    throw new Error('not implemented');
};

// toString
File.prototype.toString = function toString() {
    return ('<' + this.constructor.name + ': ' + this.path + '>');
};

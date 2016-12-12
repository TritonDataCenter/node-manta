// Copyright 2017 Joyent, Inc.

var assert = require('assert-plus');
var stream = require('stream');
var util = require('util');


// Takes cipher + hmac/authTag stream of data and untangles the two
function ParseEtMStream(hmacType, contentLength, tagBytes, options) {
    assert.optionalNumber(tagBytes, 'tagBytes');
    if (!tagBytes) {
        assert.object(hmacType, 'hmacType');
        assert.number(hmacType.bytes, 'hmacType.bytes');
    }

    contentLength = parseInt(contentLength, 10);
    assert.number(contentLength);

    this._tagBytes = tagBytes || 0;
    this._offset = (contentLength - (this._tagBytes || hmacType.bytes));
    this._digestOrTag = new Buffer('');
    this._bytesRead = 0;
    this._contentLength = contentLength;

    stream.Transform.call(this, options);
}
util.inherits(ParseEtMStream, stream.Transform);


// Pass the chunks through until you have reached the offset for the hmac
// After the offset is reached, store the chunks in the _digest variable
ParseEtMStream.prototype._transform =
    function _transform(chunk, encoding, callback) {

    var chunkSize = Buffer.byteLength(chunk);

    // Check if we have reached the offset
    if ((chunkSize + this._bytesRead) <= this._offset) {
        this._bytesRead += chunkSize;
        callback(null, chunk);
        return;
    }

    // Get number of bytes to read from the chunk into the cipher stream
    var bytesForCipher = this._offset - this._bytesRead;
    this._bytesRead += chunkSize;

    if (bytesForCipher > 0) {
        var cipher = chunk.slice(0, bytesForCipher);
        var digestOrTag = chunk.slice(bytesForCipher);
        this._digestOrTag = Buffer.concat([this._digestOrTag, digestOrTag]);
        this._tryEmitTag();

        callback(null, cipher);
        return;
    }

    this._digestOrTag = Buffer.concat([this._digestOrTag, chunk]);
    this._tryEmitTag();

    // Mark the stream as processed
    if (this._bytesRead === this._contentLength) {
        this.push(null);
    }

    callback();
};


ParseEtMStream.prototype.digest = function digest() {
    return (this._digestOrTag);
};


ParseEtMStream.prototype.tag = function tag() {
    return (this._digestOrTag);
};


ParseEtMStream.prototype._tryEmitTag = function _tryEmitTag() {
    if (this._tagBytes && !this._tagEmitted &&
        Buffer.byteLength(this._digestOrTag) >= this._tagBytes) {

        this._tagEmitted = true;
        this.emit('tag', this.tag());
    }
};

module.exports = ParseEtMStream;

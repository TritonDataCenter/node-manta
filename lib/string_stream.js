// Copyright (c) 2013 Joyent, Inc.  All rights reserved.
// vim: set syntax=javascript ts=4 sts=4 sw=4 et:

var util = require('util');
var stream = require('stream');
if (!stream.Readable)
    stream = require('readable-stream');

// The bare minimum Stream required to coerce put() into putting a string
// into Manta.

function StringStream(string, options) {
    this.instr = string;
    stream.Readable.call(this, options);
}
util.inherits(StringStream, stream.Readable);


StringStream.prototype._read = function _read() {
    this.push(this.instr);
    this.instr = null;
};



module.exports = StringStream;

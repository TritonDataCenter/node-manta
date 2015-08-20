/*
 * Copyright 2015 Joyent, Inc.
 */

var mod_assert = require('assert-plus');
var mod_util = require('util');
var mod_stream = require('stream');
if (!mod_stream.Readable) {
    mod_stream = require('readable-stream');
}

/*
 * Read newline-separated JSON and parse it.
 */
function StreamingJSONStream() {
    mod_stream.Transform.call(this, {
        objectMode: true,
        highWaterMark: 0
    });

    this.sjs_accum = '';
}
mod_util.inherits(StreamingJSONStream, mod_stream.Transform);

StreamingJSONStream.prototype.process = function process(inFlush, done) {
    var self = this;
    var idx;

    var parse = function (s) {
        var o;

        if (!s) {
            /*
             * Skip empty lines.
             */
            return (true);
        }

        try {
            o = JSON.parse(s);
        } catch (ex) {
            ex.data = s;
            done(ex);
            return (false);
        }

        mod_assert.notStrictEqual(o, null);
        self.push(o);
        return (true);
    };

    /*
     * Process each line as a JSON record:
     */
    while ((idx = self.sjs_accum.indexOf('\n')) !== -1) {
        var instr = self.sjs_accum.substr(0, idx).trim();
        self.sjs_accum = self.sjs_accum.substr(idx + 1);

        if (!parse(instr)) {
            return;
        }
    }

    if (inFlush) {
        mod_assert.strictEqual(self.sjs_accum.indexOf('\n'), -1);
        if (!parse(self.sjs_accum)) {
            return;
        }

        /*
         * Signal the end of the stream:
         */
        self.push(null);
    }

    done();
};

StreamingJSONStream.prototype._transform = function _transform(chunk, encoding,
    done) {

    var self = this;

    self.sjs_accum += chunk.toString();
    self.process(false, done);
};

StreamingJSONStream.prototype._flush = function _flush(done) {
    var self = this;

    self.process(true, done);
};

module.exports = StreamingJSONStream;

/* vim: set syntax=javascript ts=4 sts=4 sw=4 et: */

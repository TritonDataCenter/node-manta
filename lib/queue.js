// Copyright (c) 2012 Joyent, Inc.  All rights reserved.

var EventEmitter = require('events').EventEmitter;
var util = require('util');

var assert = require('assert-plus');
var once = require('once');



///-- Globals

var sprintf = util.format;



///--- Internals

function dispatch(w, t) {
    assert.func(w, 'worker');

    var q = this.queue;
    var self = this;

    var cb = once(function _cb(err) {
        self.dispatched--;
        if (err) {
            process.nextTick(function emitError() {
                self._end(err);
            });
            return;
        }

        if (q.length > 0) {
            if (self.dispatched < self.limit) {
                var _t = q.pop();
                self.dispatched++;
                process.nextTick(dispatch.bind(self, w, _t));
            }
            return;
        }

        if (self.dispatched === 0) {
            if (self.closed && !self.errored) {
                process.nextTick(function _done() {
                    self._end();
                });
            } else {
                process.nextTick(function _drain() {
                    self.emit('drain');
                });
            }
        }
    });

    w(t, cb);
}



///--API

function Queue(opts) {
    assert.object(opts, 'options');
    assert.number(opts.limit, 'options.limit');
    assert.func(opts.worker, 'options.worker');

    var self = this;

    EventEmitter.call(this);

    this.closed = false;
    this.dispatched = 0;
    this.limit = opts.limit;
    this.queue = [];
    this.worker = opts.worker;

    this._end = once(function end(err) {
        self.closed = true;
        if (err) {
            self.emit('error', err);
        } else {
            self.emit('end');
        }
    });
}
util.inherits(Queue, EventEmitter);
module.exports = Queue;


Queue.prototype.close = function close() {
    var self = this;

    function closeOnDrain() {
        self._end();
    }
    if (this.dispatched === 0) {
        process.nextTick(function closeEnd() {
            self._end();
        });
    } else {
        var listeners = this.listeners('drain');
        if (listeners.length === 0) {
            this.once('drain', closeOnDrain);
        } else if (listeners.some(function (l) {
            return (l.listener === closeOnDrain);
        })) {
            this.once('drain', closeOnDrain);
        }
    }
};


Queue.prototype.push = function push(task) {
    var q = this.queue;
    var w = this.worker;

    if (q.closed)
        return (false);

    if (this.dispatched >= this.limit) {
        q.push(task);
        this.emit('task');
        return (false);
    }

    this.dispatched++;
    process.nextTick(dispatch.bind(this, w, task));

    return (true);
};


Queue.prototype.toString = function toString() {
    var s = sprintf('[object Queue <size=%d, limit=%d, dispatched=%d>]',
                    this.queue.length,
                    this.limit,
                    this.dispatched);

    return (s);
};

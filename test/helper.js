// Copyright 2012 Joyent.  All rights reserved.

var domain = require('domain');

var bunyan = require('bunyan');
var once = require('once');
var restify = require('restify');



///--- Helpers

function createLogger(name, stream) {
    var log = bunyan.createLogger({
        level: (process.env.LOG_LEVEL || 'info'),
        name: name || process.argv[1],
        stream: stream || process.stdout,
        src: true,
        serializers: restify.bunyan.serializers
    });
    return (log);
}



///--- Exports

module.exports = {

    after: function after(teardown) {
        module.parent.exports.tearDown = function _teardown(callback) {
            var d = domain.create();
            var self = this;

            d.once('error', function (err) {
                console.error('after: uncaught error\n' + err.stack);
                process.exit(1);
            });

            d.run(function () {
                teardown.call(self, once(callback));
            });
        };
    },

    before: function before(setup) {
        module.parent.exports.setUp = function _setup(callback) {
            var d = domain.create();
            var self = this;

            d.once('error', function (err) {
                console.error('before: uncaught error\n' + err.stack);
                process.exit(1);
            });

            d.run(function () {
                setup.call(self, once(callback));
            });
        };
    },

    test: function test(name, tester) {
        module.parent.exports[name] = function _(t) {
            var d = domain.create();
            var self = this;

            d.once('error', function (err) {
                console.error('test: uncaught error\n' + err.stack);
                process.exit(1);
            });

            d.add(t);
            d.run(function () {
                t.end = once(function () {
                    t.done();
                });
                t.notOk = function notOk(ok, message) {
                    return (t.ok(!ok, message));
                };

                tester.call(self, t);
            });
        };
    },

    createLogger: createLogger

};

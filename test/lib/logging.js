/*
 * Copyright 2016 Joyent, Inc.
 */

/*
 * A common logger setup for test files.
 */

var assert = require('assert-plus');
var bunyan = require('bunyan');
var path = require('path');
// We are cheating here. restify-clients should export its 'bunyan'.
var restifyBunyanSerializers =
    require('restify-clients/lib/helpers/bunyan').serializers;

function createLogger() {
    return (bunyan.createLogger({
        name: path.basename(process.argv[1]),
        serializers: restifyBunyanSerializers,
        src: true,
        streams: [
            {
                level: (process.env.LOG_LEVEL || 'info'),
                stream: process.stderr
            }
        ]
    }));
}

module.exports = {
    createLogger: createLogger
};

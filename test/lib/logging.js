/*
 * Copyright 2016 Joyent, Inc.
 */

/*
 * A common logger setup for test files.
 */

var assert = require('assert-plus');
var bunyan = require('bunyan');
var path = require('path');
var restifyClients = require('restify-clients');

function createLogger() {
    return (bunyan.createLogger({
        name: path.basename(process.argv[1]),
        serializers: restifyClients.bunyan.serializers,
        src: true,
        streams: [
            {
                level: (process.env.TEST_LOG_LEVEL || 'info'),
                stream: process.stderr
            }
        ]
    }));
}

module.exports = {
    createLogger: createLogger
};

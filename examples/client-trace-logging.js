#!/usr/bin/env node
/**
 * Example node script showing how to get trace-level logging of the
 * *client-side* of talking to Manta.
 *
 * Usage:
 *      git clone https://github.com/TritonDataCenter/node-manta.git
 *      cd node-manta
 *      npm install
 *      node examples/client-trace-logging.js | bunyan
 */

var bunyan = require('bunyan');
var manta = require('../');


var log = bunyan.createLogger({
    name: 'client-trace-logging',
    level: 'trace',   // <---- set log level here
    serializers: bunyan.stdSerializers
});



var client = manta.createBinClient({log: log});

client.ls('~~/stor', function (err, results) {
    if (err) {
        log.error(err, 'ls failed');
        process.exit(1);
    }

    results.on('error', function (err) {
        log.error(err, 'ls results error');
    });
    results.on('entry', function (dirent) {
        log.info({dirent: dirent}, 'entry');
    });
    results.on('end', function () {
        log.info('end');
        process.exit(0);
    });
});

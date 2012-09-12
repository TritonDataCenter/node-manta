// Copyright (c) 2012, Joyent, Inc. All rights reserved.

var assert = require('assert-plus');
var bunyan = require('bunyan');
var clone = require('clone');
var restify = require('restify');

var auth = require('./auth');
var MantaClient = require('./client');



///--- API

function createClient(options) {
        assert.object(options, 'options');
        assert.func(options.sign, 'options.sign');

        var opts = clone(options);
        if (opts.connectTimeout === undefined)
                opts.connectTimeout = 0;

        opts.log = options.log;
        if (!opts.log) {
                opts.log = bunyan.createLogger({
                        name: 'MantaClient',
                        stream: process.stderr,
                        level: 'fatal',
                        serializers: restify.bunyan.serializers
                });
        }
        opts.sign = options.sign;

        return (new MantaClient(options));
}



///--- Exports

module.exports = {
        MantaClient: MantaClient,
        createClient: createClient,
        privateKeySigner: auth.privateKeySigner,
        sshAgentSigner: auth.sshAgentSigner
};

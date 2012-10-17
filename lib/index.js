// Copyright (c) 2012, Joyent, Inc. All rights reserved.

var assert = require('assert-plus');
var bunyan = require('bunyan');
var clone = require('clone');
var fs = require('fs');
var restify = require('restify');

var auth = require('./auth');
var MantaClient = require('./client');



///--- API

function createClient(options) {
        assert.object(options, 'options');
        assert.ok(options.sign, 'options.sign');

        var opts = clone(options);
        if (opts.connectTimeout === undefined)
                opts.connectTimeout = 0;

        if (!options.log) {
                opts.log = bunyan.createLogger({
                        name: 'MantaClient',
                        stream: process.stderr,
                        level: 'fatal',
                        serializers: restify.bunyan.serializers
                });
        } else {
                opts.log = options.log.child({
                        component: 'MantaClient',
                        serializers: restify.bunyan.serializers
                });
        }

        opts.agent = options.agent;
        opts.sign = options.sign;

        if (!(opts.sign instanceof Function)) {
                var sign = opts.sign;
                var key = null;
                assert.string(sign.keyId, 'options.sign.keyId');
                assert.string(sign.key, 'options.sign.key');
                try {
                        key = fs.readFileSync(sign.key, 'utf8');
                } catch (err) {
                        opts.log.fatal(err, 'cannot read signing key');
                        process.exit(1);
                }
                opts.sign = auth.privateKeySigner({
                        keyId: sign.keyId,
                        key: key,
                        user: opts.user
                });
        }

        return (new MantaClient(opts));
}


function createClientFromFile(filename, log) {
        assert.string(filename, 'filename');
        assert.object(log, 'log');

        var cfg = null;
        try {
                cfgData = fs.readFileSync(filename, 'utf8');
                cfg = JSON.parse(cfgData);
        } catch(err) {
                log.fatal(err, 'Error loading manta client config');
                process.exit(1);
        }
        assert.object(cfg.manta);
        cfg.manta.log = log;
        return createClient(cfg.manta);
}



///--- Exports

module.exports = {
        MantaClient: MantaClient,
        createClient: createClient,
        createClientFromFile: createClientFromFile,
        cliSigner: auth.cliSigner,
        privateKeySigner: auth.privateKeySigner,
        sshAgentSigner: auth.sshAgentSigner
};

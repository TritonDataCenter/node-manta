// Copyright (c) 2012, Joyent, Inc. All rights reserved.

var assert = require('assert-plus');
var auth = require('./auth');
var bunyan = require('bunyan');
var clone = require('clone');
var fs = require('fs');
var manta = require('./client');
var restify = require('restify');



///--- API

function createClient(options) {
        assert.object(options, 'options');

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

        if (opts.sign && !(opts.sign instanceof Function)) {
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

        return (new manta.MantaClient(opts));
}


function createClientFromFileSync(filename, log) {
        assert.string(filename, 'filename');
        assert.object(log, 'log');

        var cfg = null;
        try {
                var tmp = fs.readFileSync(filename, 'utf8');
                cfg = JSON.parse(tmp);
        } catch (err) {
                log.fatal(err, 'Error loading manta client config');
                process.exit(1);
        }

        assert.object(cfg.manta);
        cfg.manta.log = log;
        return (createClient(cfg.manta));
}


/**
 * Checks that the environment and/or opts are properly set up to create a Manta
 * Client.
 */
function checkBinEnv(opts) {
        assert.object(opts, 'options');

        if (!opts.url && !process.env.MANTA_URL) {
                throw new Error('url is a required argument');
        }

        var noAuth = opts.noAuth === true ||
                process.env.MANTA_NO_AUTH === 'true';

        if (!noAuth && !opts.user && !process.env.MANTA_USER) {
                throw new Error('account is a required argument');
        }

        if (!noAuth && !opts.keyId && !process.env.MANTA_KEY_ID) {
                throw new Error('keyId is a required argument');
        }
}


/**
 * Creates a Manta Client, checking environment variables to fill in potentially
 * missing fields from opts.
 */
function createBinClient(opts) {
        assert.object(opts.log);

        opts.url = opts.url || process.env.MANTA_URL;
        opts.noAuth = opts.noAuth || process.env.MANTA_NO_AUTH;
        opts.user = opts.user || process.env.MANTA_USER;
        opts.sign = null;
        if (!opts.noAuth) {
                var keyId = opts.keyId || process.env.MANTA_KEY_ID;

                opts.sign = auth.cliSigner({
                        keyId: keyId,
                        log: opts.log,
                        user: opts.user
                });
        }

        // All required...
        opts.connectTimeout = 1000;
        opts.retry = false;

        // All other options (headers, etc.) should fall through.
        return (createClient(opts));
}



///--- Exports

module.exports = {
        createClient: createClient,
        createClientFromFileSync: createClientFromFileSync,
        checkBinEnv: checkBinEnv,
        createBinClient: createBinClient
};

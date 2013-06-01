// Copyright (c) 2013, Joyent, Inc. All rights reserved.

var fs = require('fs');
var path = require('path');

var assert = require('assert-plus');
var bunyan = require('bunyan');
var clone = require('clone');
var restify = require('restify');
var dashdash = require('dashdash');

var auth = require('./auth');
var manta = require('./client');



///--- Globals

var DEFAULT_OPTIONS = [
    {
        names: ['account', 'a'],
        type: 'string',
        env: 'MANTA_USER',
        help: 'Manta Account (login name)',
        helpArg: 'ACCOUNT'
    },
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Print this help and exit'
    },
    {
        names: ['insecure', 'i'],
        type: 'bool',
        help: 'Do not validate SSL certificate',
        'default': false,
        env: 'MANTA_TLS_INSECURE'
    },
    {
        names: ['keyId', 'k'],
        type: 'string',
        env: 'MANTA_KEY_ID',
        help: 'SSH key fingerprint',
        helpArg: 'FINGERPRINT'
    },
    {
        names: ['url', 'u'],
        type: 'string',
        env: 'MANTA_URL',
        help: 'Manta URL',
        helpArg: 'URL'
    },
    {
        names: ['verbose', 'v'],
        type: 'arrayOfBool',
        help: 'verbose mode'
    }
];



///--- API

function createClient(options) {
    assert.object(options, 'options');

    var opts = clone(options);
    if (opts.connectTimeout === undefined)
        opts.connectTimeout = 4000;

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

    var client = new manta.MantaClient(opts);
    client.signUrl = auth.signUrl;

    return (client);
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

    if (!noAuth && !opts.account && !process.env.MANTA_USER) {
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
    assert.object(opts.log, 'opts.log');

    // Use dashdash to handle *just* envvars defined in the default options.
    var parser = dashdash.createParser({options: DEFAULT_OPTIONS});
    var envopts = parser.parse({argv: [], env: process.env});
    Object.keys(envopts).forEach(function (key) {
        if (// Skip internal dashdash fields.
            key[0] !== '_' &&
            // Already defined on given opts, skip the envvar value.
            opts[key] === undefined)
        {
            opts[key] = envopts[key];
        }
    });

    opts.noAuth = opts.noAuth || process.env.MANTA_NO_AUTH;
    opts.user = opts.account;
    opts.sign = null;
    if (!opts.noAuth) {
        opts.sign = auth.cliSigner({
            algorithm: opts.algorithm,
            keyId: opts.keyId,
            log: opts.log,
            user: opts.user
        });
    }

    if (opts.insecure)
        opts.rejectUnauthorized = false;

    // All required...
    opts.connectTimeout = 4000;
    opts.retry = false;

    // All other options (headers, etc.) should fall through.
    var client = createClient(opts);
    process.on('uncaughtException', function (err) {
        if (err.errno === 'EPIPE')
            process.exit(0);

        console.error(path.basename(process.argv[1]) + ': ' + err.toString());
        process.exit(1);
    });

    return (client);
}


function usage(parser, msg, extra) {
    if (msg)
        console.error(msg);

    var help = parser.help({includeEnv: true}).trimRight();
    var name = path.basename(process.argv[1]);
    console.error('usage: ' + name + ' [OPTIONS] ' + extra);
    console.error('options:');
    console.error(help);
    process.exit(msg ? 1 : 0);
}


function setupLogger(opts, log) {
    opts.log = log;

    if (opts.verbose) {
        opts.verbose.forEach(function () {
            opts.log.level(Math.max(bunyan.TRACE, (opts.log.level() - 10)));
            if (opts.log.level() <= bunyan.DEBUG)
                opts.log = opts.log.child({src: true});
        });
    }

    return (opts);
}



///--- Exports

module.exports = {
    checkBinEnv: checkBinEnv,
    createClient: createClient,
    createClientFromFileSync: createClientFromFileSync,
    createBinClient: createBinClient,
    DEFAULT_OPTIONS: DEFAULT_OPTIONS,
    usage: usage,
    setupLogger: setupLogger
};

// Copyright (c) 2013, Joyent, Inc. All rights reserved.

var fs = require('fs');
var path = require('path');

var assert = require('assert-plus');
var bunyan = require('bunyan');
var dashdash = require('dashdash');
var restifyClients = require('restify-clients');

var auth = require('smartdc-auth');
var manta = require('./client');

var packageJson = require('../package.json');


///--- Globals

var DEFAULT_OPTIONS = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Print this help and exit'
    },
    {
        name: 'version',
        type: 'bool',
        help: 'Print version and exit.'
    },
    {
        names: ['verbose', 'v'],
        type: 'arrayOfBool',
        help: 'Verbose trace logging.'
    },
    /*
     * There is one minor issue with having `--completion` on DEFAULT_OPTIONS:
     * `mjob` uses DEFAULT_OPTIONS on all its *subcommands* instead of just
     * having those options at the top-level. I.e. `mjob create -a ACCOUNT ...`
     * rather than `mjob -a ACCOUNT create ...`.
     *
     * This means that there will be a hidden `mjob create --completion`
     * option that isn't handled. That shouldn't cause any harm.
     */
    {
        names: ['completion'],
        type: 'bool',
        help: 'Print bash completion code for this command and exit.',
        hidden: true
    },
    {
        group: 'Manta connection options'
    },
    {
        names: ['account', 'a'],
        type: 'string',
        env: 'MANTA_USER',
        help: 'Manta Account (login name)',
        helpArg: 'ACCOUNT'
    },
    {
        names: ['subuser', 'user'],
        type: 'string',
        env: 'MANTA_SUBUSER',
        help: 'Manta User (login name)',
        helpArg: 'USER'
    },
    {
        names: ['role'],
        type: 'arrayOfString',
        env: 'MANTA_ROLE',
        help: 'Assume a role. Use multiple times or once with a list',
        helpArg: 'ROLE,ROLE,...'
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
        helpArg: 'FP'
    },
    {
        names: ['url', 'u'],
        type: 'string',
        env: 'MANTA_URL',
        help: 'Manta URL',
        helpArg: 'URL'
    }
];



///--- API

function cloneOptions(options) {
    assert.object(options, 'options');
    var encrypt = (options.encrypt === false) ? false : (options.encrypt || {});

    return ({
        agent: options.agent,
        connectTimeout: options.connectTimeout || 4000,
        headers: options.headers,
        rejectUnauthorized: options.rejectUnauthorized,
        retry: options.retry,
        sign: options.sign,
        socketPath: options.socketPath,
        user: options.user,
        subuser: options.subuser,
        role: options.role,
        url: options.url,
        encrypt: (encrypt === false) ? false : {
            getKey: encrypt.getKey,
            keyId: encrypt.keyId,
            key: encrypt.key,
            cipher: encrypt.cipher,
            hmacType: encrypt.hmacType,
            authMode: encrypt.authMode
        }
    });
}

function createClient(options) {
    var opts = cloneOptions(options);

    if (!options.log) {
        opts.log = bunyan.createLogger({
            name: 'MantaClient',
            stream: process.stderr,
            level: process.env.MANTA_LOG_LEVEL || 'fatal',
            serializers: restifyClients.bunyan.serializers
        });
    } else {
        opts.log = options.log.child({
            component: 'MantaClient',
            serializers: restifyClients.bunyan.serializers
        });
    }

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
            user: opts.user,
            subuser: opts.subuser
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
    if (!opts.noAuth) {
        opts.sign = auth.cliSigner({
            sshAgentOpts: opts.sshAgentOpts,
            algorithm: opts.algorithm,
            keyId: opts.keyId,
            log: opts.log,
            user: opts.user,
            subuser: opts.subuser
        });
    }

    if (opts.role && opts.role.length === 1) {
        /* JSSTYLED */
        opts.role = opts.role[0].split(/\s*,\s*/);
    }

    if (opts.insecure)
        opts.rejectUnauthorized = false;

    // All required...
    opts.connectTimeout = 4000;
    opts.retry = {
        minTimeout: 500,
        maxTimeout: 4000,
        retries: 3
    };

    // All other options (headers, etc.) should fall through.
    var client = createClient(opts);
    process.on('uncaughtException', function (err) {
        if (err.errno === 'EPIPE')
            process.exit(0);

        var msg = path.basename(process.argv[1]) + ': ';
        if (process.env.DEBUG === '1') {
            msg += err.stack;
        } else {
            msg += err.toString();
        }
        console.error(msg);
        process.exit(1);
    });

    return (client);
}


function usage(parser, errmsg, extra) {
    if (errmsg)
        console.error(errmsg);

    var help = parser.help({includeEnv: true}).trimRight();
    var name = path.basename(process.argv[1]);
    var out = (errmsg ? console.error : console.log);
    out('usage: ' + name + ' [OPTIONS] ' + extra);
    out('options:');
    out(help);
    process.exit(errmsg ? 1 : 0);
}


function setupLogger(opts, log) {
    opts.log = log;

    if (opts.verbose) {
        opts.log.level(bunyan.TRACE);
        opts.log = opts.log.child({src: true});
    }

    return (opts);
}


function versionCheckPrintAndExit(opts) {
    if (opts.version) {
        console.log(packageJson.version);
        console.log(packageJson.homepage);
        process.exit(0);
    }
}


/**
 * Check the parsed `opts` for usage of the '--completion' option. If used,
 * then print Bash completion code for this command.
 *
 * @param {Object} opts: Required. A dashdash parsed options object.
 * @param {Object} parser: Required. A dashdash option parser.
 * @param {String} name: Required. The command name.
 * @param {Array of String} argtypes: Optional. An array of types for positional
 *      arguments to this command. See 'argtypes' docs here:
 *      // JSSTYLED
 *      <https://github.com/trentm/node-dashdash/blob/1dd7379640462a21ca6d92502803de830b4acfa2/lib/dashdash.js#L753-L760>
 *      Manta defines the following meaningful types:
 *          (none yet)
 */
function completionCheckPrintAndExit(opts, parser, name, argtypes) {
    assert.object(opts, 'opts');
    assert.object(parser, 'parser');
    assert.string(name, 'name');
    assert.optionalArrayOfString(argtypes, 'argtypes');

    if (opts.completion) {
        /*
         * To ensure that all our stdout is written before 'process.exit()'
         * terminates, we set stdout to blocking. This is an issue when
         * (a) node v4 or later is used and (b) at least when exec'd by node
         * as in test/completion.test.js. See
         * https://gist.github.com/misterdjules/3aa4c77d8f881ffccba3b6e6f0050d03
         * for some discussion. An alternative would be to exit the the node
         * process without 'process.exit'.
         */
        if (process.stdout._handle &&
            typeof (process.stdout._handle.setBlocking) === 'function')
        {
            process.stdout._handle.setBlocking(true);
        }

        console.log(parser.bashCompletion({
            name: name,
            argtypes: argtypes
        }));

        process.exit(0);
    }
}


///--- Exports

module.exports = {
    checkBinEnv: checkBinEnv,
    cloneOptions: cloneOptions,
    createClient: createClient,
    createClientFromFileSync: createClientFromFileSync,
    createBinClient: createBinClient,
    DEFAULT_OPTIONS: DEFAULT_OPTIONS,
    usage: usage,
    setupLogger: setupLogger,
    versionCheckPrintAndExit: versionCheckPrintAndExit,
    completionCheckPrintAndExit: completionCheckPrintAndExit
};



///--- Hacks

process.maxTickDepth = Infinity;

var MAX_SOCKETS = parseInt(process.env.MANTA_MAX_SOCKETS || 1000, 10);
require('http').globalAgent.maxSockets = MAX_SOCKETS;
require('https').globalAgent.maxSockets = MAX_SOCKETS;

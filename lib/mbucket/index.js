/*
 * Copyright 2019 Joyent, Inc.
 */

var util = require('util');

var assert = require('assert-plus');
var bunyan = require('bunyan');
var cmdln = require('cmdln');
var restifyClients = require('restify-clients');

var buckets = require('../buckets');
var manta = require('../');
var UI = require('./ui').UI;


// ---- globals

var NAME = 'mbucket';
var LOG = bunyan.createLogger({
    name: NAME,
    level: (process.env.LOG_LEVEL || 'info'),
    stream: process.stderr,
    serializers: restifyClients.bunyan.serializers
});

// Add some mbucket-specific (at least currently) options after "--verbose".
var options = manta.DEFAULT_CLI_OPTIONS.slice();
var verboseIdx = 0;
for (var i = 0; i < options.length; i++) {
    if (options[i].names && options[i].names.indexOf('verbose') !== -1) {
        verboseIdx = i;
        break;
    }
}
options.splice(verboseIdx + 1, 0,
    {
        names: ['quiet', 'q'],
        type: 'bool',
        help: 'Quieter output. Do not emit client action messages, e.g.: ' +
            '"upload: ...". Do not show progress bars. Errors are still shown.'
    },
    {
        names: ['no-progress'],
        type: 'bool',
        help: 'Do not show progress bars.'
    }
);


// ---- other support stuff

// Add a 'commaSepString' dashdash option type.
function parseCommaSepStringNoEmpties(option, optstr, arg) {
    // JSSTYLED
    return arg.trim().split(/\s*,\s*/g)
        .filter(function (part) { return part; });
}

cmdln.dashdash.addOptionType({
    name: 'commaSepString',
    takesArg: true,
    helpArg: 'STRING',
    parseArg: parseCommaSepStringNoEmpties
});

cmdln.dashdash.addOptionType({
    name: 'arrayOfCommaSepString',
    takesArg: true,
    helpArg: 'STRING',
    parseArg: parseCommaSepStringNoEmpties,
    array: true,
    arrayFlatten: true
});


// Add a 'headerString' dashdash option type.
function parseHeaderString(option, optstr, arg) {
    // JSSTYLED
    var colonIdx = arg.indexOf(':');
    if (colonIdx === -1) {
        throw new cmdln.UsageError(
            'invalid header argument: no colon: "' + arg + '"');
    }
    var name = arg.slice(0, colonIdx).trim();
    var value = arg.slice(colonIdx + 1).trim();
    var rv = {};
    rv[name] = value;
    return rv;
}

cmdln.dashdash.addOptionType({
    name: 'headerString',
    takesArg: true,
    helpArg: 'STRING',
    parseArg: parseHeaderString
});

cmdln.dashdash.addOptionType({
    name: 'arrayOfHeaderString',
    takesArg: true,
    helpArg: 'STRING',
    parseArg: parseHeaderString,
    array: true,
    arrayFlatten: true
});


function objCopy(obj, target) {
    if (!target) {
        target = {};
    }
    Object.keys(obj).forEach(function (k) {
        target[k] = obj[k];
    });
    return (target);
}


// ---- CLI

function MBucketCli() {
    cmdln.Cmdln.call(this, {
        name: 'mbucket',
        desc: 'The Manta Buckets command-line interface.',
        options: options,
        helpOpts: {
            includeEnv: true
        },
        helpSubcmds: [
            'help',
            { group: '' },
            'mb',
            'rb',
            { group: '' },
            'ls',
            'cp',
            'cat',
            'rm',
            'info',
            'updatemd'
        ]
    });
}
util.inherits(MBucketCli, cmdln.Cmdln);

MBucketCli.prototype.init = function init(opts, args, callback) {
    this.log = LOG;
    if (opts.verbose) {
        this.log.level('trace');
        this.log.src = true;
        this.showErrStack = true;
    }
    if (this.log.trace()) {
        var optsToLog = objCopy(opts);
        delete optsToLog._order;
        delete optsToLog._args;
        this.log.trace({opts: optsToLog, args: args}, 'cli init');
    }

    manta.cliVersionCheckPrintAndExit(opts);

    if (opts.completion) {
        console.log(this.bashCompletion());
        return;
    }

    this.ui = new UI({
        log: this.log,
        quiet: opts.quiet,
        noProgress: opts.no_progress
    });

    // XXX these?
    //manta.checkBinEnv(opts);
    //manta.cli_logger(opts, LOG);

    opts.log = this.log;
    opts.klass = buckets.MantaBucketsClient;
    this.client = manta.createBinClient(opts);

    cmdln.Cmdln.prototype.init.apply(this, arguments);
};


MBucketCli.prototype.fini = function fini(subcmd, err, cb) {
    this.log.trace({err: err, subcmd: subcmd}, 'cli fini');
    if (this.client) {
        this.client.close();
    }
    cb();
};

MBucketCli.prototype.do_raw = require('./do_raw');
MBucketCli.prototype.do_is_supported = require('./do_is_supported');

MBucketCli.prototype.do_mb = require('./do_mb');
MBucketCli.prototype.do_rb = require('./do_rb');

MBucketCli.prototype.do_ls = require('./do_ls');
MBucketCli.prototype.do_cp = require('./do_cp');
MBucketCli.prototype.do_cat = require('./do_cat');
MBucketCli.prototype.do_rm = require('./do_rm');
MBucketCli.prototype.do_info = require('./do_info');
MBucketCli.prototype.do_updatemd = require('./do_updatemd');


//---- mainline

function main(argv) {
    if (!argv) {
        argv = process.argv;
    }

    var cli = new MBucketCli();
    cmdln.main(cli, {
        showCode: true,
        showNoCommandErr: true
    });
}

//---- exports

module.exports = {
    main: main
};

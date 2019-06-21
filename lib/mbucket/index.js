#!/usr/bin/env node

/*
 * Copyright 2019 Joyent, Inc.
 */

var util = require('util');

var assert = require('assert-plus');
var bunyan = require('bunyan');
var cmdln = require('cmdln');
var restifyClients = require('restify-clients');

var manta = require('../');
var buckets = require('../buckets');


// ---- globals

var NAME = 'mbucket';
var LOG = bunyan.createLogger({
    name: NAME,
    level: (process.env.LOG_LEVEL || 'info'),
    stream: process.stderr,
    serializers: restifyClients.bunyan.serializers
});


// ---- other support stuff

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


// ---- CLI

function MBucketCli() {
    cmdln.Cmdln.call(this, {
        name: 'mbucket',
        desc: 'The Manta Buckets command-line interface.',
        options: manta.DEFAULT_CLI_OPTIONS,
        helpOpts: {
            includeEnv: true
        }
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
    this.log.trace({opts: opts, args: args}, 'cli init');

    manta.cliVersionCheckPrintAndExit(opts);

    if (opts.completion) {
        console.log(this.bashCompletion());
        return;
    }

    // XXX these?
    //manta.checkBinEnv(opts);
    //manta.cli_logger(opts, LOG);

    // XXX lazy? node-triton uses a getter
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

MBucketCli.prototype.do_ls = require('./do_ls');


//---- mainline

function main(argv) {
    if (!argv) {
        argv = process.argv;
    }

    var cli = new MBucketCli();
    cmdln.main(cli, {
        showNoCommandErr: true
    });
}

//---- exports

module.exports = {
    main: main
};

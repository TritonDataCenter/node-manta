// Copyright 2019 Joyent, Inc.

var auth = require('smartdc-auth');
var cc = require('./create_client');
var manta = require('./client');
var options = require('./options');
var progbar = require('progbar');
var Queue = require('./queue');
var StringStream = require('./string_stream');
var utils = require('./utils');



///--- Exports

module.exports = {
    MantaClient: manta.MantaClient,
    Queue: Queue,
    ProgressBar: progbar.ProgressBar,
    createClient: cc.createClient,
    createClientFromFileSync: cc.createClientFromFileSync,
    checkBinEnv: cc.checkBinEnv,
    cloneOptions: cc.cloneOptions,
    createBinClient: cc.createBinClient,
    cliSigner: auth.cliSigner,
    privateKeySigner: auth.privateKeySigner,
    sshAgentSigner: auth.sshAgentSigner,
    signUrl: function (opts, cb) {
        opts.mantaSubUser = true;
        return (auth.signUrl(opts, cb));
    },
    loadSSHKey: auth.loadSSHKey,
    assertPath: manta.assertPath,
    DEFAULT_CLI_OPTIONS: cc.DEFAULT_OPTIONS,
    cli_usage: cc.usage,
    cli_logger: cc.setupLogger,
    cliVersionCheckPrintAndExit: cc.versionCheckPrintAndExit,
    cliCompletionCheckPrintAndExit: cc.completionCheckPrintAndExit,
    StringStream: StringStream,
    path: manta.path,
    jobPath: manta.jobPath,
    escapePath: manta.escapePath,
    parseOptions: options.parseOptions,
    promptConfirm: utils.promptConfirm,
    prettyBytes: utils.prettyBytes
};

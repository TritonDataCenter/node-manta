// Copyright (c) 2013, Joyent, Inc. All rights reserved.

var auth = require('./auth');
var cc = require('./create_client');
var manta = require('./client');
var progbar = require('progbar');
var Queue = require('./queue');
var StringStream = require('./string_stream');



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
    signUrl: auth.signUrl,
    loadSSHKey: auth.loadSSHKey,
    assertPath: function assertPath(p, noThrow) {
        try {
            manta.path(p, null);
        } catch (e) {
            if (noThrow)
                return (e);

            throw e;
        }
        return (null);
    },
    DEFAULT_CLI_OPTIONS: cc.DEFAULT_OPTIONS,
    cli_usage: cc.usage,
    cli_logger: cc.setupLogger,
    StringStream: StringStream,
    path: manta.path,
    jobPath: manta.jobPath
};

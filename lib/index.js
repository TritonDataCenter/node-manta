// Copyright (c) 2012, Joyent, Inc. All rights reserved.

var auth = require('./auth');
var cc = require('./create_client');
var manta = require('./client');
var progbar = require('./progbar');
var Queue = require('./queue');



///--- Exports

module.exports = {
        MantaClient: manta.MantaClient,
        Queue: Queue,
        ProgressBar: progbar.ProgressBar,
        createClient: cc.createClient,
        createClientFromFileSync: cc.createClientFromFileSync,
        checkBinEnv: cc.checkBinEnv,
        createBinClient: cc.createBinClient,
        cliSigner: auth.cliSigner,
        privateKeySigner: auth.privateKeySigner,
        sshAgentSigner: auth.sshAgentSigner,
        signUrl: auth.signUrl,
        loadSSHKey: auth.loadSSHKey,
        assertPath: function assertPath(p, noThrow) {
                try {
                        manta.path(p);
                } catch (e) {
                        if (noThrow)
                                return (e);

                        throw e;
                }
                return (null);
        }
};

/*
 * Copyright 2016 Joyent, Inc.
 */

var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');

var libuuid = require('uuid');
var MemoryStream = require('readable-stream/passthrough.js');
var bunyan = require('bunyan');
var format = require('util').format;
var vasync = require('vasync');

var manta = require('../lib');

/*
 * Globals
 */

var ROOT = '/' + (process.env.MANTA_USER || 'admin') + '/stor';
var PUBLIC = '/' + (process.env.MANTA_USER || 'admin') + '/public';
var SUBDIR1 = ROOT + '/node-manta-test-' + libuuid.v4().split('-')[0];

/*
 * Helper functions
 */

function test(name, testfunc) {
    module.exports[name] = testfunc;
}

function createLogger(name, stream) {
    return (bunyan.createLogger({
        level: (process.env.LOG_LEVEL || 'info'),
        name: name || process.argv[1],
        stream: stream || process.stdout,
        src: true
    }));
}


/*
 * Pre- and Post-test actions
 */

module.exports.setUp = function (cb) {
    var self = this;
    var url = process.env.MANTA_URL || 'http://localhost:8080';
    var user = process.env.MANTA_USER || 'admin';

    function createClient(signer) {
        self.client = manta.createClient({
            connectTimeout: 1000,
            log: createLogger(),
            rejectUnauthorized: (process.env.MANTA_TLS_INSECURE ?
                                    false : true),
            sign: signer,
            url: url,
            user: user
        });

        cb();
    }

    if (process.env.MANTA_KEY_ID) {
        createClient(manta.sshAgentSigner({
            user: user,
            keyId: process.env.MANTA_KEY_ID
        }));
    } else {
        var f = process.env.SSH_KEY || process.env.HOME + '/.ssh/id_rsa';
        var cmd = 'ssh-keygen -l -f ' +
            f + ' ' +
            '| awk \'{print $2}\'';
        fs.readFile(f, 'utf8', function (err, key) {
            if (err) {
                cb(err);
                return;
            }

            exec(cmd, function (err2, stdout, stderr) {
                if (err2) {
                    (cb(err2));
                    return;
                }
                createClient(manta.privateKeySigner({
                    key: key,
                    keyId: stdout.replace('\n', ''),
                    user: user
                }));
                return;
            });
            return;
        });
    }
};


module.exports.tearDown = function (cb) {
    if (this.client) {
        this.client.close();
        delete this.client;
    }
    cb();
};


/*
 * Tests
 */

// muntar tests
var cases = [
    {
        tarpath: 'corpus/tar1.tar',
        checks: [
            { path: 'subdir1/', type: 'application/x-json-stream; type=directory' },
            { path: 'subdir1/test.txt', type: 'text/plain' },
            { path: 'test.txt', type: 'text/plain' }
        ]
    },
    {
        tarpath: 'corpus/259-emptydir.tar',
        checks: [
            { path: 'emptydir/', type: 'directory' }
        ]
    }
];

cases.forEach(function (c, i) {
    // XXX test for #259
    if (c.tarpath === 'corpus/259-emptydir.tar') {
        return;
    }
    var name = format('tar %d: %s', i, c.tarpath);
    var cmd = format('%s -f %s %s', path.join(__dirname, '../bin/muntar'),
        path.join(__dirname, c.tarpath), SUBDIR1);
    test(name, function (t) {
        var self = this;
        exec(cmd, function (err, stdout, stderr) {
            t.ifError(err);
            vasync.forEachPipeline({
                'func': function (o, cb) {
                    var mpath = path.join(SUBDIR1, o.path);
                    self.client.info(mpath, function (err2, type) {
                        t.ifError(err2);
                        t.equal(type.type, o.type);
                        cb();
                    });
                },
                'inputs': c.checks
            }, function (err3, results) {
                t.done();
            });
        });
    });
});

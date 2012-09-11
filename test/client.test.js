// Copyright 2012 Joyent.  All rights reserved.

var exec = require('child_process').exec;
var fs = require('fs');

var MemoryStream = require('memorystream');
var uuid = require('node-uuid');

var manta = require('../lib');

if (require.cache[__dirname + '/helper.js'])
        delete require.cache[__dirname + '/helper.js'];
var helper = require('./helper.js');



///--- Globals

var after = helper.after;
var before = helper.before;
var test = helper.test;

var JOB;
var ROOT = '/admin/stor';
var SUBDIR1 = '/' + uuid();
var SUBDIR2 = SUBDIR1 + '/' + uuid(); // directory
var CHILD1 = SUBDIR1 + '/' + uuid(); // object
var CHILD2 = SUBDIR2 + '/' + uuid(); // link



///--- Tests

before(function (cb) {
        var f = process.env.SSH_KEY || process.env.HOME + '/.ssh/id_rsa';
        var cmd = 'ssh-keygen -l -f ' +
                f + ' ' +
                '| awk \'{print $2}\'';
        var self = this;
        var url = process.env.MANTA_TEST_URL || 'http://localhost:8080';
        var user = process.env.MANTA_TEST_USER || 'admin';

        fs.readFile(f, 'utf8', function (err, key) {
                if (err)
                        return (cb(err));

                exec(cmd, function (err2, stdout, stderr) {
                        if (err2)
                                return (cb(err2));

                        self.client = manta.createClient({
                                connectTimeout: 1000,
                                log: helper.createLogger(),
                                retry: false,
                                sign: manta.privateKeySigner({
                                        key: key,
                                        keyId: stdout.replace('\n', ''),
                                        user: user
                                }),
                                url: url,
                                user: user
                        });

                        return (cb());
                });

                return (undefined);
        });
});


test('mkdir', function (t) {
        this.client.mkdir(SUBDIR1, function (err) {
                t.ifError(err);
                t.end();
        });
});


test('mkdir (sub)', function (t) {
        this.client.mkdir(SUBDIR2, function (err) {
                t.ifError(err);
                t.end();
        });
});


test('put', function (t) {
        var text = 'The lazy brown fox \nsomething \nsomething foo';
        var size = Buffer.byteLength(text);
        var stream = new MemoryStream();

        this.client.put(CHILD1, stream, {size: size}, function (err) {
                t.ifError(err);
                t.end();
        });

        process.nextTick(function () {
                stream.write(text);
                stream.end();
        });
});


test('ls', function (t) {
        t.expect(5);
        this.client.ls(SUBDIR1, function (err, res) {
                t.ifError(err);
                res.once('object', function (obj) {
                        t.ok(obj);
                        t.equal(obj.type, 'object');
                });
                res.once('directory', function (dir) {
                        t.ok(dir);
                        t.equal(dir.type, 'directory');
                });
                res.once('end', t.end.bind(t));
        });
});


test('ln', function (t) {
        this.client.ln(CHILD1, CHILD2, function (err) {
                t.ifError(err);
                t.end();
        });
});


test('info (link)', function (t) {
        this.client.info(CHILD2, function (err, type) {
                t.ifError(err);
                t.ok(type);
                if (type) {
                        t.equal(type.extension, 'bin');
                        t.ok(type.size);
                        t.equal(type.type, 'application/octet-stream');
                        t.ok(type.etag);
                        t.ok(type.md5);
                }
                t.end();
        });
});


test('create job (simple grep)', function (t) {
        var j = 'grep foo';

        this.client.createJob(j, function (err, job) {
                t.ifError(err);
                t.ok(job);
                JOB = job;
                t.end();
        });
});


test('get job', function (t) {
        this.client.job(JOB, function (err, job) {
                t.ifError(err);
                t.ok(job);
                t.equal(job.id, JOB);
                t.ok(job.name);
                t.equal(job.state, 'queued');
                t.ok(job.timeCreated);
                t.ok(job.phases);
                t.notOk(job.cancelled);
                t.notOk(job.inputDone);
                t.end();
        });
});


test('add input keys', function (t) {
        var keys = [
                CHILD1,
                CHILD2
        ];
        this.client.addJobKey(JOB, keys, function (err) {
                t.ifError(err);
                t.end();
        });
});


test('end job', function (t) {
        this.client.endJob(JOB, function (err) {
                t.ifError(err);
                t.end();
        });
});


test('wait for job', function (t) {
        var attempts = 1;
        var client = this.client;

        function getState() {
                client.job(JOB, function (err, job) {
                        t.ifError(err);
                        if (err) {
                                t.end();
                        } else if (job.state === 'done') {
                                t.end();
                        } else {
                                if (++attempts >= 30) {
                                        t.notOk(attempts);
                                        t.end();
                                } else {
                                        setTimeout(getState, 1000);
                                }
                        }
                });
        }

        getState();
});


test('unlink object', function (t) {
        this.client.unlink(CHILD2, function (err) {
                t.ifError(err);
                t.end();
        });
});


test('unlink link', function (t) {
        this.client.unlink(CHILD1, function (err) {
                t.ifError(err);
                t.end();
        });
});


test('unlink subdir', function (t) {
        this.client.unlink(SUBDIR2, function (err) {
                t.ifError(err);
                t.end();
        });
});


test('unlink directory', function (t) {
        this.client.unlink(SUBDIR1, function (err) {
                t.ifError(err);
                t.end();
        });
});

/*
 * Copyright 2015 Joyent, Inc.
 */

var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');

var libuuid = require('node-uuid');
var MemoryStream = require('readable-stream/passthrough.js');
var bunyan = require('bunyan');
var restify = require('restify');

var manta = require('../lib');


/*
 * Globals
 */

var JOB;
var ROOT = '/' + (process.env.MANTA_USER || 'admin') + '/stor';
var PUBLIC = '/' + (process.env.MANTA_USER || 'admin') + '/public';
var SUBDIR1 = ROOT + '/' + libuuid.v4();
var SUBDIR2 = SUBDIR1 + '/' + libuuid.v4(); // directory
var CHILD1 = SUBDIR1 + '/' + libuuid.v4(); // object
var CHILD2 = SUBDIR2 + '/' + libuuid.v4(); // link
var NOENTSUB1 = SUBDIR1 + '/a/b/c';
var NOENTSUB2 = SUBDIR1 + '/d/e/f';
var SPECIALOBJ1 = SUBDIR1 + '/' + 'before-\r-after';

var SUBDIR1_NOBJECTS = 1;
var SUBDIR1_NDIRECTORIES = 2;


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
        src: true,
        serializers: restify.bunyan.serializers
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
            retry: false,
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

test('mkdir', function (t) {
    this.client.mkdir(SUBDIR1, function (err) {
        t.ifError(err);
        t.done();
    });
});


test('mkdir (sub)', function (t) {
    this.client.mkdir(SUBDIR2, function (err) {
        t.ifError(err);
        t.done();
    });
});


test('put', function (t) {
    var text = 'The lazy brown fox \nsomething \nsomething foo';
    var size = Buffer.byteLength(text);
    var stream = new MemoryStream();

    this.client.put(CHILD1, stream, {size: size}, function (err) {
        t.ifError(err);
        t.done();
    });

    process.nextTick(function () {
        stream.write(text);
        stream.end();
    });
});


test('#231: put (special characters)', function (t) {
    var text = 'my filename can mess stuff up\n';
    var size = Buffer.byteLength(text);
    var stream = new MemoryStream();

    this.client.put(SPECIALOBJ1, stream, {size: size}, function (err) {
        t.ifError(err);
        t.done();
    });

    process.nextTick(function () {
        stream.write(text);
        stream.end();
    });
});

test('#231: ls (special characters)', function (t) {
    this.client.ls(SUBDIR1, function (err, res) {
        t.ifError(err);

        var found = false;
        res.on('object', function (obj) {
            if (obj.name === path.basename(SPECIALOBJ1))
                found = true;
        });

        res.on('end', function () {
            t.ok(found);
            t.done();
        });
    });
});

test('#231: get (special characters)', function (t) {
    this.client.get(SPECIALOBJ1, function (err, stream) {
        t.ifError(err);

        var data = '';
        stream.setEncoding('utf8');
        stream.on('data', function (chunk) {
            data += chunk;
        });
        stream.on('end', function (chunk) {
            t.equal(data, 'my filename can mess stuff up\n');
            t.done();
        });
    });
});


test('#231: rm (special characters)', function (t) {
    this.client.unlink(SPECIALOBJ1, function (err) {
        t.ifError(err);
        t.done();
    });
});

test('chattr', function (t) {
    var opts = {
        headers: {
            'm-foo': 'bar'
        }
    };
    var self = this;

    this.client.info(CHILD1, function (err, info) {
        t.ifError(err);
        t.ok(info);

        if (!info) {
            t.done();
            return;
        }

        self.client.chattr(CHILD1, opts, function onChattr(err1) {
            t.ifError(err1);

            self.client.info(CHILD1, function onInfo(err2, info2) {
                t.ifError(err2);
                t.ok(info2);
                if (info2) {
                    t.ok(info2.headers);
                    var headers = info2.headers || {};
                    t.equal(headers['m-foo'], 'bar');
                    t.equal(info2.etag, info.etag);
                }
                t.done();
            });
        });
    });
});


test('put (zero byte streaming)', function (t) {
    var self = this;
    var stream = fs.createReadStream('/dev/null');

    stream.once('open', function () {
        self.client.put(CHILD1, stream, function (err) {
            t.ifError(err);
            t.done();
        });
    });
});


test('put without mkdirp', function (t) {
    var text = 'Don\'t mind if I don\'t!';
    var size = Buffer.byteLength(text);
    var stream = new MemoryStream();

    this.client.put(NOENTSUB1, stream, { size: size }, function (err) {
        t.ok(err);
        t.done();
    });

    process.nextTick(function () {
        stream.write(text);
        stream.end();
    });
});

test('put with mkdirp', function (t) {
    var text = 'Don\'t mind if I do!';
    var size = Buffer.byteLength(text);
    var stream = new MemoryStream();

    this.client.put(NOENTSUB2, stream, {
        size: size,
        mkdirs: true
    }, function (err) {
        t.ifError(err);
        t.done();
    });

    process.nextTick(function () {
        stream.write(text);
        stream.end();
    });
});

test('streams', function (t) {
    var client = this.client;
    var stream = new MemoryStream();
    var text = 'The lazy brown fox streamed some text';
    var w = client.createWriteStream(CHILD1, {type: 'text/plain'});

    stream.pipe(w);
    stream.end(text);

    w.once('error', function (err) {
        t.ifError(err);
        t.done();
    });
    w.once('close', function (res) {
        t.ok(res);
        t.equal(res.statusCode, 204);
        var r = client.createReadStream(CHILD1);
        var s = new MemoryStream();
        var str = '';
        var opened = false;

        s.setEncoding('utf8');
        s.on('data', function (chunk) {
            str += chunk;
        });
        r.once('open', function (res2) {
            opened = true;
        });
        r.once('end', function () {
            t.equal(str, text);
        });

        r.pipe(s);

        r.once('close', function (res2) {
            t.equal(res2.statusCode, 200);
            t.ok(opened);
            t.done();
        });
    });
});


test('put MD5 mismatch', function (t) {
    var text = 'The lazy brown fox \nsomething \nsomething foo';
    var size = Buffer.byteLength(text);
    var opts = {
        md5: new Buffer(text).toString('base64'),
        size: size
    };
    var stream = new MemoryStream();

    this.client.put(CHILD1, stream, opts, function (err) {
        t.ok(err);
        t.done();
    });

    process.nextTick(function () {
        stream.write(text);
        stream.end();
    });
});


test('GH-72 content-length: undefined', function (t) {
    var opts = {
        headers: {
            'content-length': undefined
        }
    };
    var text = 'The lazy brown fox \nsomething \nsomething foo';
    var stream = new MemoryStream();

    this.client.put(CHILD1, stream, opts, function (err) {
        t.ifError(err);
        t.done();
    });

    process.nextTick(function () {
        stream.write(text);
        stream.end();
    });
});


test('ls', function (t) {
    t.expect(3 + 2 * (SUBDIR1_NOBJECTS + SUBDIR1_NDIRECTORIES));

    var dirs = 0;
    var objs = 0;
    this.client.ls(SUBDIR1, function (err, res) {
        t.ifError(err);
        res.on('object', function (obj) {
            objs++;
            t.ok(obj);
            t.equal(obj.type, 'object');
        });
        res.on('directory', function (dir) {
            dirs++;
            t.ok(dir);
            t.equal(dir.type, 'directory');
        });
        res.once('end', function () {
            t.equal(objs, SUBDIR1_NOBJECTS);
            t.equal(dirs, SUBDIR1_NDIRECTORIES);
            t.done();
        });
    });
});


test('createListStream', function (t) {
    t.expect(2 + 2 * (SUBDIR1_NOBJECTS + SUBDIR1_NDIRECTORIES));

    var lstr = this.client.createListStream(SUBDIR1);

    var dirs = 0;
    var objs = 0;
    lstr.once('error', function (err) {
        t.ifError(err);
    });
    lstr.on('readable', function () {
        var obj;
        while ((obj = lstr.read()) !== null) {
            t.ok(obj);
            t.ok(obj.type === 'object' || obj.type === 'directory');
            if (obj.type === 'object') {
                objs++;
            } else {
                dirs++;
            }
        }
    });
    lstr.once('end', function () {
        t.equal(objs, SUBDIR1_NOBJECTS);
        t.equal(dirs, SUBDIR1_NDIRECTORIES);
        t.done();
    });
});


test('createListStream (dir only)', function (t) {
    t.expect(2 * (SUBDIR1_NDIRECTORIES));

    var lstr = this.client.createListStream(SUBDIR1, {
        type: 'directory'
    });

    lstr.once('error', function (err) {
        t.ifError(err);
    });
    lstr.on('readable', function () {
        var obj;
        while ((obj = lstr.read()) !== null) {
            t.ok(obj);
            t.ok(obj.type === 'directory');
        }
    });
    lstr.once('end', function () {
        t.done();
    });
});


test('createListStream (object only)', function (t) {
    t.expect(2 * (SUBDIR1_NOBJECTS));

    var lstr = this.client.createListStream(SUBDIR1, {
        type: 'object'
    });

    lstr.once('error', function (err) {
        t.ifError(err);
    });
    lstr.on('readable', function () {
        var obj;
        while ((obj = lstr.read()) !== null) {
            t.ok(obj);
            t.ok(obj.type === 'object');
        }
    });
    lstr.once('end', function () {
        t.done();
    });
});


test('ln', function (t) {
    this.client.ln(CHILD1, CHILD2, function (err) {
        t.ifError(err);
        t.done();
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
        t.done();
    });
});


test('ftw', function (t) {
    var text = 'The lazy brown fox \nsomething \nsomething foo';
    var self = this;
    var size = Buffer.byteLength(text);
    var stream = new MemoryStream();

    this.client.mkdirp(SUBDIR2, function (err) {
        t.ifError(err);
        self.client.put(CHILD1, stream, {size: size}, function (err2) {
            t.ifError(err);

            self.client.ftw(SUBDIR1, function (err3, res) {
                t.ifError(err3);
                t.ok(res);

                var count = 0;
                res.on('entry', function (e) {
                    if (e.name === path.basename(SUBDIR2)) {
                        count++;
                        t.equal(e.type, 'directory');
                    } else if (e.name === path.basename(CHILD1)) {
                        count++;
                        t.equal(e.type, 'object');
                    }
                    //ignore other garbage
                });

                res.once('end', function () {
                    t.equal(count, 2);
                    t.done();
                });
            });
        });
    });

    process.nextTick(function () {
        stream.write(text);
        stream.end();
    });
});


test('create job (simple grep)', function (t) {
    var j = 'grep foo';

    this.client.createJob(j, function (err, job) {
        t.ifError(err);
        t.ok(job);
        JOB = job;
        t.done();
    });
});


test('get job', function (t) {
    this.client.job(JOB, function (err, job) {
        t.ifError(err);
        t.ok(job);
        t.equal(job.id, JOB);
        t.ok(job.name === '');
        t.ok((job.state === 'queued' || job.state === 'running'));
        t.ok(job.timeCreated);
        t.ok(job.phases);
        t.ok(!job.cancelled);
        t.ok(!job.inputDone);
        t.done();
    });
});


test('add input keys', function (t) {
    var keys = [
        CHILD1,
        CHILD2
    ];

    this.client.addJobKey(JOB, keys, function (err) {
        t.ifError(err);
        t.done();
    });
});


test('get job input', function (t) {
    var keys = 0;
    function cb(err) {
        t.ifError(err);
        t.equal(keys, 2);
        t.done();
    }

    this.client.jobInput(JOB, function (err, res) {
        t.ifError(err);
        t.ok(res);

        res.on('key', function (k) {
            t.ok(k);
            keys++;
        });

        res.once('error', cb);
        res.once('end', cb.bind(null, null));
    });
});


test('end job', function (t) {
    this.client.endJob(JOB, function (err) {
        t.ifError(err);
        t.done();
    });
});


test('wait for job', function (t) {
    var attempts = 1;
    var client = this.client;

    function getState() {
        client.job(JOB, function (err, job) {
            t.ifError(err);
            if (err) {
                t.done();
            } else if (job.state === 'done') {
                t.done();
            } else {
                if (++attempts >= 60) {
                    t.ok(!attempts);
                    t.done();
                } else {
                    setTimeout(getState, 1000);
                }
            }
        });
    }

    getState();
});


test('get job output', function (t) {
    var _keys = 0; // treat 'end' as a key
    function cb(err) {
        t.ifError(err);
        t.ok(_keys > 0);
        t.done();
    }

    this.client.jobOutput(JOB, function (err, res) {
        t.ifError(err);
        t.ok(res);

        res.on('key', function (k) {
            t.ok(k);
            _keys++;
        });

        res.once('error', cb);
        res.once('end', cb.bind(null, null));
    });
});


test('create and cancel job', function (t) {
    var self = this;

    this.client.createJob('grep foo', function (err, job) {
        t.ifError(err);
        t.ok(job);
        self.client.cancelJob(job, function (err2) {
            t.ifError(err2);
            self.client.job(job, function (err3, job2) {
                t.ifError(err3);
                t.ok(job2);
                t.ok(job2.cancelled);
                t.ok(job2.inputDone);
                // t.equal(job2.state, 'done');
                t.done();
            });
        });
    });
});


test('unlink object', function (t) {
    this.client.unlink(CHILD2, function (err) {
        t.ifError(err);
        t.done();
    });
});


test('unlink link', function (t) {
    this.client.unlink(CHILD1, function (err) {
        t.ifError(err);
        t.done();
    });
});


test('rmr', function (t) {
    this.client.rmr(SUBDIR1, function (err) {
        t.ifError(err);
        t.done();
    });
});


test('mkdirp/rmr', function (t) {
    var self = this;
    this.client.mkdirp(SUBDIR2, function (err) {
        t.ifError(err);
        self.client.rmr(SUBDIR1, function (err2) {
            t.ifError(err2);
            t.done();
        });
    });
});


test('GH-196 getPath ~~/', function (t) {
    // confirm that evaluating ~~/ works with and without ENV variables
    var user = this.client.user;
    var old = process.env.MANTA_USER;

    process.env.MANTA_USER = user;
    t.equal(decodeURIComponent(this.client.path('~~/')), '/' + user);
    delete process.env.MANTA_USER;
    t.equal(decodeURIComponent(this.client.path('~~/')), '/' + user);
    process.env.MANTA_USER = old;
    // The plain export depends on the ENV variable
    t.equal(decodeURIComponent(manta.path('~~/')), '/' + user);
    t.done();
});


test('#180: Invalid key results in no client error', function (t) {
    t.throws(function () {
        manta.createClient({
            sign: manta.privateKeySigner({
                key: fs.readFileSync('/dev/null', 'utf8'),
                keyId: process.env.MANTA_KEY_ID,
                user: process.env.MANTA_USER
            }),
            user: process.env.MANTA_USER,
            url: process.env.MANTA_URL
        });
    });
    t.done();
});

test('MANTA-2812 null signer', function (t) {
    var c = manta.createClient({
        sign: function (data, cb) { cb(null, null); },
        url: process.env.MANTA_URL,
        user: process.env.MANTA_USER
    });
    c.ls(ROOT, function (err) {
        t.ok(err);
        t.strictEqual(err.code, 'ForbiddenError');

        c.ls(PUBLIC, function (err2) {
            t.ifError(err2);
            t.done();
        });
    });
});

test('MANTA-2812 undefined signer', function (t) {
    var c = manta.createClient({
        sign: undefined,
        url: process.env.MANTA_URL,
        user: process.env.MANTA_USER
    });
    c.ls(ROOT, function (err) {
        t.ok(err);
        t.strictEqual(err.code, 'ForbiddenError');

        c.ls(PUBLIC, function (err2) {
            t.ifError(err2);
            t.done();
        });
    });
});

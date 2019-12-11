/*
 * Copyright 2019 Joyent, Inc.
 */

var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');

var libuuid = require('uuid');
var MemoryStream = require('readable-stream/passthrough.js');
var test = require('tap').test;

var logging = require('../lib/logging');
var manta = require('../../lib');
var testutils = require('../lib/utils');


/*
 * Globals
 */

var client;
var log = logging.createLogger();

var JOB;
var ROOT = '/' + (process.env.MANTA_USER || 'admin') + '/stor';
var PUBLIC = '/' + (process.env.MANTA_USER || 'admin') + '/public';
var SUBDIR1 = ROOT + '/node-manta-test-client-' + libuuid.v4().split('-')[0];
var SUBDIR2 = SUBDIR1 + '/subdir2-' + libuuid.v4().split('-')[0]; // directory
var CHILD1 = SUBDIR1 + '/child1-' + libuuid.v4().split('-')[0]; // object
var CHILDLINK = SUBDIR2 + '/childlink-' + libuuid.v4().split('-')[0]; // link
var NOENTSUB1 = SUBDIR1 + '/a/b/c';
var NOENTSUB2 = SUBDIR1 + '/d/e/f';
var SPECIALOBJ1 = SUBDIR1 + '/' + 'before-\r-after';

var SUBDIR1_NOBJECTS = 1;
var SUBDIR1_NDIRECTORIES = 2;

var snaplinksTestOpts = {
    skip: !testutils.areSnaplinksSupportedSync(log) &&
        'this Manta does not support SnapLinks (mantav2)'
};
var jobsTestOpts = {
    skip: !testutils.areJobsSupportedSync(log) &&
        'this Manta does not support jobs (mantav2)'
};

/*
 * Tests
 */

test('setup', function (t) {
    var url = process.env.MANTA_URL || 'http://localhost:8080';
    var user = process.env.MANTA_USER || 'admin';

    function createClient(signer) {
        // `client` is intentionally global.
        client = manta.createClient({
            connectTimeout: 1000,
            log: log,
            rejectUnauthorized: (process.env.MANTA_TLS_INSECURE ? false : true),
            sign: signer,
            url: url,
            user: user
        });

        t.end();
    }

    if (process.env.MANTA_KEY_ID) {
        createClient(manta.cliSigner({
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
                t.error(err);
                t.end();
                return;
            }

            exec(cmd, function (err2, stdout, stderr) {
                if (err2) {
                    t.error(err2);
                    t.end();
                    return;
                }
                createClient(manta.privateKeySigner({
                    key: key,
                    keyId: stdout.replace('\n', ''),
                    user: user
                }));
            });
        });
    }
});


test('mkdir', function (t) {
    client.mkdir(SUBDIR1, function (err) {
        t.ifError(err);
        t.end();
    });
});


test('mkdir (sub)', function (t) {
    client.mkdir(SUBDIR2, function (err) {
        t.ifError(err);
        t.end();
    });
});


test('put', function (t) {
    var text = 'The lazy brown fox \nsomething \nsomething foo';
    var size = Buffer.byteLength(text);
    var stream = new MemoryStream();

    client.put(CHILD1, stream, {size: size}, function (err) {
        t.ifError(err);
        t.end();
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

    client.put(SPECIALOBJ1, stream, {size: size}, function (err) {
        t.ifError(err);
        t.end();
    });

    process.nextTick(function () {
        stream.write(text);
        stream.end();
    });
});

test('#231: ls (special characters)', function (t) {
    client.ls(SUBDIR1, function (err, res) {
        t.ifError(err);

        var found = false;
        res.on('object', function (obj) {
            if (obj.name === path.basename(SPECIALOBJ1))
                found = true;
        });

        res.on('end', function () {
            t.ok(found);
            t.end();
        });
    });
});

test('#231: get (special characters)', function (t) {
    client.get(SPECIALOBJ1, function (err, stream) {
        t.ifError(err);

        var data = '';
        stream.setEncoding('utf8');
        stream.on('data', function (chunk) {
            data += chunk;
        });
        stream.on('end', function (chunk) {
            t.equal(data, 'my filename can mess stuff up\n');
            t.end();
        });
    });
});


test('#231: rm (special characters)', function (t) {
    client.unlink(SPECIALOBJ1, function (err) {
        t.ifError(err);
        t.end();
    });
});

test('chattr', function (t) {
    var opts = {
        headers: {
            'm-foo': 'bar'
        }
    };

    client.info(CHILD1, function (err, info) {
        t.ifError(err);
        t.ok(info);

        if (!info) {
            t.end();
            return;
        }

        client.chattr(CHILD1, opts, function onChattr(err1) {
            t.ok(!err1, 'err1: ' + err1);

            client.info(CHILD1, function onInfo(err2, info2) {
                t.ok(!err2, 'err2: ' + err2);
                t.ok(info2, 'got info2: ' + info2);
                if (info2) {
                    t.ok(info2.headers, 'got info2.headers: ' + info2.headers);
                    var headers = info2.headers || {};
                    t.equal(headers['m-foo'], 'bar',
                        'info2.headers["m-foo"] is "bar": ' + headers['m-foo']);
                    t.equal(info2.etag, info.etag,
                        'info2.etag is unchanged: before=' + info.etag
                        + ' after=' + info2.etag);
                }
                t.end();
            });
        });
    });
});


test('put (zero byte streaming)', function (t) {
    var stream = fs.createReadStream('/dev/null');

    stream.once('open', function () {
        client.put(CHILD1, stream, function (err) {
            t.ifError(err);
            t.end();
        });
    });
});


test('put without mkdirp', function (t) {
    var text = 'Don\'t mind if I don\'t!';
    var size = Buffer.byteLength(text);
    var stream = new MemoryStream();

    client.put(NOENTSUB1, stream, { size: size }, function (err) {
        t.ok(err);
        t.end();
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

    client.put(NOENTSUB2, stream, {
        size: size,
        mkdirs: true
    }, function (err) {
        t.ifError(err);
        t.end();
    });

    process.nextTick(function () {
        stream.write(text);
        stream.end();
    });
});

test('streams', function (t) {
    var stream = new MemoryStream();
    var text = 'The lazy brown fox streamed some text';
    var w = client.createWriteStream(CHILD1, {type: 'text/plain'});

    stream.pipe(w);
    stream.end(text);

    w.once('error', function (err) {
        t.ifError(err);
        t.end();
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
        r.once('close', function (res2) {
            t.equal(res2.statusCode, 200);
            t.ok(opened);
        });
        r.once('end', function () {
            t.equal(str, text);
            t.end();
        });

        r.pipe(s);

    });
});


test('put MD5 mismatch', function (t) {
    var text = 'The lazy brown fox \nsomething \nsomething foo';
    var buf;
    // https://nodejs.org/fr/docs/guides/buffer-constructor-deprecation/
    if (Buffer.from && Buffer.from !== Uint8Array.from) {
        buf = Buffer.from(text);
    } else {
        // Deprecated;
        buf = new Buffer(text);
    }
    var size = Buffer.byteLength(text);
    var opts = {
        md5: buf.toString('base64'),
        size: size
    };
    var stream = new MemoryStream();

    client.put(CHILD1, stream, opts, function (err) {
        t.ok(err);
        t.end();
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

    client.put(CHILD1, stream, opts, function (err) {
        t.ifError(err);
        t.end();
    });

    process.nextTick(function () {
        stream.write(text);
        stream.end();
    });
});


test('ls', function (t) {
    var dirs = 0;
    var objs = 0;
    client.ls(SUBDIR1, function (err, res) {
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
            t.end();
        });
    });
});


test('createListStream', function (t) {
    var lstr = client.createListStream(SUBDIR1);

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
        t.end();
    });
});


test('createListStream (dir only)', function (t) {
    var numDirs = 0;

    var lstr = client.createListStream(SUBDIR1, {
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
            numDirs++;
        }
    });
    lstr.once('end', function () {
        t.equal(numDirs, SUBDIR1_NDIRECTORIES);
        t.end();
    });
});


test('createListStream (object only)', function (t) {
    var numObjs = 0;

    var lstr = client.createListStream(SUBDIR1, {
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
            numObjs++;
        }
    });
    lstr.once('end', function () {
        t.equal(numObjs, SUBDIR1_NOBJECTS);
        t.end();
    });
});


test('ln', snaplinksTestOpts, function (t) {
    client.ln(CHILD1, CHILDLINK, function (err) {
        t.ifError(err);
        t.end();
    });
});


test('info (link)', snaplinksTestOpts, function (t) {
    client.info(CHILDLINK, function (err, type) {
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


test('unlink link', snaplinksTestOpts, function (t) {
    client.unlink(CHILDLINK, function (err) {
        t.ifError(err);
        t.end();
    });
});


test('ftw', function (t) {
    var text = 'The lazy brown fox \nsomething \nsomething foo';
    var size = Buffer.byteLength(text);
    var stream = new MemoryStream();

    client.mkdirp(SUBDIR2, function (err) {
        t.ifError(err);
        client.put(CHILD1, stream, {size: size}, function (err2) {
            t.ifError(err);

            client.ftw(SUBDIR1, function (err3, res) {
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
                    t.end();
                });
            });
        });
    });

    process.nextTick(function () {
        stream.write(text);
        stream.end();
    });
});


test('job (simple grep)', jobsTestOpts, function (suite) {

    suite.test('create job (simple grep)', function (t) {
        var j = 'grep foo';

        client.createJob(j, function (err, job) {
            t.ifError(err);
            t.ok(job);
            JOB = job;
            t.end();
        });
    });


    suite.test('get job', function (t) {
        client.job(JOB, function (err, job) {
            t.ifError(err);
            t.ok(job);
            t.equal(job.id, JOB);
            t.ok(job.name === '');
            t.ok((job.state === 'queued' || job.state === 'running'));
            t.ok(job.timeCreated);
            t.ok(job.phases);
            t.ok(!job.cancelled);
            t.ok(!job.inputDone);
            t.end();
        });
    });


    suite.test('add input keys', function (t) {
        var keys = [
            CHILD1
        ];

        client.addJobKey(JOB, keys, function (err) {
            t.ifError(err);
            t.end();
        });
    });


    suite.test('get job input', function (t) {
        var keys = 0;
        function cb(err) {
            t.ifError(err);
            t.equal(keys, 1);
            t.end();
        }

        client.jobInput(JOB, function (err, res) {
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


    suite.test('end job', function (t) {
        client.endJob(JOB, function (err) {
            t.ifError(err);
            t.end();
        });
    });


    suite.test('wait for job', function (t) {
        var attempts = 1;

        function getState() {
            client.job(JOB, function (err, job) {
                t.ifError(err);
                if (err) {
                    t.end();
                } else if (job.state === 'done') {
                    t.end();
                } else {
                    if (++attempts >= 60) {
                        t.ok(!attempts);
                        t.end();
                    } else {
                        setTimeout(getState, 1000);
                    }
                }
            });
        }

        getState();
    });


    suite.test('get job output', function (t) {
        var _keys = 0; // treat 'end' as a key
        function cb(err) {
            t.ifError(err);
            t.ok(_keys > 0);
            t.end();
        }

        client.jobOutput(JOB, function (err, res) {
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


    suite.test('create and cancel job', function (t) {
        client.createJob('grep foo', function (err, job) {
            t.ifError(err);
            t.ok(job);
            client.cancelJob(job, function (err2) {
                t.ifError(err2);
                client.job(job, function (err3, job2) {
                    t.ifError(err3);
                    t.ok(job2);
                    t.ok(job2.cancelled);
                    t.ok(job2.inputDone);
                    // t.equal(job2.state, 'done');
                    t.end();
                });
            });
        });
    });

    suite.end();
});


test('unlink object', function (t) {
    client.unlink(CHILD1, function (err) {
        t.ifError(err);
        t.end();
    });
});


test('rmr', function (t) {
    client.rmr(SUBDIR1, function (err) {
        t.ifError(err);
        t.end();
    });
});


test('mkdirp/rmr', function (t) {
    client.mkdirp(SUBDIR2, function (err) {
        t.ifError(err);
        client.rmr(SUBDIR1, function (err2) {
            t.ifError(err2);
            t.end();
        });
    });
});


test('GH-196 getPath ~~/', function (t) {
    // confirm that evaluating ~~/ works with and without ENV variables
    var user = client.user;
    var old = process.env.MANTA_USER;

    process.env.MANTA_USER = user;
    t.equal(decodeURIComponent(client.path('~~/')), '/' + user);
    delete process.env.MANTA_USER;
    t.equal(decodeURIComponent(client.path('~~/')), '/' + user);
    process.env.MANTA_USER = old;
    // The plain export depends on the ENV variable
    t.equal(decodeURIComponent(manta.path('~~/')), '/' + user);
    t.end();
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
            url: process.env.MANTA_URL,
            rejectUnauthorized: (process.env.MANTA_TLS_INSECURE ? false : true)
        });
    });
    t.end();
});

test('MANTA-2812 null signer', function (t) {
    var c = manta.createClient({
        sign: function (data, cb) { cb(null, null); },
        url: process.env.MANTA_URL,
        user: process.env.MANTA_USER,
        rejectUnauthorized: (process.env.MANTA_TLS_INSECURE ? false : true),
        agent: false
    });
    c.ls(ROOT, function (err) {
        t.ok(err);
        t.strictEqual(err.code, 'ForbiddenError');

        c.ls(PUBLIC, function (err2) {
            t.ifError(err2);
            t.end();
        });
    });
});

test('MANTA-2812 undefined signer', function (t) {
    var c = manta.createClient({
        sign: undefined,
        url: process.env.MANTA_URL,
        user: process.env.MANTA_USER,
        rejectUnauthorized: (process.env.MANTA_TLS_INSECURE ? false : true),
        agent: false
    });
    c.ls(ROOT, function (err) {
        t.ok(err);
        t.strictEqual(err.code, 'ForbiddenError');

        c.ls(PUBLIC, function (err2) {
            t.ifError(err2);
            t.end();
        });
    });
});


test('teardown', function (t) {
    if (client) {
        client.close();
        client = null;
    }
    t.end();
});

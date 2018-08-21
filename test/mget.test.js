/*
 * Copyright 2018 Joyent, Inc.
 */

/*
 * Test the "mget" command.
 */

var assert = require('assert-plus');
var forkExecWait = require('forkexec').forkExecWait;
var fs = require('fs');
var libuuid = require('uuid');
var path = require('path');
var vasync = require('vasync');
var sprintf = require('extsprintf').sprintf;

var logging = require('./lib/logging');


var log = logging.createLogger();

var BINDIR = path.resolve(__dirname, '../bin');
var MGET = path.resolve(BINDIR, 'mget');
var MMKDIR = path.resolve(BINDIR, 'mmkdir');
var MPUT = path.resolve(BINDIR, 'mput');
var MRM = path.resolve(BINDIR, 'mrm');

var TMPDIR = process.env.TMPDIR || '/tmp';

var TESTDIR = sprintf('/%s/stor/node-manta-test-mget-%s',
    process.env.MANTA_USER || 'admin',
    libuuid.v4().split('-')[0]);
var TESTTREE = [
    {
        path: TESTDIR,
        type: 'directory'
    }
];

/*
 * Create three regular UNIX text files (linefeed separated, with a terminating
 * linefeed).
 */
var i;
for (i = 1; i <= 3; i++) {
    TESTTREE.push({
        path: sprintf('%s/%02d.txt', TESTDIR, i),
        type: 'object',
        content: sprintf('%s\nfile (%02d)\n',
            [ 'first', 'second', 'third' ][i - 1], i)
    });
}

/*
 * Create three data files that contain only a single character.  Of particular
 * note is the lack of a trailing linefeed.
 */
for (i = 1; i <= 3; i++) {
    TESTTREE.push({
        path: sprintf('%s/%02d.data', TESTDIR, i),
        type: 'object',
        content: sprintf('%s', String.fromCharCode('a'.charCodeAt(0) + i - 1))
    });
}


// ---- helper functions

function test(name, testfunc) {
    module.exports[name] = testfunc;
}

function unlinkIfExists(targ) {
    try {
        fs.unlinkSync(targ);
    } catch (ex) {
        if (ex.code === 'ENOENT')
            return;

        throw (ex);
    }
}


// ---- tests

test('setup: create test tree at ' + TESTDIR, function (t) {
    var tmpFile = path.join(TMPDIR, 'node-manta-test-tmp-file-' + process.pid);

    vasync.forEachPipeline({
        inputs: TESTTREE,
        func: function createTreeItem(item, next) {
            log.trace({ item: item }, 'create test tree item');

            switch (item.type) {
            case 'directory':
                forkExecWait({argv: [MMKDIR, '-p', item.path]}, next);
                return;

            case 'object':
                /*
                 * Would like a 'stdin' option to `forkExecWait`. For now I'll
                 * quick hack with a local file. An alternative would be
                 * to use the manta client.
                 */
                vasync.pipeline({ funcs: [
                    function mkTmpFile(_, next2) {
                        fs.writeFile(tmpFile, item.content, next2);
                    },
                    function mputIt(_, next2) {
                        forkExecWait({
                            argv: [ MPUT, '-f', tmpFile, item.path ]
                        }, next2);
                    },
                    function rmTmpFile(_, next2) {
                        fs.unlink(tmpFile, next2);
                    }
                ]}, next);
                return;

            default:
                t.ifError(new Error('invalid test tree type: ' + item.type));
                return;
            }
        }
    }, function (err) {
        t.ifError(err, err);
        t.done();
    });
});


/*
 * Download one data file, emitting its contents on stdout.  This data file has
 * no terminating linefeed.  This test ensures we do not accidentally add one
 * in.
 */
test('mget TESTDIR/02.data', function (t) {
    var argv = [
        MGET,
        sprintf('%s/%02d.data', TESTDIR, 2)
    ];

    /*
     * We expect "mget" to download the file and emit it on stdout, without a
     * terminating linefeed.
     */
    var expected = 'b';

    forkExecWait({
        argv: argv
    }, function (err, info) {
        t.ifError(err, err);

        t.equal(info.stderr, '', 'no stderr');
        t.equal(info.stdout, expected, 'stdout from mget');

        t.done();
    });
});


/*
 * Download three data files which exist, emitting their contents on stdout.
 * These data files have no terminating linefeed.  This test ensures we do not
 * accidentally add any in.
 */
test('mget TESTDIR/01.data TESTDIR/02.data TESTDIR/03.data', function (t) {
    var argv = [
        MGET,
        sprintf('%s/%02d.data', TESTDIR, 1),
        sprintf('%s/%02d.data', TESTDIR, 2),
        sprintf('%s/%02d.data', TESTDIR, 3)
    ];

    /*
     * We expect "mget" to download the three files and emit them on stdout in
     * order, without interstitial linefeeds.
     */
    var expected = 'abc';

    forkExecWait({
        argv: argv
    }, function (err, info) {
        t.ifError(err, err);

        t.equal(info.stderr, '', 'no stderr');
        t.equal(info.stdout, expected, 'stdout from mget');

        t.done();
    });
});


/*
 * Download three files which exist, emitting their contents on stdout.
 */
test('mget TESTDIR/01.txt TESTDIR/02.txt TESTDIR/03.txt', function (t) {
    var argv = [
        MGET,
        sprintf('%s/%02d.txt', TESTDIR, 1),
        sprintf('%s/%02d.txt', TESTDIR, 2),
        sprintf('%s/%02d.txt', TESTDIR, 3)
    ];

    /*
     * We expect "mget" to download the three files and emit them to stdout in
     * order.
     */
    var expected = [
        'first',
        'file (01)',
        'second',
        'file (02)',
        'third',
        'file (03)'
    ].join('\n') + '\n';

    forkExecWait({
        argv: argv
    }, function (err, info) {
        t.ifError(err, err);

        t.equal(info.stderr, '', 'no stderr');
        t.equal(info.stdout, expected, 'stdout from mget');

        t.done();
    });
});


/*
 * Download three files which exist, and store the output in a named file
 * using the "-o" flag.
 */
test('mget -o TMPFILE TESTDIR/01.txt TESTDIR/02.txt TESTDIR/03.txt',
    function (t) {

    var tmpFile = path.join(TMPDIR, 'node-manta-test-tmp-file-' + process.pid);
    var argv = [
        MGET, '-o', tmpFile,
        sprintf('%s/%02d.txt', TESTDIR, 1),
        sprintf('%s/%02d.txt', TESTDIR, 2),
        sprintf('%s/%02d.txt', TESTDIR, 3)
    ];

    /*
     * We expect "mget" to download the three files and store the contents in
     * the temporary file we nominated.
     */
    var expected = [
        'first',
        'file (01)',
        'second',
        'file (02)',
        'third',
        'file (03)'
    ].join('\n') + '\n';

    unlinkIfExists(tmpFile);

    forkExecWait({
        argv: argv
    }, function (err, info) {
        t.ifError(err, err);

        t.equal(info.stdout, '', 'no stdout');
        t.equal(info.stderr, '', 'no stderr');

        var fileData = fs.readFileSync(tmpFile, 'utf8');
        t.equal(fileData, expected, 'file data from mget');

        unlinkIfExists(tmpFile);

        t.done();
    });
});

/*
 * Download a file which does exist, and store the output in a file named after
 * the remote object using the "-O" flag.
 */
test('mget -O TESTDIR/01.txt',
    function (t) {

    var file = path.join(TMPDIR, '01.txt');
    var argv = [MGET, '-O', sprintf('%s/%02d.txt', TESTDIR, 1)];

    /*
     * We expect "mget" to download the one file and store the contents in
     * the temporary file we nominated.
     */
    var expected = [
        'first',
        'file (01)'
    ].join('\n') + '\n';

    unlinkIfExists(file);

    process.chdir(TMPDIR);

    forkExecWait({
        argv: argv
    }, function (err, info) {
        t.ifError(err, err);
        t.equal(info.stdout, '', 'no stdout');
        t.equal(info.stderr, '', 'no stderr');

        var fileData = fs.readFileSync(file, 'utf8');
        t.equal(fileData, expected, 'file data from mget');

        unlinkIfExists(file);

        t.done();
    });
});


/*
 * Download two files that do exist, then one that does not exist, then a
 * fourth and final file which exists.  We expect that the contents of the
 * first two files are concatenated together on stdout, but that the output
 * would then terminate early because the third file is not found.
 */
test('mget TESTDIR/01.txt TESTDIR/02.txt TESTDIR/XX.txt TESTDIR/03.txt',
    function (t) {

    var argv = [
        MGET,
        sprintf('%s/%02d.txt', TESTDIR, 1),
        sprintf('%s/%02d.txt', TESTDIR, 2),
        sprintf('%s/%s.txt', TESTDIR, 'XX'),
        sprintf('%s/%02d.txt', TESTDIR, 3)
    ];

    /*
     * We expect "mget" to download the two files and store the contents in the
     * temporary file we nominated.  It will then fail to download the file
     * that does not exist, and the program will stop.
     */
    var expected = [
        'first',
        'file (01)',
        'second',
        'file (02)'
    ].join('\n') + '\n';

    forkExecWait({
        argv: argv
    }, function (err, info) {
        t.ok(err, 'must fail');

        t.ok(info.stderr.match(/^mget: ResourceNotFoundError/, 'stderr'));
        t.equal(info.stdout, expected, 'expected stdout');

        t.done();
    });
});


/*
 * Download two files that do exist, then one that does not exist, then a
 * fourth and final file which exists.  We expect that the contents of the
 * first two files are concatenated together in the output file, but that the
 * output would then terminate early because the third file is not found.
 */
test('mget -o TMPFILE TESTDIR/01.txt TESTDIR/02.txt TESTDIR/XX.txt ' +
    'TESTDIR/03.txt', function (t) {

    var tmpFile = path.join(TMPDIR, 'node-manta-test-tmp-file-' + process.pid);
    var argv = [
        MGET, '-o', tmpFile,
        sprintf('%s/%02d.txt', TESTDIR, 1),
        sprintf('%s/%02d.txt', TESTDIR, 2),
        sprintf('%s/%s.txt', TESTDIR, 'XX'),
        sprintf('%s/%02d.txt', TESTDIR, 3)
    ];

    /*
     * We expect "mget" to download the two files and store the contents in the
     * temporary file we nominated.  It will then fail to download the file
     * that does not exist, and the program will stop.
     */
    var expected = [
        'first',
        'file (01)',
        'second',
        'file (02)'
    ].join('\n') + '\n';

    unlinkIfExists(tmpFile);

    forkExecWait({
        argv: argv
    }, function (err, info) {
        t.ok(err, 'must fail');

        t.ok(info.stderr.match(/^mget: ResourceNotFoundError/, 'stderr'));
        t.equal(info.stdout, '', 'no stdout');

        var fileData = fs.readFileSync(tmpFile, 'utf8');
        t.equal(fileData, expected, 'file data from mget');

        unlinkIfExists(tmpFile);

        t.done();
    });
});


test('cleanup: rm test tree ' + TESTDIR, function (t) {
    // Sanity checks that we don't `mrm -r` a non-test dir.
    assert.ok(TESTDIR);
    assert.ok(TESTDIR.indexOf('node-manta-test') !== -1);

    forkExecWait({ argv: [ MRM, '-r', TESTDIR ]}, function (err) {
        t.ifError(err, err);
        t.done();
    });
});

/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * `mbucket cp ...`
 *
 * Copy objects to and from a Manta bucket.
 */

var format = require('util').format;
var fs = require('fs');
var path = require('path');

var assert = require('assert-plus');
var cmdln = require('cmdln');
var once = require('once');
var vasync = require('vasync');
var VError = require('verror');

var clicommon = require('./clicommon');
var manta = require('../');
var MantaUri = require('../mantauri').MantaUri;


//// XXX work through these options:
//          [--dryrun]
//          [--include <value>]
//          [--exclude <value>]
//          [--follow-symlinks | --no-follow-symlinks]
//          [--no-guess-mime-type]
//          [--content-type <value>]
//          [--cache-control <value>]
//          [--content-disposition <value>]
//          [--content-encoding <value>]
//          [--content-language <value>]
//          [--only-show-errors] -> --quiet
//          [--page-size <value>]
//          [--metadata <value>]
//          [--metadata-directive <value>]
//          [--expected-size <value>]
//          [--recursive]
// XXX check options on `mput`

function upload(client, log, ui, cliOpts, src, dst, cb) {
    assert.optionalNumber(cliOpts.copies, 'cliOpts.copies');
    assert.optionalArrayOfString(cliOpts.metadata, 'cliOpts.metadata');
    assert.string(src, 'src');
    assert.equal(dst.constructor.name, 'MantaUri');
    assert.string(dst.object, 'dst.object');

    vasync.pipeline({arg: {}, funcs: [
        function checkSrc(ctx, next) {
            if (src === '-') {
                next();
                return;
            }

            fs.stat(src, function (err, stats) {
                if (err) {
                    next(err);
                } else if (!stats.isFile()) {
                    next(new VError('"%s" is not a file', src));
                } else {
                    ctx.size = stats.size;
                    next();
                }
            });
        },
        function loadMetadata(ctx, next) {
            clicommon.metadataFromOpts(cliOpts, log, function (err, metadata) {
                if (err) {
                    next(err);
                    return;
                }
                if (metadata) {
                    log.trace({metadata: metadata},
                        'metadata loaded from cliOpts');
                    console.log('XXX metadata', metadata);
                    ctx.metadata = metadata;
                }
                next();
            });
        },
        function getInStream(ctx, next) {
            if (src === '-') {
                ctx.inStream = process.stdin;
                next();
            } else {
                var srcStream = fs.createReadStream(src);

                // Possibly create a progress bar.
                ui.barStart({
                    name: src,
                    size: ctx.size,
                    bytes: true,
                    drawDelay: 2000
                });
                var barStream = ui.barStream();
                if (barStream) {
                    ctx.inStream = srcStream.pipe(barStream);
                } else {
                    ctx.inStream = srcStream;
                }

                ctx.inStream.pause();
                srcStream.on('open', function onSrcOpen() {
                    next();
                });
            }
        },

        function createTheObject(ctx, next) {
            var reqOpts = {
                headers: {
                    'durability-level': cliOpts.copies
                }
            };
            if (ctx.metadata) {
                Object.keys(ctx.metadata).forEach(function (k) {
                    var v = ctx.metadata[k];
                    reqOpts.headers['m-' + k] = v;
                });
            }
            client.createBucketObject(ctx.inStream, dst.bucket, dst.object,
                reqOpts, next);
        },

        function noteAction(ctx, next) {
            ui.barEnd();
            ui.action('upload', src, dst);
            next();
        }
    ]}, function onFinishUpload(err) {
        cb(err);
    });

// XXX content-md5? yes
//      mput has a -m,--md5 (added in #130) to calc md5 and then set
//      Content-MD5 header in
//      upload req. The PutObject docs "You should specify a `Content-MD5`
//      header", which I'm not sure it great for speed of large objects.
//      It is off by default in mput.
//      I don't think mput does... but we *could* calc md5 on the fly and
//      compare to res.headers.computed-md5 and error out (rm it? no) if
//      that doesn't match.
//     Sounds like aws CLI does the former automatically (from
//      `aws help s3-faq`)
//      Perhaps copy aws CLI and consider a --no-checksum to avoid the
//      pre-calc of MD5.
//      What about using SHA256 instead, which is what aws is attempting to
//      move to, I gather.
// XXX mput does up to 3 retries. From
//      https://docs.aws.amazon.com/cli/latest/topic/s3-faq.html S3 CLI will
//      retry on *checksum* failures up to 5 times.
// XXX content-length via stat
// XXX content-type
// XXX don't guess content-type
// XXX does buskie do the expect: 100-continue thing?
//// The following HTTP conditional headers are supported:
//
//    If-Modified-Since
//    If-Unmodified-Since
//    If-Match
//    If-None-Match
// XXX progress
// XXX conditional failure handling:
//            // If we set a HTTP/1.1 Conditional PUT header and the
//            // precondition was not met, then bail out without retrying:
//            if (error && error.name === 'PreconditionFailedError')
//                ifError(error);
}

/*
 * Download one Manta bucket file to a given local file.
 *
 * Dev Note: This first downloads the file to a local ".part" file
 * (`dstPartPath`) and then renames it to the target file when complete. This
 * is to avoid ever having an incomplete file available at the target download
 * path. FWIW, 'aws s3 cp ...' does the same thing.
 */
function downloadOneToFile(client, log, ui, cliOpts, src, dst, cb) {
    assert.equal(src.constructor.name, 'MantaUri');
    assert.string(src.object, 'src.object');
    assert.string(dst, 'dst');

    // XXX what 'opts' are supported here?
    // XXX see `aws help s3-faq` "Download" section for retries on checksum fail

    var context = {
        dstPartPath: null
    };

    // Remove the possibly remaining dstPartPath file. This calls `next()`
    // when complete -- intentionally does not callback with an error.
    var cleanupDstPartPath = function (next) {
        if (!context.dstPartPath) {
            next();
            return;
        }
        fs.unlink(context.dstPartPath, function onPartCleanup(unlinkErr) {
            if (unlinkErr && unlinkErr.code === 'ENOENT') {
                unlinkErr = null;
            }
            if (unlinkErr) {
                log.debug({err: unlinkErr, dstPartPath: context.dstPartPath},
                    'could not unlink download .part path');
            } else {
                log.trace({dstPartPath: context.dstPartPath},
                    'unlinked download .part path');
            }
            next();
        });
    };
    var ourOwnProcessExit = function () {
        process.exit(1);
    };

    vasync.pipeline({arg: context, funcs: [
        // If `dst` is a local *directory*, then we append the src.object
        // basename.
        function determineDstPath(ctx, next) {
            fs.stat(dst, function onStat(err, stats) {
                if (err) {
                    if (err.code === 'ENOENT') {
                        ctx.dstPath = dst;
                        next();
                    } else {
                        next(err);
                    }
                } else if (stats.isDirectory()) {
                    ctx.dstPath = path.join(dst, path.basename(src.object));
                    next();
                } else {
                    ctx.dstPath = dst;
                    next();
                }
            });
        },

        function getPartWriteStream(ctx, next) {
            ctx.dstPartPath = ctx.dstPath + '.' + Date.now() + '.part';

            // Attempt to remove a lingering .part file on Ctrl+C (aka SIGINT)
            // or other unexpected exits.
            //
            // Node signal and exit handling is inscrutable to me. At least
            // with node v10 on Mac if I "Ctrl+C", I only get the 'exit' event
            // if I have a 'SIGINT' handler register. So, even though our
            // SIGINT handler here is just calling `process.exit(...)`, it
            // seems to be necessary to get the exit event.
            process.on('SIGINT', ourOwnProcessExit);
            process.on('exit', cleanupDstPartPath);

            try {
                ctx.partStream = fs.createWriteStream(ctx.dstPartPath);
            } catch (err) {
                next(err);
                return;
            }

            ctx.partStream.on('open', function () {
                next();
            });
        },

        function getObjStream(ctx, next) {
            client.getBucketObject(src.bucket, src.object, {},
                                   function (err, srcStream, res) {
                if (err) {
                    next(err);
                    return;
                }

                var onceNext = once(next);

                // `getBucketObject` resumes `res` (aka the stream) in the
                // nextTick, so we need to setup event handlers right away.
                srcStream.once('error', function (srcStreamErr) {
                    onceNext(new VError(srcStreamErr,
                        'could not download "%s"', src));
                });
                ctx.partStream.once('error', function (partStreamErr) {
                    onceNext(new VError(partStreamErr,
                        'could not write to "%s"', ctx.dstPath));
                });

                // Dev Notes:
                // - simulate a `ChecksumError` in `MantaClient.get` via:
                //      _res.headers['content-md5'] += 'cosmicray';
                // - simulate a `DownloadError` in `MantaClient.get` via:
                //      _res.headers['content-length'] =
                //          String(Number(_res.headers['content-length']) - 1);

                ctx.partStream.on('close', function onPartFileClose() {
                    log.trace({dstPartPath: ctx.dstPartPath},
                        'download .part path written');
                    onceNext();
                });

                // Possibly create a progress bar.
                var size;
                if (res.headers['content-length']) {
                    size = parseInt(res.headers['content-length'], 10);
                }
                ui.barStart({
                    name: src.toString(),
                    size: size,
                    bytes: true,
                    drawDelay: 2000
                });
                var barStream = ui.barStream();
                var inStream;
                if (barStream) {
                    inStream = srcStream.pipe(barStream);
                } else {
                    inStream = srcStream;
                }

                inStream.pipe(ctx.partStream);
            });
        },

        function mvToFinalPath(ctx, next) {
            fs.rename(ctx.dstPartPath, ctx.dstPath, next);
        },

        function noteAction(ctx, next) {
            ui.barEnd();
            ui.action('download', src, ctx.dstPath);
            next();
        }
    ]}, function finish(err) {
        if (err && context.dstPartPath) {
            cleanupDstPartPath(function onClean() {
                cb(err);
            });
        } else {
            process.removeListener('SIGINT', ourOwnProcessExit);
            process.removeListener('exit', cleanupDstPartPath);
            cb();
        }
    });
}


function do_cp(subcmd, opts, args, cb) {
    var client = this.client;
    var dst;
    var log = this.log;
    var src;
    var ui = this.ui;

    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length !== 2) {
        cb(new cmdln.UsageError('incorrect number of args'));
        return;
    }

    if (args[0].slice(0, 6) === 'manta:')  {
        try {
            src = new MantaUri(args[0]);
        } catch (parseErr) {
            cb(new cmdln.UsageError(parseErr, parseErr.message));
            return;
        }
    } else {
        src = args[0];
        if (src.length === 0) {
            cb(new cmdln.UsageError('source local path is empty'));
            return;
        }
    }
    if (args[1].slice(0, 6) === 'manta:')  {
        try {
            dst = new MantaUri(args[1]);
        } catch (parseErr) {
            cb(new cmdln.UsageError(parseErr, parseErr.message));
            return;
        }
    } else {
        dst = args[1];
        if (dst.length === 0) {
            cb(new cmdln.UsageError('destination local path is empty'));
            return;
        }
    }

    // XXX testing '.' and '..' path elements in MantaUris

    if (src instanceof MantaUri && dst instanceof MantaUri) {
        // Manta-to-Manta copying is not supported.
        cb(new cmdln.UsageError('both arguments are Manta URIs: ' +
            'one argument must be a local path'));
    } else if (dst instanceof MantaUri) {
        // Upload

        // Handle adding the `src` basename, if necessary.
        if (!dst.object) {
            if (src === '-') {
                cb(new cmdln.UsageError('destination must include a basename ' +
                    'when source is "-" (stdin)'));
                return;
            }
            dst.object = path.basename(src);
        } else if (dst.object.slice(-1) === '/') {
            if (src === '-') {
                cb(new cmdln.UsageError('destination must include a basename ' +
                    'when source is "-" (stdin)'));
                return;
            }
            dst.object += path.basename(src);
        }

        upload(client, log, ui, opts, src, dst, cb);
    } else if (src instanceof MantaUri) {
        // Download

        if (!src.object) {
            cb(new cmdln.UsageError('source must include a object path'));
            return;
        }
        if (opts.metadata) {
            cb(new cmdln.UsageError(
                '"--metadata" only makes sense for a file upload'));
            return;
        }

        if (dst === '-') {
            clicommon.streamBucketObjectToStdout(client, log, opts, src, cb);
        } else {
            downloadOneToFile(client, log, ui, opts, src, dst, cb);
        }
    } else {
        cb(new cmdln.UsageError('neither argument is a Manta URI'));
    }
}

do_cp.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    },
    {
        group: 'Upload options'
    },
    {
        names: ['copies'],
        type: 'positiveInteger',
        help: 'Number of copies (durability) of this object to store. The ' +
            'server-side default is 2.',
        helpArg: 'N'
    },
    {
        names: ['metadata'],
        type: 'arrayOfString',
        helpArg: 'MAP',
        help: 'Add metadata when creating a bucket object. Metadata are ' +
            'key/value string pairs stored with the bucket object. They are ' +
            'available as HTTP headers prefixed with "m-". ' +
            'MAP is one of: a "key1=value1,key2=value2" string, a JSON ' +
            'object (if first char is "{"), or "@FILE" to have metadata be ' +
            'loaded from FILE. This option can be used multiple times.'
    }
];

do_cp.help = [
    // Dev Note: singular for now. Make this plural when supporting that.
    'Copy an object into or out of a bucket.',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'Examples:',
    '    # Uploading a local file to Manta',
    '    mbucket cp foo.txt manta:mybucket/bar.txt',
    '',
    '    # Uploading a local file to a Manta prefix.',
    '    # If the destination object path is empty or includes a trailing',
    '    # slash, then the source basename is appended. In the following two',
    '    # commands "foo.txt" is appended to the destination.',
    '    mbucket cp adir/foo.txt manta:mybucket',
    '    mbucket cp adir/foo.txt manta:mybucket/someprefix/',
    '',
    '    # Downloading a Manta object to a local file',
    '    mbucket cp manta:mybucket/bar.txt foo.txt',
    '',
    '    # Uploading a local file stream to Manta',
    '    cat foo.txt | mbucket cp - manta:mybucket/bar.txt',
    '',
    '    # Downloading a Manta object as a local file stream.',
    '    # Note: This cannot retry if there is a download failure.',
    '    mbucket cp manta:mybucket/bar.txt -'
].join('\n');

do_cp.synopses = [
    '{{name}} {{cmd}} [OPTIONS] LOCAL-PATH MANTA-URI',
    '{{name}} {{cmd}} [OPTIONS] MANTA-URI  LOCAL-PATH'
];
do_cp.completionArgtypes = ['default', 'default', 'none'];

module.exports = do_cp;

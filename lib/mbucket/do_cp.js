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
//          [--quiet]
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
//          [--no-progress]
//          [--page-size <value>]
//          [--metadata <value>]
//          [--metadata-directive <value>]
//          [--expected-size <value>]
//          [--recursive]
// XXX check options on `mput`

function upload(client, log, cliOpts, src, dst, cb) {
    assert.optionalNumber(cliOpts.copies, 'cliOpts.copies');
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
                    next();
                }
            });
        },
        function getInStream(ctx, next) {
            if (src === '-') {
                ctx.inStream = process.stdin;
                next();
            } else {
                ctx.inStream = fs.createReadStream(src);
                ctx.inStream.pause();
                ctx.inStream.on('open', function onSrcOpen() {
                    next();
                });
            }
        },

        function createTheObject(ctx, next) {
            var reqOpts = {};
            if (cliOpts.copies !== undefined) {
                reqOpts.headers = {
                    'durability-level': cliOpts.copies
                }
            }

            client.createBucketObject(ctx.inStream, dst.bucket, dst.object,
                reqOpts, next);
        }
    ]}, function onFinishUpload(err) {
        cb(err);
    });

// XXX content-md5? yes
//      mput has a -m,--md5 (added in #130) to calc md5 and then set Content-MD5 header in
//      upload req. The PutObject docs "You should specify a `Content-MD5`
//      header", which I'm not sure it great for speed of large objects.
//      It is off by default in mput.
//      I don't think mput does... but we *could* calc md5 on the fly and
//      compare to res.headers.computed-md5 and error out (rm it? no) if
//      that doesn't match.
//     Sounds like aws CLI does the former automatically (from `aws help s3-faq`)
//      Perhaps copy aws CLI and consider a --no-checksum to avoid the pre-calc of MD5.
//      What about using SHA256 instead, which is what aws is attempting to move to, I gather.
// XXX mput does up to 3 retries. From
//      https://docs.aws.amazon.com/cli/latest/topic/s3-faq.html S3 CLI will
//      retry on *checksum* failures up to 5 times.
// XXX content-length via stat
// XXX content-type
// XXX don't guess content-type
// XXX [num] copies
// XXX does buskie do the expect: 100-continue thing?
//// The following HTTP conditional headers are supported:
//
//    If-Modified-Since
//    If-Unmodified-Since
//    If-Match
//    If-None-Match
// XXX progress
// XXX conditional failure handling:
//                    // If we set a HTTP/1.1 Conditional PUT header and the
//                    // precondition was not met, then bail out without retrying:
//                    if (error && error.name === 'PreconditionFailedError')
//                        ifError(error);
}

/*
 * Download one Manta bucket file to a given local file.
 */
function downloadOneToFile(client, log, cliOpts, src, dst, cb) {
    assert.equal(src.constructor.name, 'MantaUri');
    assert.string(src.object, 'src.object');
    assert.string(dst, 'dst');

    // XXX what 'opts' are supported here?
    // XXX progress bar (see mget, it uses `bar.stream()`, not sure about that)
    // XXX see `aws help s3-faq` "Download" section for retries on checksum failures

    var context = {};

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

        // We download to a separate file and then rename it when complete. This
        // is to avoid ever having an incomplete file available at the target
        // download path.
        function getPartWriteStream(ctx, next) {
            ctx.dstPartPath = ctx.dstPath + '.' + Date.now() + '.part';

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
                                   function (err, stream, _res) {
                if (err) {
                    next(err);
                    return;
                }

                var onceNext = once(next);

                // `getBucketObject` resumes `res` (aka the stream) in the
                // nextTick, so we need to setup event handlers right away.
                stream.once('error', function (err) {
                    onceNext(new VError(err, 'could not download "%s"', src));
                });
                ctx.partStream.once('error', function (err) {
                    onceNext(new VError(err, 'could not write to "%s"',
                        ctx.dstPath));
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

                stream.pipe(ctx.partStream);
            });
        },

        function mvToFinalPath(ctx, next) {
            fs.rename(ctx.dstPartPath, ctx.dstPath, next);
        }

        // XXX ui.info('download: $src to $dst')
    ]}, function finish(err) {
        if (err && context.dstPartPath) {
            // Clean up the possibly left over .part file.
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
                cb(err);
            });
        } else {
            cb(err);
        }
    });
}


function do_cp(subcmd, opts, args, cb) {
    var log = this.log;
    var client = this.client;
    var src;
    var dst;

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

        upload(client, log, opts, src, dst, cb);
    } else if (src instanceof MantaUri) {
        // Download
        if (dst === '-') {
            clicommon.streamBucketObjectToStdout(client, log, opts, src, cb);
        } else {
            downloadOneToFile(client, log, opts, src, dst, cb);
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
        help: 'Number of copies (durability) of this object to store.'
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
    '    mbucket cp manta:mybucket/bar.txt -',
].join('\n');

do_cp.synopses = [
    '{{name}} {{cmd}} [OPTIONS] LOCAL-PATH MANTA-URI',
    '{{name}} {{cmd}} [OPTIONS] MANTA-URI  LOCAL-PATH'
];
do_cp.completionArgtypes = ['default', 'default', 'none'];

module.exports = do_cp;

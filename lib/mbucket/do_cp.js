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
var vasync = require('vasync');
var VError = require('verror');

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
    assert.object(client, 'client')
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
            client.createBucketObject(ctx.inStream, dst.bucket, dst.object,
                {}, next);
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

function download(client, log, opts, src, dst, cb) {
    XXXdownload
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
                cb(new cmdln.UsageError('cannot use source basename for ' +
                    'destination when source is "-" (stdin)'));
                return;
            }
            dst.object = path.basename(src);
        } else if (dst.object.slice(-1) === '/') {
            if (src === '-') {
                cb(new cmdln.UsageError('cannot use source basename for ' +
                    'destination when source is "-" (stdin)'));
                return;
            }
            dst.object += path.basename(src);
        }

        upload(client, log, opts, src, dst, cb);
    } else if (src instanceof MantaUri) {
        // Download
        download(client, log, opts, src, dst, cb);
    } else {
        cb(new cmdln.UsageError('both arguments are Manta URIs: ' +
            'Manta-to-Manta copying is not supported'));
    }
}

do_cp.options = [
    {
        names: ['help'],
        type: 'bool',
        help: 'Show this help.'
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
    '    # Downloading a Manta object as a local file stream',
    '    mbucket cp manta:mybucket/bar.txt -',
].join('\n');

do_cp.synopses = [
    '{{name}} {{cmd}} [OPTIONS] LOCAL-PATH MANTA-URI',
    '{{name}} {{cmd}} [OPTIONS] MANTA-URI  LOCAL-PATH'
];
do_cp.completionArgtypes = ['default', 'default', 'none'];

module.exports = do_cp;

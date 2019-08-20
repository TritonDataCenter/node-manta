/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * `mbucket ls ...`
 *
 * List Manta buckets or objects in a given bucket (and optionally with a given
 * prefix).
 */

var assert = require('assert-plus');
var cmdln = require('cmdln');
var sprintf = require('extsprintf').sprintf;
var VError = require('verror');

var MantaUri = require('../mantauri').MantaUri;
var utils = require('../utils');


function printBucketDefault(bucket) {
    console.log('%s %s', bucket.mtime, bucket.name);
}
function printBucketRawString(s) {
    process.stdout.write(s);
}


function printObjectDefault(obj) {
    console.log(sprintf('%24s %10s %s',
        obj.mtime || '', obj.size || '', obj.name));
}
function printObjectHuman(obj) {
    console.log(sprintf('%24s %10s %s',
        obj.mtime || '',
        obj.size ? utils.prettyBytes(obj.size) : '',
        obj.name));
}
function printObjectRawString(s) {
    process.stdout.write(s);
}


function do_ls(subcmd, opts, args, cb) {
    var log = this.log;
    var client = this.client;
    var muri;
    var printBucket;
    var printObject;
    var streamOpts;

    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length > 1) {
        cb(new cmdln.UsageError('incorrect number of args'));
        return;
    }

    if (args.length === 0) {
        // List buckets

        streamOpts = {};
        if (opts.json) {
            streamOpts.rawString = true;
            printBucket = printBucketRawString;
        } else if (opts.o) {
            assert.ok(opts.o.length, 'empty -o option argument');
            printBucket = function printBucketO(bucket) {
                for (var i = 0; i < opts.o.length; i++) {
                    var k = opts.o[i];
                    if (i !== 0) {
                        process.stdout.write(' ');
                    }
                    if (Object.prototype.hasOwnProperty.call(bucket, k)) {
                        process.stdout.write(bucket[k]);
                    } else {
                        process.stdout.write('-');
                    }
                }
                process.stdout.write('\n');
            }
        } else {
            printBucket = printBucketDefault;
        }

        // `createListBucketsStream` also accepts `query.marker` and
        // `query.delimiter`. However, those are not exposed via `mbucket ls`
        // because I don't know of a valid use case.
        streamOpts.query = {
            limit: opts.page_size,
            prefix: opts.bucket_prefix
        }
        var s = client.createListBucketsStream(streamOpts);
        s.on('readable', function onReadable() {
            var bucket;
            while ((bucket = s.read()) !== null) {
                printBucket(bucket);
            }
        });
        s.once('error', function onError(err) {
            cb(err);
        });
        s.once('end', function onEnd() {
            cb();
        });

    } else {
        // List objects.

        try {
            muri = new MantaUri(args[0]);
        } catch (parseErr) {
            cb(new cmdln.UsageError(parseErr, parseErr.message));
            return;
        }

        // XXX to test:
        // - GOOD: '/' delim at top-level
        // - GOOD: recursive with no prefix for the whole thing
        // - GOOD: recursive with a prefix
        // * * *
        // - '/' delim in a subdir
        //      blocked on MANTA-4515
        // - the 'yadir' and 'yadir/...' case with both file and dir with same name
        //        $ aws s3 ls s3://trentm-play/yadir/
        //                                   PRE bdir/
        //        2019-06-17 13:44:23          4 bar.txt
        //        2019-06-21 15:45:08          4 baz.txt
        //        2019-06-17 13:44:23          4 foo.txt
        //        [15:53:16 trentm@bluesteel:~/joy/node-manta2 (buckets m:trentm-trentlab)]
        //        $ aws s3 ls s3://trentm-play/yadir
        //                                   PRE yadir/
        //        2019-06-21 15:44:57          4 yadir
        // - Note the printed path diffs here:
        //     Do we want to emulate that?
        //        $ aws s3 ls s3://trentm-play/anotherdir/ --recursive
        //        2019-06-21 15:45:20          4 anotherdir/baz.txt
        //        [15:19:24 trentm@bluesteel:~/joy/electric-boray (master m:trentm-trentlab)]
        //        $ aws s3 ls s3://trentm-play/anotherdir/
        //        2019-06-21 15:45:20          4 baz.txt
        //      S3 is pretty incompatible here. Someone could theoretically
        //      be depending on `--recursive` always yielding full path.
        //      Proposal:
        //      - json: just the unmolested object with 'name'
        //      - else, add a 'relname' field that one can used with '-o relname'
        //        and a '--relname' option to print that. By default still
        //        always the full name.  Try to only do 'relname' addition
        //        lazily.
        streamOpts = {
            query: {
                limit: opts.page_size,
                prefix: muri.object
            }
        };
        if (!opts.recursive) {
            streamOpts.query.delimiter = '/';
        }

        if (opts.json) {
            streamOpts.rawString = true;
            printObject = printObjectRawString;
        } else if (opts.o) {
            assert.ok(opts.o.length, 'empty -o option argument');
            printObject = function printObjectO(obj) {
                for (var i = 0; i < opts.o.length; i++) {
                    var k = opts.o[i];
                    if (i !== 0) {
                        process.stdout.write(' ');
                    }
                    if (Object.prototype.hasOwnProperty.call(obj, k)) {
                        process.stdout.write(obj[k].toString());
                    } else {
                        process.stdout.write('-');
                    }
                }
                process.stdout.write('\n');
            }
        } else if (opts.human_readable) {
            printObject = printObjectHuman;
        } else {
            printObject = printObjectDefault;
        }

        var s = client.createListBucketObjectsStream(muri.bucket, streamOpts);
        s.on('readable', function onReadable() {
            var obj;
            while ((obj = s.read()) !== null) {
                printObject(obj);
            }
        });
        s.once('error', function onError(err) {
            cb(err);
        });
        s.once('end', function onEnd() {
            cb();
        });
    }
}

do_ls.options = [
    {
        names: ['help'],
        type: 'bool',
        help: 'Show this help.'
    },
    {
        names: ['recursive'],
        type: 'bool',
        help: 'List all objects under the specified directory or prefix.'
    },
    {
        // We use 'page-size' instead of 'limit' to match `aws s3 ls`.
        names: ['page-size'],
        type: 'positiveInteger',
        help: 'The number of results to return in each response, by default ' +
            '1024 (the maximum). Using a lower value may help if an ' +
            'operation times out.',
        default: 1024,
        helpArg: 'N'
    },
    {
        names: ['bucket-prefix'],
        type: 'string',
        help: 'A bucket name prefix that returned buckets will match. ' +
            'This is only applicable when listing buckets (i.e. when no ' +
            'arguments are provided.',
        // This is a hidden option because the only valid use cases I know are:
        // - bash completion implementation for `mbucket ls manta:mybu<TAB>`
        // - dev/testing
        hidden: true,
        helpArg: 'PREFIX'
    },
    {
        group: 'Output options'
    },
    {
        names: ['o'],
        type: 'arrayOfCommaSepString',
        help: 'Specify fields to output, e.g. ' +
            '`mbucket ls -o name manta:mybucket`',
        helpArg: 'field1,...'
    },
    {
        names: ['json', 'j'],
        type: 'bool',
        help: 'JSON output.'
    },
    {
        names: ['human-readable', 'h'],
        type: 'bool',
        help: 'Display file size with a *-ibibyte suffix, e.g. "10M" for ' +
            'ten mebibytes.'
    }
];

do_ls.help = [
    'List buckets or objects.',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'Examples:',
    '    # Listing buckets',
    '    mbucket ls',
    '',
    '    # Listing objects in bucket "mybucket"',
    '    mbucket ls manta:mybucket'
].join('\n');

do_ls.synopses = ['{{name}} {{cmd}} [OPTIONS] [MANTA-URI]'];
do_ls.completionArgtypes = ['mantabucketuri', 'none'];

module.exports = do_ls;

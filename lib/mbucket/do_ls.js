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
var VError = require('verror');

var manta = require('../');


function printBucketDefault(bucket) {
    console.log(bucket.name)
}
function printBucketLong(bucket) {
    console.log('%s %s', bucket.mtime, bucket.name);
}
function printBucketRawString(s) {
    process.stdout.write(s);
}

function do_ls(subcmd, opts, args, cb) {
    var log = this.log;
    var client = this.client;

    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length > 1) {
        cb(new cmdln.UsageError('incorrect number of args'));
        return;
    }

    if (args.length === 0) {
        // List buckets

        var printBucket;
        var streamOpts = {};
        if (opts.json) {
            streamOpts.rawString = true;
            printBucket = printBucketRawString;
        } else if (opts.long) {
            printBucket = printBucketLong;
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
        cb(new VError('not yet implemented'));
    }
}

do_ls.options = [
    {
        names: ['help'],
        type: 'bool',
        help: 'Show this help.'
    },
    {
        group: 'Output options'
    },
    {
        names: ['o'],
        type: 'arrayOfCommaSepString',
        help: 'Specify fields (columns) to output.',
        helpArg: 'field1,...'
    },
    {
        names: ['long', 'l'],
        type: 'bool',
        help: 'Long/wider output. Ignored if "-o ..." is used.'
    },
    {
        names: ['json', 'j'],
        type: 'bool',
        help: 'JSON output.'
    }
];
// XXX equiv to s3 '--human-readable'? for objects
// XXX equiv to s3 '--summarize'? for objects

do_ls.help = [
    'List buckets or objects in the given bucket.',
    '',
    '{{usage}}',
    '',
    '{{options}}',
].join('\n');

do_ls.synopses = ['{{name}} {{cmd}} [OPTIONS] [MANTA-URI]'];
do_ls.completionArgtypes = ['mantabucketuri', 'none'];

module.exports = do_ls;

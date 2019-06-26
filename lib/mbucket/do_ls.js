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


function printBucketDefault(bucket) {
    console.log(bucket.name)
}
function printBucketLong(bucket) {
    console.log('%s %s', bucket.mtime, bucket.name);
}
function printBucketRawString(s) {
    process.stdout.write(s);
}


function printObjectDefault(obj) {
    console.log(obj.name)
}
function printObjectLong(obj) {
    console.log(sprintf('%s %10d %s', obj.mtime, obj.size, obj.name));
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

        try {
            muri = new MantaUri(args[0]);
        } catch (parseErr) {
            cb(new cmdln.UsageError(parseErr, parseErr.message));
            return;
        }
        if (muri.object) {
            cb(new VError(
                'listing objects with a *prefix* is not yet implemented: "%s"',
                muri.object));
            return;
        }

        // XXX
        streamOpts = {};
        if (opts.json) {
            streamOpts.rawString = true;
            printObject = printObjectRawString;
        } else if (opts.long) {
            printObject = printObjectLong;
        } else if (opts.o) {
            assert.ok(opts.o.length, 'empty -o option argument');
            printObject = function printObjectO(obj) {
                for (var i = 0; i < opts.o.length; i++) {
                    var k = opts.o[i];
                    if (i !== 0) {
                        process.stdout.write(' ');
                    }
                    if (Object.prototype.hasOwnProperty.call(obj, k)) {
                        process.stdout.write(obj[k]);
                    } else {
                        process.stdout.write('-');
                    }
                }
                process.stdout.write('\n');
            }
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
// XXX recursive
// XXX prefix for listing objects
// XXX pagination
// XXX equiv to s3 '--human-readable'? for objects
// XXX equiv to s3 '--summarize'? for objects

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

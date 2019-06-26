/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * `mbucket mb ...`
 *
 * Create a bucket (*M*ake *B*ucket).
 */

var format = require('util').format;

var assert = require('assert-plus');
var cmdln = require('cmdln');
var VError = require('verror');

var MantaUri = require('../mantauri').MantaUri;


function do_mb(subcmd, opts, args, cb) {
    var log = this.log;
    var client = this.client;
    var muri;

    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length !== 1) {
        cb(new cmdln.UsageError('incorrect number of args'));
        return;
    }

    try {
        muri = new MantaUri(args[0]);
    } catch (parseErr) {
        cb(new cmdln.UsageError(parseErr, parseErr.message));
        return;
    }
    if (muri.object) {
        cb(new cmdln.UsageError(format(
            'invalid bucket URI: has a trailing object path: "%s"',
            muri.object)));
        return;
    }

    client.createBucket(muri.bucket, {}, function onCreate(err) {
        if (err) {
            cb(err);
        } else {
            // Silent if no error (as `mmkdir` is).
            cb();
        }
    });
}

do_mb.options = [
    {
        names: ['help'],
        type: 'bool',
        help: 'Show this help.'
    }
];

do_mb.help = [
    'Make a bucket.',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'Example:',
    '    mbucket mb manta:mybucket'
].join('\n');

do_mb.synopses = ['{{name}} {{cmd}} [OPTIONS] [MANTA-URI]'];
do_mb.completionArgtypes = ['mantabucketuri', 'none'];

module.exports = do_mb;

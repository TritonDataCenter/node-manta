/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * `mbucket rb ...`
 *
 * Remove/delete a bucket (*R*emove *B*ucket).
 */

var format = require('util').format;

var assert = require('assert-plus');
var cmdln = require('cmdln');
var VError = require('verror');

var manta = require('../');
var MantaUri = require('../mantauri').MantaUri;


function do_rb(subcmd, opts, args, cb) {
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

    client.deleteBucket(muri.bucket, {}, function onDel(err) {
        if (err) {
            cb(err);
        } else {
            // Silent if no error (as `mrmdir` is).
            cb();
        }
    });
}

do_rb.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    }
];

do_rb.help = [
    'Remove a bucket.',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'A bucket must be empty of all objects before being deleted.',
    'Example:',
    '    mbucket rb manta:mybucket'
].join('\n');

do_rb.synopses = ['{{name}} {{cmd}} [OPTIONS] [MANTA-URI]'];
do_rb.completionArgtypes = ['mantabucketuri', 'none'];

module.exports = do_rb;

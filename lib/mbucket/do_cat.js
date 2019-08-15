/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * `mbucket cat MANTA-URI`
 *
 * Dump the content of a given Manta bucket object to stdout. This is the
 * equiv of `mbucket cp MANTA-URI -`.
 *
 * Dev Notes:
 * - unlike `mget` this does not support cat'ing multiple objects.
 */

var cmdln = require('cmdln');
var VError = require('verror');

var clicommon = require('./clicommon');
var MantaUri = require('../mantauri').MantaUri;

function do_cat(subcmd, opts, args, cb) {
    var log = this.log;
    var client = this.client;
    var src;

    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length !== 1) {
        cb(new cmdln.UsageError('incorrect number of args'));
        return;
    }

    try {
        src = new MantaUri(args[0]);
    } catch (parseErr) {
        cb(new cmdln.UsageError(parseErr, parseErr.message));
        return;
    }
    if (!src.object) {
        cb(new cmdln.UsageError('no object name was given'));
        return;
    }

    clicommon.streamBucketObjectToStdout(client, log, opts, src, cb);
}

do_cat.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    }
];

do_cat.help = [
    'Stream a bucket object to stdout.',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'Example:',
    '    mbucket cat manta:mybucket/bar.txt'
].join('\n');

do_cat.synopses = ['{{name}} {{cmd}} [OPTIONS] MANTA-URI'];
do_cat.completionArgtypes = ['default', 'none'];

module.exports = do_cat;

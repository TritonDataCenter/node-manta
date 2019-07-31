/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * `mbucket is-supported`
 *
 * A hidden command for exercising the `MantaBucketsClient.isBucketsSupported()`
 * method.
 */

var assert = require('assert-plus');
var cmdln = require('cmdln');
var VError = require('verror');

var manta = require('../');


function do_is_supported(subcmd, opts, args, cb) {
    var log = this.log;
    var client = this.client;

    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length) {
        cb(new cmdln.UsageError('incorrect number of args'));
        return;
    }

    client.isBucketsSupported({}, function (err, isSupported) {
        if (err) {
            cb(err);
        } else {
            console.log(isSupported);
            // XXX set exit status option?
            cb();
        }
    });
}

do_is_supported.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    }
];

do_is_supported.help = [
    'Check if this Manta supports Buckets.',
    '',
    '{{usage}}',
    '',
    '{{options}}',
].join('\n');

do_is_supported.hidden = true;

module.exports = do_is_supported;

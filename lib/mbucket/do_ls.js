/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * `mbucket ls ...`
 *
 * List Manta buckets or objects in a given bucket (and optionally with a given
 * prefix).
 */

var cmdln = require('cmdln');
var VError = require('verror');

var manta = require('../');


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
        cb(new VError('not yet implemented'));
        //client.listBuckets(function (err, buckets) {
        //    if (err) {
        //        cb(err);
        //    }
        //});
    } else {
        cb(new VError('not yet implemented'));
    }
}

do_ls.options = [];

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

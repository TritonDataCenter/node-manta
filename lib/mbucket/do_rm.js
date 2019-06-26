/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * `mbucket rm ...`
 *
 * Remove objects from a Manta bucket.
 */

var cmdln = require('cmdln');

var MantaUri = require('../mantauri').MantaUri;


function do_rm(subcmd, opts, args, cb) {
    var log = this.log;
    var client = this.client;
    var src;
    var dst;

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

    if (!muri.object) {
        // `mbucket rb` is for removing buckets, and deleting nothing is not
        // considered as error (similar to `aws s3 rm s3://mybucket`.)
        cb();
        return;
    }
    // XXX testing '.' and '..' path elements in MantaUris

    // XXX ui.info()
    client.deleteBucketObject(muri.bucket, muri.object, cb);
}

do_rm.options = [
    {
        names: ['help'],
        type: 'bool',
        help: 'Show this help.'
    }
];

do_rm.help = [
    // Dev Note: singular for now. Make this plural when supporting that.
    'Delete a Manta bucket object.',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'Examples:',
    '    # Delete "foo.txt" from bucket "mybucket".',
    '    mbucket rm manta:mybucket/foo.txt'
].join('\n');

do_rm.synopses = ['{{name}} {{cmd}} [OPTIONS] MANTA-URI'];
do_rm.completionArgtypes = ['mantaobjecturi'];

module.exports = do_rm;

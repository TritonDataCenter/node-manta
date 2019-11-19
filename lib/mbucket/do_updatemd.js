/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * `mbucket updatemd ...`
 *
 * Update metadata on an existing bucket object.
 */

var cmdln = require('cmdln');

var clicommon = require('./clicommon');
var MantaUri = require('../mantauri').MantaUri;


function do_updatemd(subcmd, opts, args, cb) {
    var client = this.client;
    var log = this.log;
    var muri;

    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length < 1) {
        cb(new cmdln.UsageError('missing MANTA-URI argument'));
        return;
    }

    try {
        muri = new MantaUri(args[0]);
    } catch (parseErr) {
        cb(new cmdln.UsageError(parseErr, parseErr.message));
        return;
    }
    var metadataArgs = args.slice(1);

    if (opts.delete) {
        if (metadataArgs.length > 0) {
            cb(new cmdln.UsageError(
                'cannot provide METADATA arguments and use -D,--delete'));
        } else {
            client.putBucketObjectMetadata(muri.bucket, muri.object,
                function (err, res) {
                    if (err) {
                        cb(err);
                    } else {
                        clicommon.printBucketObjectInfo(res);
                        cb();
                    }
                });
        }
    } else {
        clicommon.metadataFromArgs(metadataArgs, log, function (err, metadata) {
            if (err) {
                cb(err);
                return;
            }

            var reqOpts = {
                headers: {}
            };
            Object.keys(metadata).forEach(function (k) {
                reqOpts.headers['m-' + k] = metadata[k];
            });

            client.putBucketObjectMetadata(muri.bucket, muri.object, reqOpts,
                function (putErr, res) {
                    if (putErr) {
                        cb(putErr);
                    } else {
                        clicommon.printBucketObjectInfo(res);
                        cb();
                    }
                });
        });
    }
}

do_updatemd.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    },
    {
        names: ['delete', 'D'],
        type: 'bool',
        help: 'Use this option to explicitly delete all metadata for ' +
            'this object.'
    }
];

do_updatemd.help = [
    'Replace custom metadata on an existing bucket object.',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'This command will replace custom metadata ("m-*" headers) on an existing',
    'bucket object. Note that this is a **full replacement** of metadata for',
    'that object.',
    '',
    'METADATA is one of: a "key1=value1,key2=value2" string, a JSON object',
    '(if first char is "{"), or "@FILE" to have metadata be loaded from FILE.',
    'Multiple arguments can be given.',
    '',
    'If no METADATA arguments are provided it is a no-op. Use the "-D" option',
    'to explicitly remove all metadata. If METADATA argument are provided but',
    'are empty, that is considered an error.',
    '',
    'Examples:',
    '      # Set a simple value.',
    '      mbucket updatemd manta:mybucket/bar.txt spam=eggs,a=b',
    '',
    '      # The same via JSON:',
    '      mbucket updatemd manta:mybucket/bar.txt \'{"spam":"eggs","a":"b"}\'',
    '',
    '      # The same from file:',
    '      echo \'{"spam":"eggs"}\' >mymetadata.json',
    '      mbucket updatemd manta:mybucket/bar.txt @mymetadata.json'
].join('\n');

do_updatemd.synopses = [
    '{{name}} {{cmd}} MANTA-URI [METADATA...]',
    '{{name}} {{cmd}} MANTA-URI -D'
];
do_updatemd.completionArgtypes = ['default'];

module.exports = do_updatemd;

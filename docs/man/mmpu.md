mmpu 1 "June 2017" Manta "Manta Commands"
=======================================

NAME
----

mmpu - manage manta multipart uploads

SYNOPSIS
--------

`mmpu` [OPTION...] command [command-specific arguments]

DESCRIPTION
-----------

mmpu allows you to interact with Manta's multipart upload API. The multipart
upload API allows you to upload an object to Manta in chunks, or "parts",
instead of through a single PUT request.  After all parts have been uploaded,
you can "commit" your multipart upload, exposing your uploaded object as a
single file in Manta.  Using mmpu, you can create multipart uploads, upload
parts to them, and commit or "abort" (cancel) them. You may also list
non-garbage collected uploads and see uploaded parts for a given MPU.

The primary reference for a multipart upload is its UUID.  Most commands operate
on multipart uploads by UUID.  Parts of a given upload are usually referenced by
their part number (beginning with the first part at 0).

The final object created by a committed multipart upload is referred to as the
"target object" of the multipart upload.  Additionally, a multipart upload is
often referred to as an "MPU" or just an "upload".

COMMON OPTIONS
--------------

The following options are supported in all commands:

`-a, --account login`
  Authenticate as account (login name).

`-h, --help`
  Print a help message and exit.

`-i, --insecure`
  This option explicitly allows "insecure" SSL connections and transfers.  All
  SSL connections are attempted to be made secure by using the CA certificate
  bundle installed by default.

`-k, --key fingerprint`
  Authenticate using the SSH key described by `fingerprint`.  The key must
  either be in `~/.ssh` or loaded in the SSH agent via `ssh-add`.

`--role=ROLE,ROLE,...`
  Specify which roles to assume for the request.

`--user user`
  Authenticate as user under account.

`-u, --url url`
  Manta base URL (such as `https://us-central.manta.mnx.io`).

`-v, --verbose`
  Print debug output to stderr.  Repeat option to increase verbosity.

COMMANDS
--------

The following commands and options are supported:

### create [OPTIONS...] PATH ###

Creates a multipart upload, that, when committed, will be exposed as a Manta
object at PATH.  When this command completes successfully, it prints a
multipart upload UUID to stdout.  You should save this UUID for use in other
commands.

For example, if you wanted to create a multipart upload for which the target
object will be stored at ~~/stor/foo.txt, you would run:

    $ mmpu create ~~/stor/foo.txt

Since objects created through the multipart upload API should be
indistinguishable from objects created through a normal Manta PUT, the `create`
command supports similar options that you might use for `mput`.  For example,
to create a multipart upload that has 3 copies of the target object, and stores
some additional headers on the target object metadata, you would run:

    $ mmpu create ~~/stor/foo.txt -c 3 -H 'content-type: text/plain' \
                                       -H 'access-control-allow-origin: *'

You may also add additional data integrity checks that will be validated
for your target object when you commit your upload.  For example, if you want
to verify that your target object ~~/stor/foo.txt is 15728640 bytes and has
the content-md5 value "FLFyNOI3UFQhtkkrjXV1Bw==", you would run:

    $ mmpu create ~~/stor/foo.txt -s 15728650 \
                                  -m 'FLFyNOI3UFQhtkkrjXV1Bw=='

The following options are supported on `create`:

`-c, --copies num_copies`
  Specify the number of copies of the target object to store.

`-H, --header header`
  Specify an HTTP header to store in the target object's metadata.  As with all
  Manta objects, you may store up to 4 KB of headers on the target object.

`-m, --md5 md5`
  Validate the `content-md5` of the target object against the given md5 string.
  If the MD5 of the target object differs from the provided MD5 when the object
  is committed, the commit will fail.

  Note that the behavior of this option differs from the similar option for
  `mput`.

`-s, --size size`
  Validate the size of the target object against `size`.  If the size of the
  target object differs from this size when the object is committed, the commit
  will fail.

### upload [-f file] [OPTIONS...] MPU PART_NUM ###

Uploads the contents of stdin, or from the file specified with `-f`, to the
specified part for a given upload.

Note that parts are zero-indexed.  For example, if you wanted to upload the
first part of upload be5f05d6-7daa-6869-d19b-c1f7fbcf6d8d, and the part's
contents are stored locally at ./part0.txt, you could run the following
equivalent commands:

    $ cat part0.txt | mmpu upload be5f05d6-7daa-6869-d19b-c1f7fbcf6d8d 0

Or:

    $ mmpu upload -f part0.txt be5f05d6-7daa-6869-d19b-c1f7fbcf6d8d 0

When this command completes successfully, it prints the etag of the part
that was uploaded to stdout.  You should save this etag to use when committing
the upload.

The following options are supported on `upload`:

`-f, --file file`
  Upload the contents of `file` as the part, instead of the contents of stdin.

`--progress`
  Force the progress bar to draw, even when stderr is redirected.

`-q, --quiet`
  Do not display a progress meter.

### commit MPU [ETAG...] ###

Commits a given upload with the parts specified.  The parts are represented by
their position in the argument list, which indicates their part number (with
part 0 being the first argument after the upload ID, the second part the next
argument after that, and so on), and their contents are represented by their
etag.  If the etag provided for a part does not match the etag of the part when
the commit process fetches its metadata, an error will be returned.

For example, if you want to commit an upload with id
be5f05d6-7daa-6869-d19b-c1f7fbcf6d8d and the following parts:
    part 0: etag f14a41dc-7d28-6fdb-e07c-d54c0adcdf35
    part 1: etag e2893e52-9ba3-64fe-eec9-b4663835ad01
    part 2: etag 73b44fa7-fbd3-efea-b7d0-cd8098e1d928

You would run:
    $ mmpu commit be5f05d6-7daa-6869-d19b-c1f7fbcf6d8d \
                  f14a41dc-7d28-6fdb-e07c-d54c0adcdf35 \
                  e2893e52-9ba3-64fe-eec9-b4663835ad01 \
                  73b44fa7-fbd3-efea-b7d0-cd8098e1d928

The multipart upload API does not require that you commit all parts uploaded,
as long as zero or more consecutive parts are committed, and all parts meet
part size restraints.  So the following commands committing the same upload as
above are also valid, but would create a different target object than the
first example.

This command would commit a zero-byte target object:
    $ mmpu commit be5f05d6-7daa-6869-d19b-c1f7fbcf6d8d

This would create an object consisting of only the first two parts:
    $ mmpu commit be5f05d6-7daa-6869-d19b-c1f7fbcf6d8d \
                  f14a41dc-7d28-6fdb-e07c-d54c0adcdf35 \
                  e2893e52-9ba3-64fe-eec9-b4663835ad01

Once the commit process has begun for a given MPU, it cannot be aborted, or
committed with a different set of parts than it was initially committed with,
but you may retry the commit if needed.

To see the current status of an upload, use the `get` command.

### abort MPU ###

Aborts a multipart upload.

Once an upload has begun aborting, it may not be committed, but you may retry
the abort operation if needed.  To see the current status of an upload, use the
`get` command.

### get MPU ###

Fetches a JSON blob information about an upload, including its status: created,
finalizing, or done (committed or aborted).  A finalizing upload is one
that began the process of being committed or aborted, but has not finished,
either because the request is still in progress or because the request failed.

### list ###

Lists all multipart uploads for a user (note, this can also be done with a
normal `mfind` call).  Note that these uploads may be in any state; their
presence merely indicates they have not been garbage collected yet.

If you wish to list all parts that have been uploaded as well, you can run:

    $ mmpu list -p

To see the parts of only one upload, you should use the `parts` command.

The following options are supported on `list`:

`-p, --includeParts`
  List parts in additional to uploads.

### parts MPU ###

Lists all parts that have been uploaded to a given multipart upload.


ENVIRONMENT
-----------

`MANTA_USER`
  In place of `-a, --account`.

`MANTA_SUBUSER`
  In place of `--user`.

`MANTA_KEY_ID`
  In place of `-k, --key`.

`MANTA_ROLE`
  In place of `--role`.

`MANTA_URL`
  In place of `-u, --url`.

`MANTA_TLS_INSECURE`
  In place of `-i, --insecure`.

The shortcut `~~` is equivalent to `/:login`
where `:login` is the account login name.

DIAGNOSTICS
-----------

When using the `-v` option, diagnostics will be sent to stderr in bunyan
output format.  As an example of tracing all information about a request,
try:

    $ mmpu create -vv ~~/stor/foo 2>&1 | bunyan

BUGS
----

DSA keys do not work when loaded via the SSH agent.

Report bugs at [Github](https://github.com/TritonDataCenter/node-manta/issues)

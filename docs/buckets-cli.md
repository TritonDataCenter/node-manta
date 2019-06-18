# Buckets CLI

This document is a proposal for the node-manta CLI for Manta buckets.

<!--
    To update the TOC:
    ./node_modules/.bin/doctoc --notitle --maxlevel 3 docs/buckets-cli.md
-->
<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Proposal](#proposal)
  - [operations](#operations)
  - [aws cli](#aws-cli)
  - [manta take 1: directory/URL-path style, re-using existing `m*` tools](#manta-take-1-directoryurl-path-style-re-using-existing-m-tools)
  - [manta take 2: separate `mbucket` tool, *not* URL-path style](#manta-take-2-separate-mbucket-tool-not-url-path-style)
  - [manta take 3: put/get files rather than stdout](#manta-take-3-putget-files-rather-than-stdout)
  - [manta take 4: require explicit full URI for remote paths](#manta-take-4-require-explicit-full-uri-for-remote-paths)
  - [Compare take 4 to the aws CLI](#compare-take-4-to-the-aws-cli)
- [Open Questions](#open-questions)
- [Out of scope questions](#out-of-scope-questions)
- [Answered Questions](#answered-questions)
- [Appendices](#appendices)
  - [Appendix A: "manta:" URI](#appendix-a-manta-uri)
  - [Appendix B: An aside on `aws s3api`](#appendix-b-an-aside-on-aws-s3api)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

# Proposal

## operations

From [RFD 155](https://github.com/joyent/rfd/blob/master/rfd/0155/README.md) the
operations for buckets are:

1. create bucket
2. list buckets
3. delete bucket
4. head bucket
5. list objects
6. head object
7. put object(s)
8. get object(s)
9. delete object(s)


## aws cli

Here is what those operations look like using the `aws s3` CLI:

    aws s3 mb s3://mybucket --region REGION               # 1. create bucket
    aws s3 ls [s3://]                                     # 2. list buckets
    aws s3 rb [--force] s3://mybucket                     # 3. delete bucket
    aws s3api head-bucket --bucket=mybucket               # 4. head bucket
    aws s3 ls s3://mybucket[/foo.txt]                     # 5. list objects
    aws s3api head-object --bucket=mybucket --key=foo.txt # 6. head object
    aws s3 cp foo.txt s3://mybucket/foo.txt               # 7. put object(s)
    aws s3 cp s3://mybucket/foo.txt foo.txt               # 8. get object(s)
    aws s3 rm s3://mybucket[/foo.txt]                     # 9. delete object(s)


## manta take 1: directory/URL-path style, re-using existing `m*` tools

A first mapping of the Buckets API onto existing `m*` tools in node-manta
might look like:

    mmkdir ~~/buckets/mybucket                            # 1. create bucket
    mls ~~/buckets                                        # 2. list buckets
    mrm ~~/buckets/mybucket                               # 3. delete bucket
    minfo ~~/buckets/mybucket                             # 4. head bucket
    mls ~~/buckets/mybucket/objects[/PREFIX]              # 5. list objects
    minfo ~~/buckets/mybucket/objects/foo.txt             # 6. head object
    mput -f foo.txt ~~/buckets/mybucket/objects/foo.txt   # 7. put object(s)
    mget -o foo.txt ~~/buckets/mybucket/objects/foo.txt   # 8. get object(s)
    mrm ~~/buckets/mybucket/objects/foo.txt               # 9. delete object(s)

Cons:
- I don't love that it persists the idea of a directory hierarchy that isn't
  quite the correct metaphor for buckets objects. Under `~~/stor` it is about
  directories. Under `~~/buckets` it is about object *prefix*.
- Repetition of the "objects/" path in the API and, to a lesser degree,
  "~~/buckets", is tiresome.


## manta take 2: separate `mbucket` tool, *not* URL-path style

Say we drop the metaphor mapping API URL-path and directory, and add a new
`mbucket` command. It might look like the following. Here I have intentionally
separated the commands for deleting a bucket (`rb`) and objects (`rm`) -- for
clarity, somewhat for scripting safety, and to match the S3 CLI.

    mbucket mb trentm/mybucket                      # 1. create bucket
    mbucket ls                                      # 2. list buckets
    mbucket rb trentm/mybucket                      # 3. delete bucket
    mbucket info trentm/mybucket                    # 4. head bucket
    mbucket ls trentm/mybucket [foo.txt]            # 5. list objects
    mbucket info trentm/mybucket [foo.txt]]         # 6. head object
    mbucket put -f foo.txt trentm/mybucket foo.txt  # 7. put object(s)
    mbucket get -o foo.txt trentm/mybucket foo.txt  # 8. get object(s)
    mbucket rm trentm/mybucket [foo.txt]            # 9. delete object(s)

We could default to assuming the current `$MANTA_USER`, such that
"trentm/mybucket" in the above examples could be just "mybucket". Also, if
referring to buckets other than those owned by my account is not something we
care to support, then the "trentm/" scope isn't necessary.


## manta take 3: put/get files rather than stdout

One thing the `aws s3` CLI does for put/get (its `cp`) is to default to
using **file paths rather than stdout**, e.g.:

    aws s3 cp foo.txt s3://mybucket/foo.txt
    aws s3 cp s3://mybucket/foo.txt foo.txt

Using stdout in the S3 CLI is still available via the typical `-`:

    cat foo.txt | aws s3 cp - s3://mybucket/foo.txt
    aws s3 cp s3://mybucket/foo.txt - > foo.txt

With the current `mget` and `mput`, the default is streaming stdout:

    cat foo.txt | mput ~~/mybucket/foo.txt
    mget ~~/mybucket/foo.txt > foo.txt

or:

    mput -f foo.txt ~~/mybucket/foo.txt
    mget -o foo.txt ~~/mybucket/foo.txt


A benefit I see to defaulting to *file paths* rather than stdout is that
recursive file opertions fit in more naturally, e.g.:

    aws s3 cp --recursive ./mydir/ s3://mybucket/mydir/

Personally, I find the bias to file paths more natural, and streaming
from/to stdout to be the special case. It is what `cp`, `ls`, `rm`, `mv`,
`rsync`, `diff`, etc. do. On the "streaming by default" side there are `cat`,
`tee`, `curl`, etc. Perhaps it is just a `cat`-people vs dog people kind of
thing?

A manta buckets version of this could be:

    mbucket mb mybucket                             # 1. create bucket
    mbucket ls                                      # 2. list buckets
    mbucket rb mybucket                             # 3. delete bucket
    mbucket info mybucket                           # 4. head bucket
    mbucket ls mybucket/[foo.txt]                   # 5. list objects
    mbucket info mybucket/[/foo.txt]                # 6. head object
    mbucket put foo.txt mybucket/foo.txt            # 7. put object(s)
    mbucket get mybucket/foo.txt foo.txt            # 8. get object(s)
    mbucket rm mybucket/[foo.txt]                   # 9. delete object(s)


## manta take 4: require explicit full URI for remote paths

Above, we need separate `put` and `get` commands to know which argument is
local and which remote. The S3 API requires an explicit "s3://" URL for all
remote paths, e.g.:

    aws s3 mb s3://mybucket
    aws s3 cp foo.txt s3://mybucket
    aws s3 cp s3://mybucket/foo.txt foo.txt

What might that look like for Manta?

    mbucket mb manta://us-east.manta.joyent.com/trentm/mybucket
    mbucket cp foo.txt manta://us-east.manta.joyent.com/trentm/mybucket
    mbucket cp manta://us-east.manta.joyent.com/trentm/mybucket/foo.txt foo.txt

ZOMG, I'm not typing that everytime! See the ["manta:" URI](#manta-uri) section
for how we can make that shorter. tl;dr:

    mbucket mb manta:mybucket
    mbucket cp foo.txt manta:mybucket
    mbucket cp manta:mybucket/foo.txt foo.txt

That is quite the change from current node-manta usage. Why might we consider
this? Just replacing `put` and `get` commands with a single `cp` command isn't
*that* compelling by itself. The benefits I see are:

- Explicitness: It is very clear in all the commands when an argument is
  remote and when it is local. To those learning node-manta, it isn't always
  as clear.

  Implementation-wise, the explicitness might help avoid CLI inconsistencies
  where a relative remote path works for some commands, but not others:

        $ mls tmp/foo.txt
        foo.txt

        $ mput -f foo.txt tmp/foo.txt
        path required
        usage: mput [OPTIONS] path...

- It allows for eventual natural spelling of remote-to-remote move, copy, and
  sync:

        aws s3 mv s3://mybucket/foo.txt s3://mybucket/bar.txt
        aws s3 cp s3://mybucket/foo.txt s3://mybucket/bar.txt
        aws s3 sync s3://mybucket/foo.txt s3://mybucket/bar.txt

        mbucket mv manta:mybucket/foo.txt manta:mybucket/bar.txt
        mbucket cp manta:mybucket/foo.txt manta:mybucket/bar.txt
        mbucket sync manta:mybucket/foo.txt manta:mybucket/bar.txt

  If you've used the great
  [manta-sync](https://github.com/bahamas10/node-manta-sync), one of the CLI
  things I need to look up everytime is how to do local-to-remote vs
  remote-to-local. From `manta-sync --help` output:

        manta-sync ./ ~~/stor/foo
            - sync all files in your cwd to the dir ~~/stor/foo

        manta-sync -r ~~/stor/foo ./bar
            - sync all files from manta in ~~/stor/foo to the local dir ./bar

  A change to an explicit "manta:" URI for remote paths would allow a syntax
  that better mirrors rsync. From `man rsync`:

        Pull: rsync [OPTION...] [USER@]HOST:SRC... [DEST]
        Push: rsync [OPTION...] SRC... [USER@]HOST:DEST

- The cp/mv/rm command semantics map well to the familiar local filesystem
  commands.

- It keeps the door open to reasonable compat with the s3 CLI.

Cons:

- The explicit "manta:" is a little bit more to type.
- It is a departure in style for those used to `mput` and `mget`.


The nine ops would now look like:

    mbucket mb manta:mybucket                       # 1. create bucket
    mbucket ls                                      # 2. list buckets
    mbucket rb manta:mybucket                       # 3. delete bucket
    mbucket info manta:mybucket                     # 4. head bucket
    mbucket ls manta:mybucket/[foo.txt]             # 5. list objects
    mbucket info manta:mybucket/[/foo.txt]          # 6. head object
    mbucket cp foo.txt manta:mybucket/foo.txt       # 7. put object(s)
    mbucket cp manta:mybucket/foo.txt foo.txt       # 8. get object(s)
    mbucket rm manta:mybucket/[foo.txt]             # 9. delete object(s)


## Compare take 4 to the aws CLI

Take 4 and the S3 CLI are very similar, which I don't think is a bad thing.
(I've elided the less important `info` commands.)

    mbucket mb manta:mybucket                       # 1. create bucket
    mbucket ls                                      # 2. list buckets
    mbucket rb manta:mybucket                       # 3. delete bucket
    mbucket ls manta:mybucket/[foo.txt]             # 5. list objects
    mbucket cp foo.txt manta:mybucket/foo.txt       # 7. put object(s)
    mbucket cp manta:mybucket/foo.txt foo.txt       # 8. get object(s)
    mbucket rm manta:mybucket/[foo.txt]             # 9. delete object(s)

    aws s3 mb s3://mybucket --region REGION         # 1. create bucket
    aws s3 ls [s3://]                               # 2. list buckets
    aws s3 rb [--force] s3://mybucket               # 3. delete bucket
    aws s3 ls s3://mybucket[/foo.txt]               # 5. list objects
    aws s3 cp foo.txt s3://mybucket/foo.txt         # 7. put object(s)
    aws s3 cp s3://mybucket/foo.txt foo.txt         # 8. get object(s)
    aws s3 rm s3://mybucket[/foo.txt]               # 9. delete object(s)

## Next Steps

- Get thoughts from others.
- Write a prototype of this in the node-manta "buckets" branch to play with.


# Open Questions

- Lots to discuss in the "Proposal" section above.
- Support `sign` (The S3 CLI calls it "presign") for buckets?

# Out of scope questions

This section includes questions I have about buckets and the node-manta CLI,
but are likely out of scope for initial CLI work.

- Support client-side encryption (CSE)?
- Support a "wait" like `aws s3api wait ...` (see Appendix B)?
- Support remote-to-remote cp? E.g. copying an object from one name to another
  within the same bucket? Across buckets? Across accounts? Across regions?
  Does S3 support this across regions?
- Support recursive cp? recursive rm?
- Support `mv`?
- Support S3-like object tagging?
- Support S3-like object versioning? I'm assuming not.

# Answered Questions

None yet. :)



# Appendices


<a name="manta-uri"/>

## Appendix A: "manta:" URI

S3 buckets are globally unique, so they can build a unique URI like
`s3://some-bucket/an/object/key.txt`. Manta buckets are unique with
`(<manta url>, <account login>, <bucket name>)`, so all three need to be
included in a *full* URI of some sort, e.g.:

    manta://<manta url>/<account login>/<bucket name>[/<prefix or key>]
            HOST                     LOGIN  BUCKET   KEY
            ------------------------ ------ -------  -------
    manta://us-east.manta.joyent.com/trentm/mybucket/foo.txt

That's obviously too unwieldy to use commonly on the CLI. However we can
use short forms per RFC 3986 URIs:

- First, the `MANTA_URL` in the environment means we can elide the host
  part (called the "authority" in RFC 3986):

        manta:///trentm/mybucket/foo.txt
        manta:/trentm/mybucket/foo.txt

- We could define a default base URI of `manta://$MANTA_URL/$MANTA_USER`
  (similar to `~~` for other `m*` tools defaulting to path `/$MANTA_USER`):

        manta:mybucket/foo.txt

The following would be equivalent:

    manta://us-east.manta.joyent.com/trentm/mybucket/foo.txt
    manta:///trentm/mybucket/foo.txt
    manta:/trentm/mybucket/foo.txt
    manta:mybucket/foo.txt

This "manta:" URI scheme supports referring (should we need) to another
account's bucket in the same Manta region:

    manta:/bob/somebucket/bar.txt

and a bucket in another region:

    manta://manta.staging.joyent.us/nightly/nightly-1-logs/sapi/2019/01/01/00/08440fb0-62dd-4e48-b752-b1223e7d4bdd.log

should we ever want to support cross-region bucket object copying (e.g. within
the same cloud/UFDS).


## Appendix B: An aside on `aws s3api`

    aws s3api head-bucket --bucket=mybucket               # 4. head bucket
    aws s3api head-object --bucket=mybucket --key=foo.txt # 6. head object

An interesting thing from the aws CLI is the separate `aws s3api ...` set
of commands. These appear (to me) to be all the raw S3 API primitives.
`aws s3 ...` is the separated set of more *commonly* used functionality
with sugar. The rarer "head bucket" and "head object" live there. There are
some other interesting tidbits in there that we might include, e.g.:

    aws s3api wait bucket-exists --bucket trentm-play

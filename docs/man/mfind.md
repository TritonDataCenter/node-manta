mfind 1 "July 2016" Manta "Manta Commands"
=======================================

NAME
----

mfind - search for objects in a directory hierarchy.

SYNOPSIS
--------

`mfind` [OPTION...] PATH...

DESCRIPTION
-----------

The mfind utility recursively descends the directory tree for each path listed,
listing names that are the specified `type` (or all if none is specified).

Unlike GNU/BSD find, `mfind` is not yet sophisticated enough to support full
`expression` matching, but does (currently) allow a `--name` option that
supports Regular Expression matching.

With the `--json` option a stream of JSON objects is printed. Each JSON object
contains the fields from the Manta [ListDirectory API
endpoint](https://apidocs.joyent.com/manta/api.html#ListDirectory), plus the
following client-side added fields:

- `depth`: An integer directory depth under the given directory,
  starting from 0.
- `parent`: The full directory path of the entry.


EXAMPLES
--------

    $ mfind -t o -n '.+.log$' ~~/stor/logs/foo/2013/04/29
    ~~/stor/logs/foo/2013/04/29/00/gandalf.log
    /$USER/stor/logs/foo/2013/04/29/00/frodo.log
    ~~/stor/logs/foo/2013/04/29/01/sam.log
    /$USER/stor/logs/foo/2013/04/29/01/aragorn.log

OPTIONS
-------

`-a, --account login`
  Authenticate as account (login name).

`-h, --help`
  Print a help message and exit.

`-i, --insecure`
  This option explicitly allows "insecure" SSL connections and transfers.  All
  SSL connections are attempted to be made secure by using the CA certificate
  bundle installed by default.

`-j, --json`
  Output a newline-separated JSON stream of find results.

`-k, --key fingerprint`
  Authenticate using the SSH key described by FINGERPRINT.  The key must
  either be in `~/.ssh` or loaded in the SSH agent via `ssh-add`.

`-l, --limit`
  Limit number of entries returned per request.

`-n, --name regexp`
  Only return entries that have a name matching RegExp.  RegExp is a
  Javascript Regular Expression.

`-p, --parallel NUM`
  Limit concurrent operations to NUM.  Default is 50.

`-s, --size SIZE`
  Only list objects that are greater than SIZE bytes.

`-t, --type type`
  Specify `d` for directories, and `o` for objects.  If specified, only names of
  that type will be returned.

`--maxdepth`
  Only print items items less than this depth

`--mindepth`
  Only print items with at least this depth

`--role=ROLE,ROLE,...`
  Specify which roles to assume for the request.

`--user user`
  Authenticate as user under account.

`-u, --url url`
  Manta base URL (such as `https://manta.us-east.joyent.com`).

`-v, --verbose`
  Print debug output to stderr.  Repeat option to increase verbosity.

ENVIRONMENT
-----------
`MANTA_USER`
  In place of `-a, --account`

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

    $ mfind -vv ~~/stor 2>&1 | bunyan

BUGS
----

DSA keys do not work when loaded via the SSH agent.

Report bugs at [Github](https://github.com/joyent/node-manta/issues)

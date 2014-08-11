mls 1 "May 2013" Manta "Manta Commands"
=======================================

NAME
----

mls - list directory contents.

SYNOPSIS
--------

`mls` [OPTION...] [FILE]...

DESCRIPTION
-----------

List information about the FILEs (`/:login/stor` by default, where `:login` is
either the login specified by `-a` or `$MANTA_ACCOUNT`).  Entries are sorted by
creation time.  Note that `directories` will appear to have a trailing `/` after
them, while objects will be just the name (unless `-l` is specified).

EXAMPLES
--------

    $ mls ~~/stor
    foo
    home/
    README.md
    tmp/

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
  Output records in JSON, as opposed to human readable form.

`-k, --key fingerprint`
  Authenticate using the SSH key described by FINGERPRINT.  The key must
  either be in `~/.ssh` or loaded in the SSH agent via `ssh-add`.

`-l, --long`
  Use a long listing format. Note that as Manta does not have group information,
  this is like `ls -o`, not `ls -l`, in a traditional shell.

`-m, --marker name`
  Start listing at name NAME.  Useful to paginate through large listings.

`-r, --reverse`
  reverse order while sorting

`--role=ROLE,ROLE,...`
  Specify which roles to assume for the request.

`-t, --time`
  sort by modification time, newest first

`--user user`
  Authenticate as user under account.

`-u, --url url`
  Manta base URL (such as `https://manta.us-east.joyent.com`).

`-v, --verbose`
  Print debug output to stderr.  Repeat option to increase verbosity.

ENVIRONMENT
-----------

`MANTA_ACCOUNT`
  In place of `-a, --account`

`MANTA_USER`
  In place of `--user`.

`MANTA_KEY_ID`
  In place of `-k, --key`.

`MANTA_ROLE`
  In place of `--role`.

`MANTA_URL`
  In place of `-u, --url`.

`MANTA_TLS_INSECURE`
  In place of `-i, --insecure`.

DIAGNOSTICS
-----------

When using the `-v` option, diagnostics will be sent to stderr in bunyan
output format.  As an example of tracing all information about a request,
try:

    $ mls -vv ~~/stor 2>&1 | bunyan

BUGS
----

DSA keys do not work when loaded via the SSH agent.

Report bugs at [Github](https://github.com/joyent/node-manta/issues)

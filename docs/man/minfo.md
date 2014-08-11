minfo 1 "May 2013" Manta "Manta Commands"
=======================================

NAME
----

minfo - show HTTP headers for a Manta object

SYNOPSIS
--------

`minfo` [OPTION...] PATH...

DESCRIPTION
-----------

Retrieves the HTTP headers of object(s) specified by PATH(s), and dumps them to
stdout.  Note that minfo does not download any content; use `mget` for that.

EXAMPLES
--------

Retrieves HTTP headers for the given object.

    $ minfo ~~/stor/README.md

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

`-k, --key fingerprint`
  Authenticate using the SSH key described by FINGERPRINT.  The key must
  either be in `~/.ssh` or loaded in the SSH agent via `ssh-add`.

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

`MANTA_ACCOUNT`
  In place of `-a, --account`

`MANTA_USER`
  In place of `--user`

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

    $ minfo -vv ~~/stor/foo 2>&1 | bunyan

BUGS
----

DSA keys do not work when loaded via the SSH agent.

Report bugs at [Github](https://github.com/joyent/node-manta/issues)

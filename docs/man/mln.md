mln 1 "May 2013" Manta "Manta Commands"
=======================================

NAME
----

mln - make link between objects

SYNOPSIS
--------

`mln` [OPTION...] TARGET LINK_NAME

DESCRIPTION
-----------

mln creates a link to TARGET with the name LINK_NAME.  Links in Manta are
allowed to be created by pointing at an object only, and are semantically
different than a UNIX link (both hard and soft).  Links in Manta are essentially
a "snapshot".  That is given object `A` and a link `B` to `A`, when `A` is
overwritten to be `A'`, `B` will still return the original value of `A`.

EXAMPLES
--------

Creates a link from README that snapshots the contents of README.md.

    $ mln ~~/stor/README.md ~~/stor/README

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

`--role-tag=ROLE,ROLE,...`
  Set the role tags on the created link.

`--user user`
  Authenticate as user under account.

`-u, --url url`
  Manta base URL (such as `https://us-central.manta.mnx.io`).

`-v, --verbose`
  Print debug output to stderr.  Repeat option to increase verbosity.

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

    $ mln -vv ~~/stor/foo 2>&1 | bunyan

BUGS
----

DSA keys do not work when loaded via the SSH agent.

Report bugs at [Github](https://github.com/TritonDataCenter/node-manta/issues)

mchmod 1 "August 2014" Manta "Manta Commands"
=======================================

NAME
----

mchmod - change object role tags

SYNOPSIS
--------

`mchmod` [+-=]ROLE,... OBJECT
`mchmod` [OPTION...] -- [+-=]ROLE,... OBJECT


DESCRIPTION
-----------

mchmod sets the role tags on an object or directory. Role tags are used to
determine which of a user's roles will be checked to allow access.

Note that in order to use `mchmod +ROLE` or `mchmode -ROLE` you will need access
to read and write object metadata. Using `mchmod =ROLE` only requires write
access.

EXAMPLES
--------

    $ mchmod +read ~~/stor/foo.txt

    $ mchmod -read,write ~~/stor/foo.txt

    $ mchmod -a other_account -- =read ~~/stor/foot.txt


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

`--role`
  Specify which roles to assume for the request.

`-u, --url url`
  Manta base URL (such as `https://manta.us-east.joyent.com`).

`--user user`
  Authenticate as user under account.

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

`MANTA_URL`
  In place of `-u, --url`.

`MANTA_TLS_INSECURE`
  In place of `-i, --insecure`.

`MANTA_ROLE`
  In place of `--role`.

DIAGNOSTICS
-----------

When using the `-v` option, diagnostics will be sent to stderr in bunyan
output format.  As an example of tracing all information about a request,
try:

    $ mchmod -v ~~/stor/foo 2>&1 | bunyan

BUGS
----

DSA keys do not work when loaded via the SSH agent.

Report bugs at [Github](https://github.com/joyent/node-manta/issues)

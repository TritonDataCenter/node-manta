mput 1 "May 2013" Manta "Manta Commands"
=======================================

NAME
----

mchattr - change object attributes

SYNOPSIS
--------

`mchattr` [OPTION...] OBJECT

DESCRIPTION
-----------

mchattr changes attributes of an object.  Running mchattr only changes metadata
about the object (i.e., HTTP headers).  Running mchattr completely replaces all
modifiable HTTP headers, so you must specify the complete set upon running.

Note you are not permitted to update "core" headers, such as `durability-level`,
`content-length`, and `content-md5`.  You can update `content-type`, `m-*` and
CORS headers.

EXAMPLES
--------

    $ mchattr -H m-foo:bar ~~/stor/foo.txt

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

`-H, --header`
  Set the specified HTTP header.

`-k, --key fingerprint`
  Authenticate using the SSH key described by FINGERPRINT.  The key must
  either be in `~/.ssh` or loaded in the SSH agent via `ssh-add`.

`-u, --url url`
  Manta base URL (such as `https://manta.us-east.joyent.com`).

`-v, --verbose`
  Print debug output to stderr.  Repeat option to increase verbosity.

ENVIRONMENT
-----------

`MANTA_USER`
  In place of `-a, --account`

`MANTA_KEY_ID`
  In place of `-k, --key`.

`MANTA_URL`
  In place of `-u, --url`.

`MANTA_TLS_INSECURE`
  In place of `-i, --insecure`.

DIAGNOSTICS
-----------

When using the `-v` option, diagnostics will be sent to stderr in bunyan
output format.  As an example of tracing all information about a request,
try:

    $ mchattr -v ~~/stor/foo 2>&1 | bunyan

BUGS
----

DSA keys do not work when loaded via the SSH agent.

Report bugs at [Github](https://github.com/joyent/node-manta/issues)

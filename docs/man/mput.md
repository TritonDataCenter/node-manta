mput 1 "May 2013" Manta "Manta Commands"
=======================================

NAME
----

mput - create an object

SYNOPSIS
--------

`mput` [OPTION...] OBJECT

DESCRIPTION
-----------

mput creates an object specified at the name OBJECT with the contents either
coming from stdin, or from the file specified with `-f`.  mput will attempt to
set the HTTP Content-Type based on the extension on the object, unless
Content-Type is specified as an HTTP header.  If mput cannot determine the type
based on the extension the default content-type is usually
`application/octet-stream`, but this can be overriden by setting the environment
variable `MANTA_DEFAULT_CONTENT_TYPE` (or passing `-H`).

By default, mput creates two copies of an object; this can be overridden with
`-c`.  Lastly, mput also draws a progress meter by default; this can be disabled
with `-q`.

EXAMPLES
--------

Create an object with the contents of foo.txt.  Content-type will be text/plain.

    $ mput -f ./foo.txt /$MANTA_USER/stor/foo.txt

Create the same object from stdin, and set content-type.

    $ cat ./foo.txt | mput -H 'content-type: text/plain' /$MANTA_USER/stor/foo.txt

Create the same object, set CORS header, and create 3 copies, with no progress bar:

    $ cat ./foo.txt | mput -H 'content-type: text/plain' \
                           -H 'access-control-allow-origin: *' \
                           -c 3 -q \
                           /$MANTA_USER/stor/foo.txt

OPTIONS
-------

`-a, --account login`
  Authenticate as account (login name).

`-c, --copies file`
  Create COPIES copies as a replication factor (default 2).

`-f, --file file`
  Create contents of object from file.

`-h, --help`
  Print a help message and exit.

`-i, --insecure`
  This option explicitly allows "insecure" SSL connections and transfers.  All
  SSL connections are attempted to be made secure by using the CA certificate
  bundle installed by default.

`-k, --key fingerprint`
  Authenticate using the SSH key described by FINGERPRINT.  The key must
  either be in `~/.ssh` or loaded in the SSH agent via `ssh-add`.

`-m, --md5`
  When using `--file`, this switch instructs mput to first compute the MD5 of
  the file and send it in `content-md5`.

`-q, --quiet`
  Do not display a progress meter.

`--role=ROLE,ROLE,...`
  Specify which roles to assume for the request.

`--role-tag=ROLE,ROLE,...`
  Set the role tags on the created object.

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

    $ mput -vv /$MANTA_USER/stor/foo 2>&1 | bunyan

BUGS
----

DSA keys do not work when loaded via the SSH agent.

Report bugs at [Github](https://github.com/joyent/node-manta/issues)

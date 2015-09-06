msign 1 "May 2013" Manta "Manta Commands"
=======================================

NAME
----

msign - create a signed URL to a Manta object

SYNOPSIS
--------

`msign` [OPTION...] OBJECT...

DESCRIPTION
-----------

msign takes a list of objects (or directories), and using the credentials from
the environment (whether environment variables or command line switches) creates
time-expiring URLs that can be shared with others.  This is useful to generate
HTML links, for example.

The default expiration for URLs is 1 hour from `now`, but this can be changed
with the `expires` option - see `EXPIRATION` below.

EXAMPLES
--------

Generate a signed URL that expires in 5 seconds:

    $ msign -e 5s ~~/stor/tmp

Generate a signed URL that expires in 5 minutes:

    $ msign -e 5m ~~/stor/tmp

Generate a signed URL that expires in 5 hours:

    $ msign -e 5h ~~/stor/tmp

Generate a signed URL that expires in 5 days:

    $ msign -e 5d ~~/stor/tmp

Generate a signed URL that expires in 5 weeks:

    $ msign -e 5w ~~/stor/tmp

Generate a signed URL that expires in 5 years:

    $ msign -e 5y ~~/stor/tmp

Generate a signed URL that expires at Wed Jan 20 20:42:01 UTC 2016:

    $ msign -e 1453322521 ~~/stor/tmp

OPTIONS
-------

`-a, --account login`
  Authenticate as account (login name).

`-e, --expires expiration`
  Expiration time in a relative form or seconds since epoch - see `EXPIRATION`
  below for a more detailed explanation. Default is 1 hour from `now`.

`-h, --help`
  Print a help message and exit.

`-i, --insecure`
  This option explicitly allows "insecure" SSL connections and transfers.  All
  SSL connections are attempted to be made secure by using the CA certificate
  bundle installed by default.

`-k, --key fingerprint`
  Authenticate using the SSH key described by FINGERPRINT.  The key must
  either be in `~/.ssh` or loaded in the SSH agent via `ssh-add`.

`-m, --method http_method`
  Allow URL to work for the HTTP method specified (default is GET).

`--role=ROLE,ROLE,...`
  Specify which roles to assume for the request.

`--role-tag=ROLE,ROLE,...`
  Set the role tags on objects created with the signed URL.

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

EXPIRATION
----------

The `-e` argument can be given in multiple forms.  If just a number is given,
it will be used as the seconds since epoch.  If a number followed by a valid
modifier character is given it will be used as a relative date.  Valid
modifiers are:

`s`
  Seconds from now

`m`
  Minutes from now

`h`
  Hours from now

`d`
  Days from now

`w`
  Weeks from now

`y`
  Years from now

DIAGNOSTICS
-----------

When using the `-v` option, diagnostics will be sent to stderr in bunyan
output format.  As an example of tracing all information about a request,
try:

    $ msign -vv ~~/stor/foo 2>&1 | bunyan

BUGS
----

DSA keys do not work when loaded via the SSH agent.

Report bugs at [Github](https://github.com/joyent/node-manta/issues)

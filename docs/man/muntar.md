muntar 1 "May 2013" Manta "Manta Commands"
=======================================

NAME
----

muntar - create a directory hierarchy from a tar file

SYNOPSIS
--------

`muntar` -f tarfile [OPTION...] PATH...

DESCRIPTION
-----------

The muntar utility extracts the contents of a tar file and creates
the corresponding objects in the path specified. If the destination
directories do not exist, they are created.


EXAMPLES
--------

	$ muntar -f shakespeare.tar  /$MANTA_USER/stor/plays/shakespeare
	/$MANTA_USER/stor/plays/shakespeare/README
	/$MANTA_USER/stor/plays/shakespeare/comedies/cymbeline
	/$MANTA_USER/stor/plays/shakespeare/glossary
	. . .
	/$MANTA_USER/stor/plays/shakespeare/comedies/merrywivesofwindsor
	/$MANTA_USER/stor/plays/shakespeare/poetry/rapeoflucrece
	/$MANTA_USER/stor/plays/shakespeare/poetry/various
	/$MANTA_USER/stor/plays/shakespeare/poetry/sonnets

If the tarball is compressed, you can store it as an object and use muntar
in the compute environment.

    $ mput -f /var/tmp/backup.tar.gz /$MANTA_USER/stor/backup.tar.gz
    $ echo /$MANTA_USER/stor/backup.tar.gz | \
        mjob create -o -m gzcat -m 'muntar -f $MANTA_INPUT_FILE /$MANTA_USER/stor'



OPTIONS
-------

`-a, --account=login`
  Authenticate as account (login name).

`-c, --copies=copies`
  Number of copies to make.

`-f, --file=tarfile`
  The tar file to extract from.

`-H, --header=header`
  HTTP headers to include.

`-h, --help`
  Print a help message and exit.


`-i, --insecure`
  This option explicitly allows "insecure" SSL connections and transfers.  All
  SSL connections are attempted to be made secure by using the CA certificate
  bundle installed by default.

`-k fingerprint, --key=fingerprint`
  Authenticate using the SSH key described by FINGERPRINT.  The key must
  either be in `~/.ssh` or loaded in the SSH agent via `ssh-add`.


`-p concurrency, --parallel=oncurrency`
  Limit concurrent operations to CONCURRENCY.  Default is 20.

`-s, --size SIZE`
  Only list objects that are greater than SIZE bytes.

`-t, --type type`
  Specify `d` for directories, and `o` for objects.  If specified, only names of
  that type will be returned.

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

    $ mfind -vv /$MANTA_USER/stor 2>&1 | bunyan

BUGS
----

DSA keys do not work when loaded via the SSH agent.

Report bugs at [Github](https://github.com/joyent/node-manta/issues)

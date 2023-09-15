muntar 1 "May 2023" Manta "Manta Commands"
=======================================

NAME
----

muntar - deprecated; create a directory hierarchy from a tar file

SYNOPSIS
--------

`muntar` -f tarfile [OPTION...] PATH...

DESCRIPTION
-----------

muntar is deprecated and will be removed in a future release.

The muntar utility extracts the contents of a tar file and creates
the corresponding objects in the path specified. If the destination
directories do not exist, they are created.


EXAMPLES
--------

	$ muntar -f shakespeare.tar  ~~/stor/plays/shakespeare
	~~/stor/plays/shakespeare/README
	~~/stor/plays/shakespeare/comedies/cymbeline
	~~/stor/plays/shakespeare/glossary
	. . .
	~~/stor/plays/shakespeare/comedies/merrywivesofwindsor
	~~/stor/plays/shakespeare/poetry/rapeoflucrece
	~~/stor/plays/shakespeare/poetry/various
	~~/stor/plays/shakespeare/poetry/sonnets

If the tarball is compressed, you can store it as an object and use muntar
in the compute environment.

    $ mput -f /var/tmp/backup.tar.gz ~~/stor/backup.tar.gz
    $ echo ~~/stor/backup.tar.gz | \
        mjob create -o -m gzcat -m 'muntar -f $MANTA_INPUT_FILE ~~/stor'



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

`-p NUM, --parallel=NUM`
  Limit concurrent operations to NUM.  Default is 20.

`-t, --type type`
  Specify `d` for directories, and `o` for objects.  If specified, only names of
  that type will be returned.

`--role=ROLE,ROLE,...`
  Specify which roles to assume for the request.

`--role-tag=ROLE,ROLE,...`
  Set the role tags on created objects and directories.

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

    $ mfind -vv ~~/stor 2>&1 | bunyan

NOTES
-----


BUGS
----

DSA keys do not work when loaded via the SSH agent.

Report bugs at [Github](https://github.com/TritonDataCenter/node-manta/issues)

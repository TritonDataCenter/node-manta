muntar 1 "May 2023" Manta "Manta Commands"
=======================================

NAME
----

msync - synchronize a directory hierarchy with Manta.

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

    $ muntar ./shakespeare/ ~~/stor/plays/shakespeare
    building source file list...
    source file list built, 1222 files found
    /fbulsara/stor/plays/shakespeare/index.html... not found, adding to sync list (1/1222)
    /fbulsara/stor/plays/shakespeare/test.html... not found, adding to sync list (2/1222)
    /fbulsara/stor/plays/shakespeare/favicon.ico... not found, adding to sync list (3/1222)
    /fbulsara/stor/plays/shakespeare/news.html... not found, adding to sync list (4/1222)
    . . .
    /fbulsara/stor/plays/shakespeare/History/2kinghenryvi/2henryvi.2.3.html... synced (1221/1222)
    /fbulsara/stor/plays/shakespeare/History/2kinghenryvi/2henryvi.4.8.html... synced (1222/1222)

    1222 files (24.07 MB) synced successfully, 0 files failed to sync (took 33s 758ms)
    done

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

`-j, --just-delete`
  don't send local files, just delete extra remote files.

`-l, --ignore-links`
  ignore symlinks.

`-m, --md5`
  use md5 instead of file size (slower, but more accurate).

`-n, --dry-run`
  don't perform any remote PUT or DELETE operations.

`-p CONCURRENCY, --parallel=CONCURRENCY`
  limit concurrent operations.

`-q, --quiet`
  suppress all output.

`-r, --reverse`
  manta to local sync.

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

Unlike other commands, -v does not output bunyan logs. Instead, it will list
each file status rather than only files that are out of sync.

NOTES
-----

BUGS
----

DSA keys do not work when loaded via the SSH agent.

Report bugs at [Github](https://github.com/TritonDataCenter/node-manta/issues)

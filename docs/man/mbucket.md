# mbucket 1 "June 2019" Manta "Manta Commands"

## NAME

mbucket - work with Manta buckets and bucket objects

## SYNOPSIS

`mbucket` [GLOBAL OPTIONS...] command [command-specific arguments]

## DESCRIPTION

mbucket provides sub-commands to create, list, delete Manta buckets and
bucket objects.

For example:

    mbucket mb play
    mbucket ls
    echo hi >hi.txt
    mbucket cp hi.txt manta:play/hi.txt
    mbucket ls manta:play/

## GLOBAL OPTIONS

The following options are supported before the subcommand:

`-a, --account login`
  Authenticate as account (login name).

`-h, --help`
  Print a help message and exit.

`-i, --insecure`
  This option explicitly allows "insecure" SSL connections and transfers.  All
  SSL connections are attempted to be made secure by using the CA certificate
  bundle installed by default.

`-k, --key fingerprint`
  Authenticate using the SSH key described by `fingerprint`.  The key must
  either be in `~/.ssh` or loaded in the SSH agent via `ssh-add`.

`-p, --parallel NUM`
  Limit concurrent operations to NUM. The default varies by command. This
  applies to operations issued by mjob itself (e.g., to add inputs or poll on
  the job). It has no effect on the concurrency of the job.

`--role=ROLE,ROLE,...`
  Specify which roles to assume for the request.

`--user user`
  Authenticate as user under account.

`-u, --url url`
  Manta base URL (such as `https://manta.us-east.joyent.com`).

`-v, --verbose`
  Print debug output to stderr.  Repeat option to increase verbosity.

## COMMANDS

The following commands and options are supported:

### mbucket ls [OPTIONS...] [MANTA-URI]

When no MANTA-URI argument is given, this will list all of this account's
buckets.

```
$ mbucket ls
play
```

When a MANTA-URI argument is given, it will list objects in the bucket.

The following options are supported on `create`:

XXX


## ENVIRONMENT

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


## DIAGNOSTICS

When using the `-v` global option, trace-level logging is written to stderr
in bunyan format (`npm install -g bunyan` to install the Bunyan tool).
An example of viewing that trace logging:

    $ mbucket -v ls 2> >(bunyan)


## BUGS

DSA keys do not work when loaded via the SSH agent.

Report bugs at [Github](https://github.com/joyent/node-manta/issues)

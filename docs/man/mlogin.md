mlogin 1 "June 2013" Manta "Manta Commands"
===========================================

NAME
----

mlogin - manta interactive session client

SYNOPSIS
--------

`mlogin` [OPTION...] [OBJECT]

DESCRIPTION
-----------

`mlogin` allows you to spawn an interactive job in Manta. Once running, your
terminal will be attached to the remote process running in the job via a shell
session tunneled through HTTPS, similar in concept to SSH.

Interactive sessions are a great way to debug a new job script in-situ, or to
experience and explore the compute zone environment hands on.  It can also
become part of a workflow using interactive terminal utilities on large Manta
objects without the need to download or transfer the data -- e.g. the the use
of `mdb` (the Modular Debugger) on crash dumps and core files.

EXAMPLES
--------

The default mode of `mlogin` is to create a reduce job with no input keys.  This
job has no input data, but gets you a shell running in a Manta compute zone.

    $ mlogin
     * created interactive job
     * waiting for session... established
    user@manta # ptree $$
    91352 zsched
      2701  ./node lib/agent.js
        2715  /bin/bash --norc
          2735  ptree 2715
    user@manta # exit
     * remote process exited
     * cleaning up resources...
     * session complete

A more complicated use of `mlogin` would be crashdump analysis with `mdb`:

    $ mlogin -c 'mdb /manta/user/stor/vmcore.1' /user/stor/vmcore.1
     * created interactive job
     * waiting for session... established
    Loading modules: [ unix genunix specfs dtrace mac ]
    > ::status
    debugging crash dump /manta/user/stor/vmcore.1 (64-bit)
    operating system: 5.11 joyent_20130226T234312Z (i86pc)
    panic message:
    BAD TRAP: type=e (#pf Page fault) rp=ffffff00b8e01070 addr=7b0
    > $q
     * remote process exited
     * cleaning up resources...
     * session complete

OPTIONS
-------

The options are supported:

`-a, --account login`
  Authenticate as account (login name).

`-c, --command shell_command`
  Run `shell_command` instead of the default shell. This will be passed to
  `bash -c` inside the interactive job, and can be used to run a command
  other than the default interactive shell.  Can be especially useful when
  you provide a script or program to run via `--assets`.

`--disk disk`
  Override the OS quota, and use the specified amount of disk.
  This option is specified in gigabytes.

`-e, --escape escape_character`
  Sets the escape character for this mlogin session.  This character is
  recognised immediately following a carriage return, and allows the user
  to perform a session control function.  If the escape character is
  followed by a period (`.`), the session will end; followed by a
  question mark (`?`) prints a list of available escape characters.
  Passing `"none"` to the `-e` flag disables the escape character entirely.

`-h, --help`
  Print a help message and exit.

`--image version`
  Specifies an image version semver to use in job phases.  Must be specified as
  a semver string (default is ~1.0).

`--init command`
  Specifies a command to execute in the compute zone.  This command will be
  executed prior to starting the interactive job.  This is useful for setup,
  etc.

`-i, --insecure`
  This option explicitly allows "insecure" SSL connections and transfers.  All
  SSL connections are attempted to be made secure by using the CA certificate
  bundle installed by default.

`-k, --key fingerprint`
  Authenticate using the SSH key described by `fingerprint`.  The key must
  either be in `~/.ssh` or loaded in the SSH agent via `ssh-add`.

`--memory memory`
  Override the OS size, and use the specified amount of DRAM.
  This option is specified in megabytes.

`--role=ROLE,ROLE,...`
  Specify which roles to assume for the request.

`-s, --assets path`
  Specifies an asset to make available in the compute zone.

`--user user`
  Authenticate as user under account.

`-u, --url url`
  Manta base URL (such as `https://manta.us-east.joyent.com`).

`-v, --verbose`
  Print debug output to stderr.  Repeat option to increase verbosity.

`-q, --quiet`
  Don't print session establishment status messages.

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

BUGS
----

DSA keys do not work when loaded via the SSH agent.

Report bugs at [Github](https://github.com/joyent/node-manta/issues)

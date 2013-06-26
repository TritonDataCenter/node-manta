mjob 1 "May 2013" Manta "Manta Commands"
=======================================

NAME
----

mjob - manage manta jobs

SYNOPSIS
--------

`mjob` [OPTION...] command [command-specific arguments]

DESCRIPTION
-----------

mjob allows you to interact with jobs in Manta. Jobs allow you to specify
arbitrary compute that operates on manta objects, with Map/Reduce supported
as a first-class citizen.  Using mjob, you can create, read, monitor and cancel
jobs.

The primary reference for a job is its UUID.  Most commands operate on jobs by
UUID.

COMMON OPTIONS
--------------

The following options are supported in all commands:

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

`-p, --parallel concurrency`
  Limit concurrent operations to CONCURRENCY.  Default is 50.

`-u, --url url`
  Manta base URL (such as `https://manta.us-east.joyent.com`).

`-v, --verbose`
  Print debug output to stderr.  Repeat option to increase verbosity.

COMMANDS
--------

The following commands and options are supported:

### create [OPTIONS...] expression ###

Creates a job that executes the commands against keys that will be specified
via `addinputs`.  `expression` can specify an arbitrary UNIX pipeline, with
map/reduce *phases* separated by the `^` or `^^` character(s), respectively.

For example, to specify a simple `grep | sort | uniq` job in Manta, the
following invocation would be a likely example (note the \| to escape the
`|` character):

    $ mjob create grep foo ^^ sort \| uniq -c

This is the fastest and most common form of creating jobs, and runs with default
compute container sizes.

Alternatively, jobs can be specified by using a combination of `-m` and `-r`
flags; the same pipeline could be specified with:

    $ mjob create -m 'grep foo' -r 'sort | uniq -c'

The above form is useful for specifying options to each phase.  For example:

    $ mjob create --memory 2048 -m 'grep foo' --memory 8192 -r 'sort | uniq -c'

Overrides the amount of RAM available in each phase (the `memory`, `disk`,
`init` and `count` options impact the *next* phase).

Jobs can also be specified using a JSON manifest file, as below (see Manta
API documentation for the full JSON schema):

    $ cat job.json
    {
      "phases": [{
        "exec": "grep ..."
      }, {
        "exec": "maggr sum | sort",
        "type": "reduce"
      }]
    }
    $ mjob create -f job.json

Lastly, `mjob create` can "one line" the use of create, addinputs, watch and
get like the example below; this would print no diagnostics, and would wait
for the job to complete, then dump the output to stdout (as if you had run
`find | grep | sort | uniq` locally):

    $ mfind /$MANTA_USER/stor | mjob create -q -o grep foo ^^ sort \| uniq -c

The following options are supported on `create`:

`-b, --batch size`
  When adding inputs, add them in batches of size.

`--count num_reducers`
  Use num_reducers in the reduce phase.

`--disk disk`
  Override the OS quota, and use the specified amount of disk in the next phase.
  This option is specified in gigabytes.

`--memory memory`
  Override the OS size, and use the specified amount of DRAM in the next phase.
  This option is specified in megabytes.

`-f, --file file`
  Read job description from file.

`--image version`
  Specifies an image version semver to use in job phases.  Must be specified as
  a semver string (default is ~1.0).

`--init path`
  Specifies an asset to make available in the compute zone that runs *before*
  the exec command.  This is useful for setup, etc.

`-m, --map command`
  Specifies a map phase.

`-o, --cat-outputs`
  Wait for job to complete, then fetch and concatenate outputs.

`--open`
  When adding inputs, do not close input, but leave job open.

`-q, --quiet`
  Do not output any informative messages.

`-r, --reduce command`
  Specifies a reduce phase.

`-s, --assets path`
  Specifies an asset to make available in the compute zone.

`-w, --watch`
  Wait for job to finish (only use when adding inputs at create time).


### addinputs [-b batch] [-o] JOB... ###

The addinputs command feeds input names from stdin to a list of JobIDs,
and by default closes input when done.  For example:

    $ cat inputs.txt
    /$MANTA_USER/stor/foo
    /$MANTA_USER/stor/bar
    $ cat inputs.txt | mjob addinputs $job

`-b, --batch size`
  When adding inputs, add them in batches of size.

`-o, --open`
  When adding inputs, do not close input, but leave job open.


### get JOB... ###

Returns the `status` JSON document for a job.

    $ mjob get 3ec32136-b125-11e2-8487-1b418dd6974b


### watch JOB ###

Waits for a given job to reach the `done` state.

    $ mjob watch 3ec32136-b125-11e2-8487-1b418dd6974b


### cancel JOB... ###

Cancels a currently running job.

    $ mjob cancel 3ec32136-b125-11e2-8487-1b418dd6974b


### outputs JOB... ###

Returns the list of outputs for a job, as `\n` separated names.  Note that while
a job is specifically *not archived*, the list of names is not guaranteed to
be complete or consistent between calls (in particular when there are a large
number of outputs).  Once a job is archived, the entire set of names are read
back in a contiguous stream.

    $ mjob outputs 3ec32136-b125-11e2-8487-1b418dd6974b


### inputs JOB... ###

Returns the list of inputs for a job, as `\n` separated names.  Note that while
a job is specifically *not archived*, the list of names is not guaranteed to
be complete or consistent between calls (in particular when there are a large
number of outputs).  Once a job is archived, the entire set of names are read
back in a contiguous stream.

    $ mjob inputs 3ec32136-b125-11e2-8487-1b418dd6974b


### errors JOB... ###

Returns the list of errors for a job, as `\n` separated JSON objects.  Note that
while a job is specifically *not archived*, the list of errors is not guaranteed
to be complete or consistent between calls (in particular when there are a large
number of outputs).  Once a job is archived, the entire set of errors are read
back in a contiguous stream.

    $ mjob errors 3ec32136-b125-11e2-8487-1b418dd6974b


### failures JOB... ###

Returns the list of failed inputs for a job, as `\n` separated names.  Note that
while a job is specifically *not archived*, the list of names is not guaranteed
to be complete or consistent between calls (in particular when there are a large
number of outputs).  Once a job is archived, the entire set of names are read
back in a contiguous stream.

    $ mjob failures 3ec32136-b125-11e2-8487-1b418dd6974b


### list [-s state] ###

Lists all jobs for a user (note, this can also be done with a normal `mls`
call).  Optionally takes a `-s`, that can be used to filter down to only
`running` jobs.

    $ mjob list -s running

`-s, --state state`
  Only list jobs in the given state.


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

    $ mjob -vv /$MANTA_USER/stor/foo 2>&1 | bunyan

BUGS
----

DSA keys do not work when loaded via the SSH agent.

Report bugs at [Github](https://github.com/joyent/node-manta/issues)

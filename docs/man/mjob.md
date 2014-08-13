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
  Limit concurrent operations to CONCURRENCY.  Default is 50.  This applies to
  operations issued by mjob itself (e.g., to add inputs or poll on the job).  It
  has no effect on the concurrency of the job.

`--role=ROLE,ROLE,...`
  Specify which roles to assume for the request.

`--user user`
  Authenticate as user under account.

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

    $ mjob create --memory 2048 -m 'grep foo'
        --memory 8192 -r 'sort | uniq -c'

Overrides the amount of RAM available in each phase (the `memory`, `disk`,
`init`, `image`, and `count` options impact the *next* phase).

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

    $ mfind ~~/stor |
        mjob create -q -o grep foo ^^ sort \| uniq -c

The following options are supported on `create`:

`-b, --batch size`
  When adding inputs, add them in batches of size.

`--close`
  End the input stream once the job is created.

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
  Specifies an image version semver to use in the next job phase.  Must be
  specified as a semver string.  The default is server-provided and changes
  over time.

`--init command`
  Specifies a command to execute in the compute zone for the next map or
  reduce phase.  This command will be executed *once* per zone, and will
  run *before* the exec command for the phase.  This is useful for setup, etc.

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
  Specifies an asset to make available in the compute zone that runs in
  the next map or reduce phase.

`-w, --watch`
  Wait for job to finish (only use when adding inputs at create time).


### addinputs [-b batch] [-o] JOB... ###

The addinputs command feeds input names from stdin to a list of JobIDs,
and by default closes input when done.  For example:

    $ cat inputs.txt
    ~~/stor/foo
    ~~/stor/bar
    $ cat inputs.txt | mjob addinputs $job

`-b, --batch size`
  When adding inputs, add them in batches of size.

`-o, --open`
  When adding inputs, do not close input, but leave job open.

### close JOB ###

Closes input for a given job.

    $ mjob close 3ec32136-b125-11e2-8487-1b418dd6974b

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


### share JOB ###

Generates and uploads a self-contained HTML page that describes the job,
including its phases, the list of input and output objects, the contents of
input and output objects, error details, and so on.

**By default, this HTML page is uploaded to ~~/public/jobshares,
meaning that it will be publicly accessible.  This includes the contents of
input and output objects.**  If you just want to generate the HTML content
without uploading it, use the "-s" option and save the output to a file.

    $ mjob share 3ec32136-b125-11e2-8487-1b418dd6974b

`-r, --readme README_FILE`
  Insert the rendered contents of `README_FILE` (a Markdown file) directly into
  the generated HTML page.

`-s, --stdout`
  Emit the HTML output to stdout and do not upload it to Manta.


### list [-s state] ###

Lists all jobs for a user (note, this can also be done with a normal `mls`
call).  Optionally takes a `-s`, that can be used to filter down to only
`running` jobs.

    $ mjob list -s running

`-s, --state state`
  Only list jobs in the given state.

### cost JOB ###

Estimates the cost in USD of a job by creating a Manta job and adding as inputs
compute usage reports from /:login/reports/usage/compute. Assets are pulled from
/manta/public/jobs/jobcost. Note that usage reports are generated
asynchronously, so mjob cost may fail when estimating the cost of jobs that
were running recently.**

  $ mjob cost 3ec32136-b125-11e2-8487-1b418dd6974b

`-q, --quiet`
  Do not output any informative messages.



ENVIRONMENT
-----------

`MANTA_USER`
  In place of `-a, --account`

`MANTA_SUBUSER`
  In place of `--user`

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

    $ mjob -vv ~~/stor/foo 2>&1 | bunyan

BUGS
----

DSA keys do not work when loaded via the SSH agent.

Report bugs at [Github](https://github.com/joyent/node-manta/issues)

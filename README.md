# Manta Client Tools and SDK

[manta](http://apidocs.joyent.com/manta/nodesdk.html) is a Node.js SDK for
interacting with Joyent's Manta system.

This repository is part of the Joyent [Manta](http://github.com/joyent/manta)
project.  See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

# Installation

[Node.js](https://nodejs.org/) must be installed.

## Command line utilities

### Install Globally

To install globally (to use the CLI tools) you can try running:

    $ npm install -g manta

Note that this might require `sudo` or escalated privileges to install
properly.  This can often result in permissions errors or other failures - in
that case try the below method.

### Install Globally to a User Directory

Based on the [npm guide to prevent permissions
errors](https://docs.npmjs.com/getting-started/fixing-npm-permissions#option-two-change-npms-default-directory),
this module can be installed locally to a hidden path in your home directory as
a global package by modifying the prefix that `npm` uses:

    mkdir -p ~/.npm-global
    npm config set prefix '~/.npm-global'
    npm install -g manta
    export PATH=$PATH:~/.npm-global/bin
    export MANPATH=$MANPATH:~/.npm-global/share/man

You can persist this `PATH` by adding the following line to your `~/.bashrc`
file or similar:

``` bash
export PATH=$PATH:~/.npm-global/bin
export MANPATH=$MANPATH:~/.npm-global/share/man
```

## Node.js module

To install locally as a module (to use the SDK).

    $ npm install manta

### Bash completion

Optionally install Bash completion. This is done by `source`ing the
`share/manta.completion` file that is installed with the tools.

``` bash
source "$(npm prefix -g)/lib/node_modules/manta/share/manta.completion"
```

Put that (or the equivalent) in your `~/.bashrc` file to make it permanent.

You can verify that completions are working by typing the `TAB` key with
the following:

    $ mls --<TAB>
    --account   --insecure  --long      --role      --type      --verbose
    --fulljson  --json      --marker    --subuser   --url       --version
    --help      --keyId     --reverse   --time      --user

# Usage

First setup your environment to match your Joyent Manta account:

    $ export MANTA_KEY_ID=$(ssh-keygen -l -f ~/.ssh/id_rsa.pub | awk '{print $2}')
    $ export MANTA_URL=https://us-east.manta.joyent.com
    $ export MANTA_USER=mark

Alternatively, you can pull your ssh key out of your `ssh-agent` if you are
using one (this snippet takes the first key in the agent).

    $ export MANTA_KEY_ID=$(ssh-add -l | awk '{print $2}' | head -1)

## SDK

Then a code snippet:

``` js
var assert = require('assert');
var fs = require('fs');
var manta = require('manta');

var client = manta.createClient({
    sign: manta.privateKeySigner({
        key: fs.readFileSync(process.env.HOME + '/.ssh/id_rsa', 'utf8'),
        keyId: process.env.MANTA_KEY_ID,
        user: process.env.MANTA_USER
    }),
    user: process.env.MANTA_USER,
    url: process.env.MANTA_URL
});
console.log('manta ready: %s', client.toString());

client.get('/mark/stor/foo', function (err, stream) {
    assert.ifError(err);

    stream.setEncoding('utf8');
    stream.on('data', function (chunk) {
        console.log(chunk);
    });
});
```

If your paths begin with `'~~/'` then manta will automatically fill in the
current manta user, which helps you write more generic code since you get rid
of the hardcoded user name. The following two rows are identical:

``` js
client.get('/mark/stor/foo', function (err, stream) {});
client.get('~~/stor/foo', function (err, stream) {});
```

## CLI

Basic commands include:

1. `mls` - lists directory contents, default /:user/stor
2. `mmkdir` - create a directory
3. `mput` - uploads data to a Manta object
4. `mget` - downloads an object from Manta
5. `mjob` - creates and runs a computational job on Manta
6. `mfind` - walks a Manta hierarchy to find names of objects by name, size, or type

A full set of commands for interacting with Manta is in `bin`.

# More documentation

Docs can be found here:
[http://apidocs.joyent.com/manta/](http://apidocs.joyent.com/manta/)


# Testing

node-manta has both unit tests ("test/unit/*.test.js") and integration tests
("test/integration/*.test.js"). Integration tests require `MANTA_` envvars for
configuration and will run tests against the configured Manta.

Usage:

    make test [TEST-VARS]               # run all sets
    node test/.../foo.test.js           # run a specific test file
    make test [TEST_FILTER=unit/]       # run just the unit tests

    # trace-logging of test code
    make test TEST_LOG_LEVEL=trace TEST_JOBS=1 2> >(bunyan)

Test output is node-tap's default "classic" output. Full TAP output is written
to "test.tap". You can use `TAP=1` to have TAP output emited to stdout.

## Test vars

The following `MANTA_...` envvars configure the test run and `TEST_...`
envvars can tweak how the tests are run. As well, a number of node-tap
`TAP_...` envvars are available -- run `./node_modules/.bin/tap` for docs
on those.

- The usual `MANTA_USER`, `MANTA_URL`, `MANTA_KEY_ID` and other vars apply
  for integration tests.

- `MANTA_TEST_ROLE` is used for some tests that need an RBAC subrole. Those
  tests are skipped if this isn't set.

- `TEST_LOG_LEVEL=<bunyan log level name>` - This can be used to get debug and
  trace-level logging of test code. This intentionally avoids using `LOG_LEVEL`
  which is used by the `m*` tools. E.g.: use the following to run one test
  file at a time and get rendered trace logging

        make test TEST_LOG_LEVEL=trace TEST_JOBS=1 2> >(bunyan)

- `TEST_FILTER=<grep pattern for test file paths>` - By default all "\*.test.js"
  in the "test/unit/" and "test/integration" dirs are run. To run just
  those with "image" in the name, use `make test TEST_FILTER=image`.

- `TEST_JOBS=<number of test files to run concurrently>` - By default this is
  10. Set to 1 to run tests serially.

- `TEST_TIMEOUT_S=<number of seconds timeout for each test file>` - By default
  this is 1200 (10 minutes). Ideally tests are written to take much less than
  10 minutes.

- `TAP=1` to have the test suite emit TAP output. This is a node-tap envvar.


## Testing Development Guide

- Unit tests (i.e. not requiring the Manta endpoint) in "unit/\*.test.js".
  Integration tests "integration/\*.test.js".

- We are using node-tap. Read [RFD
  139](https://github.com/joyent/rfd/blob/master/rfd/0139/README.md#guidelines-for-using-node-tap-in-triton-repos)
  for some guidelines for node-tap usage. The more common we can make some
  basic usage patterns in the many Triton and Manta repos, the easier the
  maintenance.

- Node-tap supports running test files in parallel, and `make test` by
  default runs tests in parallel. Therefore:
    - Ensure that test files do not depend on each other and can run
      concurrently.
    - Prefer more and smaller and more targeted test files.


# License

```
The MIT License (MIT)

Copyright (c) 2018, Joyent, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```


# Bugs

See https://github.com/joyent/node-manta/issues.


# Release process

Here is how to cut a release:

1. Make a commit to set the intended version in "package.json#version" and
   changing `## not yet released` at the top of "CHANGES.md" to:

    ```
    ## not yet released


    ## $version
    ```

2. Get that commit approved and merged via a pull request.

3. Once that is merged and you've updated your local copy, run:

    ```
    make cutarelease
    ```

   This will run a couple checks (clean working copy, versions in package.json
   and CHANGES.md match), then will git tag and npm publish.

# Supported Node.js Versions

Currently, node-manta is officially supported on the following node versions:

* v0.10 (latest tested 0.10.48)
* v0.12 (latest tested 0.12.18)
* v4.8 (latest tested 4.8.4)
* v6.11 (latest tested 6.11.2)
* v8.3 (latest tested 8.3.0)

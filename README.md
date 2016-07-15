# Manta client tools

[manta](http://apidocs.joyent.com/manta/nodesdk.html) is a Node.js SDK for interacting
with Joyent's Manta system.

# Installation

    $ npm install manta -g

# Usage

First setup your environment to match your Joyent Manta account:

    $ export MANTA_KEY_ID=`ssh-keygen -l -f ~/.ssh/id_rsa.pub | awk '{print $2}' | tr -d '\n'`
    $ export MANTA_URL=https://us-east.manta.joyent.com
    $ export MANTA_USER=mark

Then a code snippet:

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

If your paths begin with `'~~/'` then manta will automatically fill in the current manta user, which helps
you write more generic code since you get rid of the hardcoded user name. The following two rows are identical:

    client.get('/mark/stor/foo', function (err, stream) {});
    client.get('~~/stor/foo', function (err, stream) {});

# CLI

Basic commands include:

1. mls - lists directory contents, default /:user/stor
2. mput - uploads data to a Manta object
3. mget - downloads an object from Manta
4. mjob - creates and runs a computational job on Manta
5. mfind - walks a Manta hierarchy to find names of objects by name, size, or type

A full set of commands for interacting with Manta is in `bin`.

# More documentation

Docs can be found here:
[http://apidocs.joyent.com/manta/](http://apidocs.joyent.com/manta/)


# Testing

Running this test suite will create files in Manta (using your current
`MANTA_*` environment variables).

    make test

The set of test files run can be filtered:

    make test TEST_FILTER=muntar

As well, you can get debug/trace logging (note that we intentionally avoid
`LOG_LEVEL` because the `m*` tools use that and sharing the same envvar can
break tests):

    make test TEST_LOG_LEVEL=trace 2>&1 | bunyan


There is a mechanism to re-build and test with a number of installed node
versions. First you must create "test/node.paths" (based on
"test/node.paths.example") and then:

    make testall


# License

The MIT License (MIT)
Copyright 2016 Joyent

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

# Bugs

See <https://github.com/joyent/node-manta/issues>.

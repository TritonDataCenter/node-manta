# Manta client tools

[manta](http://joyent.github.com/node-manta) is a Node.js SDK for interacting
with Joyent's Manta system.

# Installation

    $ npm install git://github.com/joyent/node-manta.git#master

# Usage

First setup your environment to match your Joyent Manta account:

    $ export MANTA_KEY_ID=`ssh-keygen -l -f ~/.ssh/id_rsa.pub | awk '{print $2}' | tr -d '\n'`
    $ export MANTA_URL=https://manta.us-east.joyentcloud.com
    $ export MANTA_USER=mark

Then a code snippet:

    var assert = require('assert');
    var fs = require('fs);

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

# CLI

A full set of commands for interacting with Manta is in `bin`.

## License

The MIT License (MIT)
Copyright (c) 2012 Joyent

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

## Bugs

See <https://github.com/joyent/node-manta/issues>.

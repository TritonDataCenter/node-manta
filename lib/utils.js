// Copyright (c) 2018, Joyent, Inc. All rights reserved.

var assert = require('assert-plus');
var manta = require('./client');

module.exports = {
    assertPath: assertPath,
    escapePath: escapePath
};

function escapePath(s) {
    assert.string(s, 'escapePath');
    /*JSSTYLED*/
    return (JSON.stringify(s).replace(/^"|"$/g, '').replace(/\\"/g, '"'));
}

function assertPath(p, noThrow) {
    try {
        manta.path(p, null);
    } catch (e) {
        if (noThrow)
          return (e);

        throw e;
    }
    return (null);
}

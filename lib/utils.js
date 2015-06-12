// Copyright (c) 2015, Joyent, Inc. All rights reserved.

var assert = require('assert-plus');

module.exports = {
    escapePath: escapePath
};

function escapePath(s) {
    assert.string(s, 'escapePath');
    /*JSSTYLED*/
    return (JSON.stringify(s).replace(/^"|"$/g, '').replace(/\\"/g, '"'));
}

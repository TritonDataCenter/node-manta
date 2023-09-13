/**
 * extremely basic and limited globbing functionality
 *
 * Author: Dave Eddy <dave@daveeddy.com>
 * Date: 4/21/14
 * License: MIT
 */

var path = require('path');

module.exports = Glob;

function Glob(s) {
    this.s = s;

    var _s = cleanGlob(s).split('*');
    this.startsWith = _s[0] || '';
    this.endsWith = _s[1] || '';
}

Glob.prototype.test = function test(s) {
    s = cleanGlob(s);
    return (startsWith(s, this.startsWith) && endsWith(s, this.endsWith));
};

Glob.prototype.toString = function toString() {
    return (this.s);
};

function cleanGlob(s) {
    if (s.indexOf('.' + path.sep) === 0)
        s = s.substr(2);
    while (s.charAt(0) === path.sep)
        s = s.substr(1);
    return (s);
}

function startsWith(s, t) {
    return (s.indexOf(t) === 0);
}

function endsWith(s, t) {
    var slen = s.length;
    var tlen = t.length;
    if (tlen > slen)
        return (false);
    return (s.substr(slen - tlen).indexOf(t) === 0);
}

if (require.main === module) {
    var assert = require('assert');
    var c;

    console.log('running tests');

    // should match any and all txt files
    c = new Glob('*.txt');
    assert(c.test('/foo/bar/baz.txt'));
    assert(!c.test('/foo/bar/baz.png'));
    assert(!c.test('/foo/bar'));
    assert(c.test('.txt')); // this matches

    c = new Glob('./.git');
    // these 3 should all be effectively the same
    assert(c.test('./.git'));
    assert(c.test('/.git'));
    assert(c.test('.git'));

    assert(c.test('.git/foo'));
    assert(c.test('.git/bar'));

    c = new Glob('./.git');
    assert(c.test('.gitignore')); // matches

    c = new Glob('./.git/');
    assert(!c.test('.gitignore')); // no match

    c = new Glob('foobar/*/baz.txt');
    assert(c.test('./foobar/1/2/3/baz.txt'));
    assert(c.test('./foobar/1/2/3/4/baz.txt'));

    assert(!c.test('./bat/1/2/3/4/baz.txt'));
    assert(!c.test('./foobar/1/2/3/4/foo.txt'));
}

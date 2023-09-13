/**
 * basic recursive file walker
 *
 * like the node module `findit`, but doesn't
 * give special treatment to symlinks unless specified
 */
var EventEmitter = require('events').EventEmitter;
var fs = require('fs');
var path = require('path');
var util = require('util');

module.exports = Finder;

util.inherits(Finder, EventEmitter);
function Finder(basedir, opts) {
    var self = this;
    opts = opts || {};
    EventEmitter.call(self);

    var statFunc = opts.ignoreSymlinks ? fs.lstat : fs.stat;

    var pending = 0;
    walk('.');
    function walk(dir) {
        pending++;
        var absolutedir = path.join(basedir, dir);
        fs.readdir(absolutedir, function (err, rdir) {
            var ignored = [];
            pending--;
            if (err || !rdir.length)
                return (check());
            rdir.forEach(function (f) {
                pending++;
                var relativepath = path.join(dir, f);
                var fullpath = path.join(basedir, relativepath);
                statFunc(fullpath, function (_err, stat) {
                    pending--;
                    if (opts.ignoreSymlinks && stat && stat.isSymbolicLink()) {
                        ignored.push(stat);
                    } else if (stat && stat.isDirectory()) {
                        self.emit('directory', fullpath, stat);
                        walk(relativepath);
                    } else if (stat && stat.isFile()) {
                        self.emit('file', fullpath, stat);
                    }
                    check();
                });
            });
            return (0);
        });
    }
    function check() {
        if (pending === 0)
            self.emit('end');
    }
}

if (require.main === module) {
    var finder = new Finder(process.argv[2] || __dirname);
    finder.on('file', function (file, stats) {
        console.log('%s = %d bytes', file, stats.size);
    });

    finder.on('directory', function (directory, stats) {
        console.log('%s%s', directory, path.sep);
    });

    finder.on('end', function () {
        console.log('done');
    });
}

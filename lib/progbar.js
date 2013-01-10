// Copyright 2013 Joyent, Inc.  All rights reserved.

var assert = require('assert-plus');
var readline = require('readline');
var sprintf = require('sprintf').sprintf;

/*
 * ECMA-48 terminal handling support:
 */
var ECMA48 = {
        ESC: '\x1b',
        CSI: '\x1b[',
        CHA: 'G'
};
var ECMA48_TERMINAL = false;
if (process.env.TERM) {
        if (process.env.TERM.match(/^xterm/) ||
            process.env.TERM.match(/^rxvt/) ||
            process.env.TERM === 'ansi') {
                ECMA48_TERMINAL = true;
        }
}

function ProgressBar(options) {
        assert.object(options, 'options');
        assert.string(options.filename, 'options.filename');
        if (options.nosize) {
                assert.bool(options.nosize);
                assert.ok(typeof (options.size) === 'undefined',
                    'nosize and size are mutually exclusive');
        } else {
                assert.number(options.size, 'options.size');
                assert.ok(options.size >= 0, 'options.size 0 or more');
        }

        this.filename = options.filename;
        if (options.nosize) {
                this.nosize = true;
                this.size = 0;
        } else {
                this.nosize = false;
                this.size = options.size;
        }
        this.progress = 0;
        this.done = false;

        var fakeStdin = {
                listeners: function () { return ([]); },
                on: function () {},
                removeListener: function () {},
                resume: function () {},
                pause: function () {}
        };
        this.tty = process.stderr;
        this.rlif = readline.createInterface(fakeStdin, this.tty);
        this.rlif.setPrompt('');

        this.drawperiod = 500; /* 2 Hz */
        this.lastdrawtime = 0;
        this.startat = +Date.now();
        this.readings = 0;
}

ProgressBar.prototype.end = function end() {
        if (this.done)
                return;

        if (!this.nosize)
                this.progress = this.size;
        this.draw();
        this.rlif.write('\n');
        this.rlif.close();
        this.done = true;
};

ProgressBar.prototype.advance = function advance(progress) {
        if (this.done)
                return;

        this.readings++;
        this.progress += progress;

        if (!this.nosize && this.progress >= this.size) {
                /* We're finished. */
                this.end();
                return;
        }

        var now = +Date.now();
        if (now - this.lastdrawtime > this.drawperiod)
                this.draw();
};

function caplength(str, len) {
        if (str.length > len) {
                return ('...' + str.slice(str.length - len + 3, str.length));
        } else {
                while (str.length < len)
                        str += ' ';
                return (str);
        }
}

function formattime(seconds) {
        var hours = Math.floor(seconds / 3600);
        seconds -= hours * 3600;
        var minutes = Math.floor(seconds / 60);
        seconds -= minutes * 60;
        if (hours > 99) {
                return (sprintf('%dh', hours));
        } else if (hours > 0) {
                return (sprintf('%2dh%2dm', hours, minutes));
        } else if (minutes > 0) {
                return (sprintf('%2dm%2ds', minutes, seconds));
        } else {
                return (sprintf('%2ds', seconds));
        }
}

function formatsize(bytes) {
        if (bytes >= 1024*1024*1024) {
                return ((bytes / (1024*1024*1024)).toFixed(2) + 'GB');
        } else if (bytes >= 1024*1024) {
                return ((bytes / (1024*1024)).toFixed(2) + 'MB');
        } else if (bytes >= 1024) {
                return ((bytes / 1024).toFixed(2) + 'KB');
        } else {
                return (bytes + 'B');
        }
}

ProgressBar.prototype.draw = function draw() {
        if (this.done)
                return;

        var ratestr = '';
        var etastr = '';
        var now = +Date.now();
        if ((this.nosize || this.size > 0) && this.readings > 5 &&
            (now - this.startat) > 2000) {
                var period = (now - this.startat) / 1000;
                var rate = Math.floor(this.progress / period);
                ratestr = formatsize(rate) + '/s';
                if (!this.nosize && this.progress < this.size) {
                        var remaining = Math.floor((this.size - this.progress) /
                            rate);
                        etastr = formattime(remaining);
                } else {
                        etastr = formattime(period);
                }
        }

        var bar = '';
        var filestr;
        var infostr;
        var filewidth;
        if (this.nosize) {
                infostr = sprintf(' %8s %10s %6s', formatsize(this.progress),
                    ratestr, etastr);

                filewidth = this.tty.columns - infostr.length - 2;
                filestr = caplength(this.filename, filewidth) + ' ';
        } else {
                var percent = this.size === 0 ? 100 :
                    Math.floor((this.progress / this.size) * 100);
                infostr = sprintf(' %3d%% %8s %10s %6s', percent,
                    formatsize(this.progress), ratestr, etastr);

                filewidth = Math.floor(this.tty.columns / 4);
                filestr = caplength(this.filename, filewidth) + ' ';

                var barwidth = this.tty.columns - filestr.length -
                    infostr.length - 3;
                var donlen = this.size === 0 ? barwidth :
                    Math.floor(barwidth * (this.progress / this.size));
                while (bar.length < donlen - 1)
                        bar += '=';
                while (bar.length < donlen)
                        bar += '>';
                while (bar.length < barwidth)
                        bar += ' ';
                bar = '[' + bar + ']';
        }


        /* Clear existing line: */
        if (ECMA48_TERMINAL) {
                /*
                 * On an ECMA-48 compliant terminal, we can use:
                 *
                 *   8.3.9 CHA - CURSOR CHARACTER ABSOLUTE
                 *      CSI Pn 04/07
                 *
                 * to return the cursor to column 1.  We then overwrite the
                 * previous progress bar with a new one, resulting in less
                 * flicker than erasing the entire line before printing again.
                 */
                this.rlif.write(ECMA48.CSI + '1' + ECMA48.CHA);
        } else {
                /*
                 * Otherwise, assume readline knows how to clear the line
                 * before we repaint it.
                 */
                this.rlif.write(null, {ctrl: true, name: 'u'});
        }
        this.rlif.write(filestr + bar + infostr);
        this.lastdrawtime = +Date.now();
};

module.exports = {
        ProgressBar: ProgressBar
};

/* vim: set expandtab sw=8: */

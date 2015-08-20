/*
 * Copyright 2015 Joyent, Inc.
 */

var mod_trackmarker = require('../lib/trackmarker');

function test(name, testfunc) {
    module.exports[name] = testfunc;
}

var SCENARIOS = [
    {
        type: 'name',
        name: 'pages by name',
        pages: [
            [
                { name: 'a', mtime: '1000' },
                { name: 'b', mtime: '2000' },
                { name: 'c', mtime: '4000' },
                { name: 'd', mtime: '1000' }
            ],
            [
                { name: 'd', mtime: '1000' },
                { name: 'e', mtime: '8000' },
                { name: 'f', mtime: '2000' },
                { name: 'g', mtime: '2000' }
            ],
            [
                { name: 'g', mtime: '2000' }
            ]
        ],
        results: [ 'a', 'b', 'c', 'd', 'e', 'f', 'g' ],
        counts: [
            { incl: 1, skip: 0 },
            { incl: 2, skip: 0 },
            { incl: 3, skip: 0 },
            { incl: 4, skip: 0 },

            { incl: 0, skip: 1 },
            { incl: 1, skip: 1 },
            { incl: 2, skip: 1 },
            { incl: 3, skip: 1 },

            { incl: 0, skip: 1 },
            { incl: 0, skip: 1, end: true }
        ]
    },
    {
        type: 'mtime',
        name: 'pages by mtime',
        pages: [
            [
                { name: 'a', mtime: '1000' },
                { name: 'd', mtime: '1000' },
                { name: 'b', mtime: '2000' },
                { name: 'f', mtime: '2000' }
            ],
            [
                { name: 'b', mtime: '2000' },
                { name: 'f', mtime: '2000' },
                { name: 'g', mtime: '2000' },
                { name: 'c', mtime: '4000' }
            ],
            [
                { name: 'c', mtime: '4000' },
                { name: 'h', mtime: '4000' },
                { name: 'j', mtime: '5000' },
                { name: 'i', mtime: '6000' }
            ]
        ],
        results: [ 'a', 'd', 'b', 'f', 'g', 'c', 'h', 'j', 'i' ],
        counts: [
            { incl: 1, skip: 0 },
            { incl: 2, skip: 0 },
            { incl: 3, skip: 0 },
            { incl: 4, skip: 0 },

            { incl: 0, skip: 1 },
            { incl: 0, skip: 2 },
            { incl: 1, skip: 2 },
            { incl: 2, skip: 2 },

            { incl: 0, skip: 1 },
            { incl: 1, skip: 1 },
            { incl: 2, skip: 1 },
            { incl: 3, skip: 1 },
            { incl: 3, skip: 1, end: true }
        ]
    }
];

function check_scenario(t, scenario, skip_check_number, tm, results) {
    var line = scenario.counts[skip_check_number];

    t.strictEqual(tm.countIncluded(),
        line.incl,
        'included count (step ' + skip_check_number + ')');
    t.strictEqual(tm.countSkipped(),
        line.skip,
        'skipped count (step ' + skip_check_number + ')');
    t.strictEqual(tm.countTotal(),
        tm.countIncluded() + tm.countSkipped(),
        'included and skipped match with total');

    if (results) {
        t.strictEqual(line.end, true, 'at end of scenario');
        t.deepEqual(results, scenario.results, 'expected results');
    }
}

SCENARIOS.forEach(function (scenario) {
    test(scenario.name, function (t) {
        var tm = mod_trackmarker.createTrackMarker(scenario.type);

        var results = [];
        var count = 0;

        scenario.pages.forEach(function (page, pageidx) {
            tm.startPage();
            page.forEach(function (row, rowidx) {
                var skip = tm.skipCheck(row.name, row.mtime);

                check_scenario(t, scenario, count++, tm);

                if (!skip) {
                    results.push(row.name);
                }
            });
        });
        check_scenario(t, scenario, count++, tm, results);
        t.done();
    });
});

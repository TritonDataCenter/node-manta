/*
 * Copyright 2015 Joyent, Inc.
 */

var mod_assert = require('assert-plus');
var mod_jsprim = require('jsprim');

var OPTIONS_WHITELIST = [
    'type'
];

/*
 * OVERVIEW
 *
 * This class allows the tracking of a "marker" property across multiple pages
 * in a sequence of paginated requests.  The "opts" argument accepts one named
 * parameter: "type".  The "type" is the sort order of the result set we are
 * expecting to track; this may currently be either "name" or "mtime".
 *
 * SORTING BY NAME
 *
 * In the Manta paginated request model, the marker provided to the server is
 * used as a greater than _or equal to_ comparison, not strictly greater than.
 * The default sort order for results is by a field that is unique within the
 * directory: the object name.  In practice this means that the last record in
 * request N, from which we derive the marker value to pass to the server, will
 * appear again as the first record in request (N + 1).
 *
 * SORTING BY MTIME
 *
 * In the special case of sorting by "mtime", a field which does not always
 * uniquely identify an entry in a directory, we may receive more than one
 * record which overlaps with the previous page.  To filter out these
 * duplicates from the output stream, we must track a secondary field that is
 * guaranteed to be unique within a directory.  The obvious choice is the
 * object name; when using "mtime" for sorting the result set (and deriving the
 * marker) we will also track the set of object names that we have seen for
 * each mtime.
 *
 * THE FUTURE
 *
 * If Manta ever supports a composite marker (e.g. both the "name" and "mtime"
 * for a given record) this functionality could be made substantially simpler.
 * Once a composite marker may be specified, each entry in the directory may be
 * uniquely identified _and_ the entire result set can have a total ordering
 * that both server and client agree on.
 *
 * In addition, if Manta would allow a mode where marker comparisons are
 * _strictly_ greater than, this entire _class_ could be eliminated.
 * Subsequent request pages would simply begin on the next element in the
 * result set _after_ the last one we saw, and the functionality that LOMStream
 * provides would be sufficient for paginated request streams.
 */
function TrackMarker(opts) {
    mod_assert.object(opts, 'opts');
    mod_assert.string(opts.type, 'opts.type');

    var spurious;
    if ((spurious = mod_jsprim.extraProperties(opts,
        OPTIONS_WHITELIST)).length > 0) {

        throw (new Error('spurious options: ' + spurious.join(', ')));
    }

    this.trm_previousMarker = null;
    this.trm_previousNames = null;
    this.trm_countSkipped = 0;
    this.trm_countIncluded = 0;

    this.trm_type = opts.type;
    switch (this.trm_type) {
    case 'name':
        break;
    case 'mtime':
        this.trm_previousNames = [];
        break;
    default:
        throw (new Error('unsupported "type": ' + opts.type));
    }
}

/*
 * This function should be called at the start of each page of requests
 * to reset the included/skipped counters.
 */
TrackMarker.prototype.startPage = function () {
    this.trm_countSkipped = 0;
    this.trm_countIncluded = 0;
};

/*
 * The skipCheck() function should be called once per directory entry in
 * each request.  If the function returns true, this entry should be
 * skipped.  If not, the entry should be included.  The function must only
 * be called once per entry, as it updates the counters for this page.
 */
TrackMarker.prototype.skipCheck = function (name, mtime) {
    mod_assert.string(name, 'name');
    mod_assert.string(mtime, 'mtime');

    var marker_val = (this.trm_type === 'name') ? name : mtime;

    if (marker_val !== this.trm_previousMarker) {
        /*
         * This marker value is not the same as the last observed marker value,
         * so this record should be included.
         */
        if (this.trm_previousNames !== null) {
            /*
             * As this is a new marker value, we reset the list of names
             * we have seen to include only this entry:
             */
            this.trm_previousNames = [ name ];
        }
        this.trm_countIncluded++;
        this.trm_previousMarker = marker_val;
        return (false);
    }

    if (this.trm_previousNames === null) {
        /*
         * We are not tracking names, so the fact that we have seen this
         * marker value already is sufficient to skip this object.
         */
        this.trm_countSkipped++;
        return (true);
    }

    if (this.trm_previousNames.indexOf(name) !== -1) {
        /*
         * We have already seen an object of this name for this marker value,
         * so skip this object.
         */
        this.trm_countSkipped++;
        return (true);
    }

    /*
     * Though the marker value has not changed, this object has a previously
     * unseen name and should be included.
     */
    this.trm_previousNames.push(name);
    this.trm_countIncluded++;
    return (false);
};

/*
 * The following three functions return the skipped and included counts for the
 * current page, as well as the _total_ count (i.e. skipped and included
 * together).  These counts are helpful for determining if this is the last
 * page in the result set; i.e., if less results were returned than were asked
 * for.
 */
TrackMarker.prototype.countSkipped = function () {
    return (this.trm_countSkipped);
};

TrackMarker.prototype.countIncluded = function () {
    return (this.trm_countIncluded);
};

TrackMarker.prototype.countTotal = function () {
    return (this.trm_countSkipped + this.trm_countIncluded);
};


module.exports = {
    createTrackMarker: function (type) {
        return (new TrackMarker({
            type: type
        }));
    }
};

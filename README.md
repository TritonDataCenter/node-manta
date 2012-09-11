# Joyent Engineering Guide

Repository: <git@git.joyent.com:eng.git>
Browsing: <https://mo.joyent.com/eng>
Who: Trent Mick, Dave Pacheco
Docs: <https://mo.joyent.com/docs/eng>
Tickets/bugs: <https://devhub.joyent.com/jira/browse/TOOLS>


# Overview

This repo serves two purposes: (1) It defines the guidelines and best
practices for Joyent engineering work (this is the primary goal), and (2) it
also provides boilerplate for an SDC project repo, giving you a starting
point for many of the suggestion practices defined in the guidelines. This is
especially true for node.js-based REST API projects.

Start with the guidelines: <https://mo.joyent.com/docs/eng>


# Repository

    deps/           Git submodules and/or commited 3rd-party deps should go
                    here. See "node_modules/" for node.js deps.
    docs/           Project docs (restdown)
    lib/            Source files.
    node_modules/   Node.js deps, either populated at build time or commited.
                    See Managing Dependencies.
    pkg/            Package lifecycle scripts
    smf/manifests   SMF manifests
    smf/methods     SMF method scripts
    test/           Test suite (using node-tap)
    tools/          Miscellaneous dev/upgrade/deployment tools and data.
    Makefile
    package.json    npm module info (holds the project version)
    README.md


# Development

To run the boilerplate API server:

    git clone git@git.joyent.com:eng.git
    cd eng
    git submodule update --init
    make all
    node server.js

To update the guidelines, edit "docs/index.restdown" and run `make docs`
to update "docs/index.html".

Before commiting/pushing run `make prepush` and, if possible, get a code
review.



# Testing

    make test

If you project has setup steps necessary for testing, then describe those
here.


# Starting a Repo Based on eng.git

Create a new repo called "some-cool-fish" in your "~/work" dir based on "eng.git":
Note: run this inside the eng dir.

    ./tools/mkrepo $HOME/work/some-cool-fish


# Your Other Sections Here

Add other sections to your README as necessary. E.g. Running a demo, adding
development data.




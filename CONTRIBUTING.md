# Contributing

This repository is part of the Triton Manta project.  See the [contribution
guidelines for the Manta
project](https://github.com/TritonDataCenter/manta/blob/master/CONTRIBUTING.md).

In addition to the guidelines described there, user-facing changes should
include an update to `CHANGES.md` (to list the change) and `package.json` (to
bump this package's version appropriately).

If you have a GitHub issue created for a change you want to include in the
changelog you can use the included script `./tools/changelog-issue-line`
(requires [json](https://github.com/trentm/json) to be installed).  Example:

    $ ./tools/changelog-issue-line 349
    - [#349](https://github.com/TritonDataCenter/node-manta/issues/349) issue numbers in CHANGES.md should link to GitHub issues

Or in `vim`

    :r!./tools/changelog-issue-line 349

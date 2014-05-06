# node-manta Changelog

## not yet release

- #184: update progbar to 0.1.0
    * includes: jclulow/node-progbar#10 (handle tty resizing)
- #181: `client.get` should auto-resume interrupted downloads
- #180: client should throw on empty/badly formatted private key

## v1.2.7

- #179: mlogin now supports --image
- #177: Clearer error if $HOME is not set.
- #156: `client.listJobs` not URL-encoding names
- #167: `client.put` hangs if the stream passed to it is not readable
- #168: mls -l on objects shows wrong timestamp

## v1.2.6

- #161 add `-H` to mget and an `minfo` command
- #164 assets whose names require URL-encoding don't work correctly

## v1.2.5

- #149 mput of a zero byte file fails
- mls spewing a random mls: [object Object] at end of listings

## v1.2.4

- `client.mkdir` broke contract of returning an HTTP respose object.

## v1.2.3

- `client.mkdir` should return the same object as `client.info`
- add `path` API to manta client
- #157: mkdirp broken on paths requiring url encoding
- depend on restify from npm, not git

## v1.2.2

- ARGH! rollback to node-uuid

## v1.2.1

- libuuid was broken on linux

## v1.2.0

- #147: msign broken on urls with spaces in them
- #140: SSH Agent Signer not caching in some race scenarios
- #138: `mjob/mlogin` support assets with  `~~/...` syntax
- #132: mput needs to handle files that are still being appended to
- #131: `mjob cost` subcommand
- #130: `mput --md5` option to send `content-md5`
- #128: support `MANTA_DEFAULT_CONTENT_TYPE` for mput
- #117: mfind: support `--maxdepth` and `--mindepth`
- #106: `client.ls()` now handles all pagination, sorting, etc.
- #106: `client.ftw()` now available.
- #103: mls: support `mls --fulljson` (shows HTTP headers)
- #86: option to create parent directories on PUT
- #59: add durability/mtime to `mls --json` output

## v1.1.2

- version bump of "carrier" (pgte/carrier#17)
- "mjob share" style improvements and bug fixes

## v1.1.1

- #122: `mjob share` broken without README
- #114: sshAgentSigner had a null deref (@wpreul)

## v1.1.0

- #119: "mjob share" subcommand
- #109: mlogin(1) should print diagnostics on a failed job
- #108: mlogin(1) should validate input object before creating job
- #110: muntar should retry files on a 500
- #101: client.create(Read|Write)Stream APIs
- #96: mls should infer paths when no leading / is present
- #98: m* CLI tools fail silently if ~/.ssh has no public keys
- #97: mlogin(1) and msign(1) broken with trailing slash
- #95: mlogin(1) should support --init
- #67: "mjob create" should notify when input stream left open
- #32: auto insert https:// if MANTA_URL is just an IP
- #70: msign with query string busted
- #81: msign should work with url encoded paths
- #74: mfind --limit doesn't work
- #93: commands should support ~~ as an alternate to /$MANTA_USER
- #91: mrm -r should work on objects
- #92: catch bogus paths in getPath
- documentation fixes

## v1.0.1

- MANTA-1617: mlogin: broken with xargs
- #78 mput should not retry on PreconditionFailedError
- MANTA-1611: support PUT requests from browsers
-- add helper signURL function to client
-- tack properties on sshAgentSigner
-- OpenSSL wants all algorithms in uppercase
- MANTA-1593: client needs to URL encode all URLs sanely
-- #79 mkdirp double encoding paths
-- #80 mrm -r double encodes URLs
- #72 strip out any headers that would be passed on as `undefined`
- documentation fixes

## v1.0.0

- Initial release

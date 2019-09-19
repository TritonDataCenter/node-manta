This document shows the current status of node-manta.git work for the
Manta Buckets project ... at least for an MVP. This file should be deleted
before merging back to master.

See https://jira.joyent.us/browse/MANTA-3907

# buckets API design Qs

- a ticket/discussion to decide whether we want to support PutBucketObjectMetadata
- S3 limits "user-defined object metadata" to 2kB. Do we have a guard on that?
- Manta dir style uses `expect: 100-continue` for uploads. Should Buckets API
  as well? Yes we should. Muskie's `common.sharkStreams` restify handler
  (used for object upload in both dir-style and buckets) supports using
  `Expect: 100-continue` to ahve the client wait on streaming the file
  until the shark streams are setup.
    - add this to RFD 155 spec
    - perhaps a ticket on java-manta to have it use this (does its dir-style
      already do so?)
    - grok better the fall out from *not* doing this. Could a muskie's
      buffer overflow? Does that block? or drop bytes?
- `aws s3 mb` doesn't fail if the bucket already exists. Should we have an
  option for that? `-p` a la `mkdir -p`?
- Shouldn't etags from manta buckets have double-quotes?
    < HTTP/1.1 200 OK
    < etag: ca173efc-b460-691a-ea47-c051383113ab
- Should PutBucketObjectMetadata get conditional request header support? RFD 155
  doesn't include it currently.


# TODO: fullish test suite

- pagination: for testing, allow setting limit and page through 100, 10 at a time
    - buckets
    - objects in a bucket
- common res headers: server, data, x-request-id, x-response-time, x-server-name
    https://github.com/joyent/rfd/blob/master/rfd/0155/README.md#common-response-headers
- object name limits:
    - 1024 chars
    - all URL-encodable chars?
    - fuzzing/proptesting would be nice, but meh
- bucket name limits:
    - ???
- range gets
- range gets ... on *metadata* (GetBucketObjectMetadata)?
- endpoints:
    - IsBucketsSupported (OPTIONS /:login/buckets)
        - res header: "allow"
    - ListBuckets
        - create 10 prefixed buckets
        - list them, with different limits to force pagination, assert have them in the set
        - if supported by client, get the req/res objects and assert:
            - "next-marker" header for pagination
        - req params: limit, prefix, marker, delimiter
        - Q: should ListBuckets support prefix/delimiter? Promising
          functionality we perhaps don't need or want to support?
    - HeadBucket
        - create a prefixed bucket
        - head it
        - status 200
        - errors:
            status 404?
    - CreateBucket
        - create a prefixed bucket
        - status 204
        - errors:
            - create same one again: status 409
            XXX
    - DeleteBucket
        - create a prefixed bucket
        - delete it
        - status 204
        - errors:
            - attempt DeleteBucket with objects in the bucket: status 409
            - attempt DeleteBucket of no such bucket: status 404
    - ListBucketObjects
        - create some in a new bucket, list them:
            - status 200
            - fields: name, etag, size, type "bucketobject"
                Q: contentType?
                Q: contentMD5?
                Q: mtime?
        - req limit/marker
            - Next-Marker
            - trying to break: have '&' and '/' and others in 'next-marker' header
              and 'marker' query param
            - XXX if '/' needs to be URL encoded in 'marker' query param, then
              https://github.com/joyent/rfd/blob/master/rfd/0155/README.md#list-objects-get-loginbucketsbucketobjects
              examples for marker usage should be updated
        - req prefix/delimiter:
            - field type "group"
            - trying to break: have '&' and '/' and others in 'prefix'
            - url-encoding of delimiter
    - HeadBucketObject
        - existing obj:
            - status 200
            - no body
            - res headers: durability-level, content-type, content-md5, content-length, etag, last-modified
        - test with content-type=0
        - req headers
            - if-modified-since
            - if-unmodified-since
            - if-match: test with etag with and without double-quotes
            - if-none-match: test with etag with and without double-quotes
    - PutBucketObject:
        - basic obj:
            - status 204
            - res headers: durability-level, computed-md5, content-length, etag, last-modified
        - req headers:
            - content-md5: correct and wrong
            - durability-level: 0, 1, 2, > number of sharks, negative, ridiculously high
              (apidocs say "between one and six copies")
            - if-unmodified-since
            - if-match: test with etag with and without double-quotes
            - if-none-match: test with etag with and without double-quotes
        - content-type guessing? or just none and ensure that
    - GetBucketObject:
        - basic object:
            - status 200
            - res headers: durability-level, content-md5, content-length, etag, last-modified
        - req headers:
            - if-modified-since
            - if-unmodified-since
            - if-match: test with etag with and without double-quotes
            - if-none-match: test with etag with and without double-quotes
    - DeleteBucketObject:
        - basic object:
            - status 204
        - req headers:
            - if-unmodified-since
            - if-match: test with etag with and without double-quotes
            - if-none-match: test with etag with and without double-quotes
    - PutBucketObjectMetadata
        - basic case: set one metadatum
        - set two metadatum
        - overwrite an existing metadatum
        - non-ascii in value
        - Q: should there be if-* on PutBucketObjectMetadata?


# TODO: roles/rbac

status: Waiting on clarity from MANTA-4349

- some Qs (asked by email on 20190911):
    - Is there a requirements doc or guide for Manta RBAC *and buckets*?
    - Can anyone confirm if Samsung users care about and use our current RBAC
      system? IAM it ain't.
    - I gather I should ensure `MANTA_SUBUSER`s can use the Buckets API ... with
      similar effort/roles/rules/policies required for dir-style manta?
      I'll have to learn about that from our "Object Storage and Converged
      Analytics" docs (https://apidocs.joyent.com/manta/rbac.html).
    - Are we doing "role-tag"s or relying on "resource path" support that was
      recently added to dir-style manta in MANTA-4284?
    - If we are doing role-tags:
        - Are we doing role-tags on buckets themselves? or just on bucket objects?
        - Need there be an equivalent to `mchmod` from dir-style Manta for changing
          role-tags on existing bucket objects?
    - What is the java-manta story for buckets + rbac?


# TODO: pagination

status: Waiting on MANTA-4514 and MANTA-4515

- finish delimiter/prefix/mbucket ls:
    - then XXX's in do_ls.js
- update the buckets-client-basic.test.js XXXs for pagination improvements


# TODO: conditional header support

status:
- QQQ working on this now: buckets-client-condreq.test.js
- waiting on MANTA-??? to check that entity headers are NOT included in
  failing conditional responses


- If-Modified-Since

    $ mbucket raw /trentm/buckets/foo/objects/foo.txt   -X HEAD -H 'If-Modified-Since: Tue, 17 Sep 2019 00:27:31 GMT'
    HTTP/1.1 304 Not Modified
    etag: 44d05738-ea1b-c4e0-fe07-dd40781f6ab8
    last-modified: Tue, 17 Sep 2019 00:27:31 GMT
    ...

    $ mbucket raw /trentm/buckets/foo/objects/foo.txt   -X HEAD -H 'If-Modified-Since: Tue, 17 Sep 2019 00:27:30 GMT'
    HTTP/1.1 200 OK
    ...

- If-Unmodified-Since

    $ mbucket raw /trentm/buckets/foo/objects/foo.txt   -X HEAD -H 'If-Unmodified-Since: Tue, 17 Sep 2019 00:27:30 GMT'
    HTTP/1.1 412 Precondition Failed
    etag: 44d05738-ea1b-c4e0-fe07-dd40781f6ab8
    last-modified: Tue, 17 Sep 2019 00:27:31 GMT
    durability-level: 2
    content-length: 149
    ...

- If-Match
- If-None-Match

- which endpoints?
    - HeadBucketObject
            - if-modified-since
            - if-unmodified-since
            - if-match: test with etag with and without double-quotes
            - if-none-match: test with etag with and without double-quotes
    - CreateBucketObject:
            - if-unmodified-since
            - if-match: test with etag with and without double-quotes
            - if-none-match: test with etag with and without double-quotes
    - GetBucketObject:
            Q: with range requests as well?
            - if-modified-since
            - if-unmodified-since
            - if-match: test with etag with and without double-quotes
            - if-none-match: test with etag with and without double-quotes
    - DeleteBucketObject:
            - if-unmodified-since
            - if-match: test with etag with and without double-quotes
            - if-none-match: test with etag with and without double-quotes
    - PutBucketObjectMetadata
        - Q: should there be if-* on PutBucketObjectMetadata?

# TODO: remaining items before "MVP"

- guard against `mrm` deleting bucket objects: Possible?
    $ mrm /trentm/buckets/foo/objects/foo.txt
    $ mbucket ls manta:foo/foo.txt
    $
- review XXXs in current impl
- tests
- Q: can an object path start with a '/'?
- Q: can an object path *end* with a '/'?
- CreateBucketObject content guessing? or just none and ensure that?
- docs:
    - man pages:
        - finish man page options for `mbucket ls`
        - all other sections
    - api docs: index.restdown
    - online and manpage help for concepts a la 'aws s3 help'
- update "known issues/limitations" section of the changelog entry


# TODO (lower prio)

- tab completion for 'mantabucketuri' ... with a limit and timeout
  to not list zillions
- tab completion possible for mantaobjecturi? Would want to have it fallback
  to "default" bash completion if doesn't start with 'manta:'. If so, then
  could use a prefix listing with limit=10 or near that and just use those.
- --include and --exclude (per 'aws s3 help') for relevant commands?
- re-evaluate usage of 'self.get' in buckets.js
- raw stream in data file:
        mbucket raw ~~/buckets/foo/objects/foo.txt -d@- <foo.txt
        mbucket raw ~~/buckets/foo/objects/foo.txt -d@foo.txt
- recursive download notes: Note how '  yadir' is handled here:

    ```
    $ aws s3 ls --recursive s3://trentm-play
    2019-06-21 15:45:20          4 anotherdir/baz.txt
    2019-06-21 15:44:37          4 baz.txt
    2019-06-21 15:44:57          4 yadir
    2019-06-17 13:44:23          4 yadir/bar.txt
    2019-06-21 15:45:08          4 yadir/baz.txt
    2019-06-17 13:44:23          4 yadir/foo.txt
    $ aws s3 cp --recursive s3://trentm-play .
    download: s3://trentm-play/baz.txt to ./baz.txt
    download: s3://trentm-play/yadir/bar.txt to yadir/bar.txt
    download: s3://trentm-play/yadir/baz.txt to yadir/baz.txt
    download: s3://trentm-play/yadir/foo.txt to yadir/foo.txt
    download failed: s3://trentm-play/yadir to ./yadir [Errno 21] Is a directory
    download: s3://trentm-play/anotherdir/baz.txt to anotherdir/baz.txt
    $ echo $?
    1
    ```

    Notes:
    - The yadir *as a directory* is being handled first. This suggests that
      common prefixes are handled first? I.e. that the download here is
      making non-recursive `ls` calls per-directory-level.
    - Failure of one file doesn't abort the whole process. It could be hard
      to see a failure amongst many here. `mbucket cp` will repeat error
      summary at end.
    - Not sure about progress bars. All my files in the above example may
      be too small.
    - TODO: read the aws cli sources here.
- profile:
    - downloading large file
    - uploading large file
    - multiple files (down and up)


# Status

The `mbucket` command in the "buckets" branch of node-manta.git is done a
first pass. It has basic support for all the endpoints except the more recent
metadata endpoints I believe.

```bash
$ mbucket mb manta:mybucket                     # creating/listing buckets
$ mbucket ls
bar
foo
mybucket

$ echo hi > foo.txt                             # uploading
$ mbucket cp foo.txt manta:mybucket/foo.txt

$ mbucket ls manta:mybucket                     # listing
foo.txt
$ mbucket ls manta:mybucket -l
2019-06-26T23:52:22.962Z          3 foo.txt

$ mbucket cp manta:mybucket/foo.txt ./bar.txt   # downloading
$ cat bar.txt
hi

$ mbucket rm manta:mybucket/foo.txt             # deleting
$ mbucket rb manta:mybucket
$ mbucket ls
bar
foo
```

changelog notes (including limitations and known issues) here:
https://github.com/joyent/node-manta/blob/buckets/CHANGES.md#buckets




# examples

```
$ aws s3api head-object --bucket=trentm-pics --key=download/2014/tmp/img_2771_18448737603_o.jpg
{
    "AcceptRanges": "bytes",
    "ContentType": "image/jpeg",
    "LastModified": "Wed, 04 Oct 2017 20:47:35 GMT",
    "ContentLength": 2752283,
    "ETag": "\"9c018f3792d83bc86d65c89e916402fb\"",
    "Metadata": {}
}
```


```
$ aws s3 ls
2017-06-01 21:23:56 trentm-pics
2019-06-17 13:37:08 trentm-play

$ aws s3 ls s3://trentm-pics
                           PRE download/
2017-06-01 21:29:47    3059443 ewan-with-new-xmas-blocks_2142495825_o.jpg

$ aws s3 ls s3://trentm-pics/download/2014/tmp
                           PRE tmp/

$ aws s3 ls s3://trentm-pics/download/2014/tmp/
2017-10-04 12:21:37    1895036 13966764080_48c3a4946c_o.jpg
2017-10-04 12:22:25    1283490 14066310850_28a0edb7f4_o.jpg
2017-10-04 12:23:43    1637533 14075085878_fe5fc801d8_o.jpg
2017-10-04 12:24:02    1899673 14075841957_fdf6c37e2a_o.jpg
...


# Prefix on any char:
$ aws s3 ls s3://trentm-pics/download/2014/tm --recursive
2017-10-04 12:21:37    1895036 download/2014/tmp/13966764080_48c3a4946c_o.jpg
2017-10-04 12:22:25    1283490 download/2014/tmp/14066310850_28a0edb7f4_o.jpg
2017-10-04 12:23:43    1637533 download/2014/tmp/14075085878_fe5fc801d8_o.jpg
2017-10-04 12:24:02    1899673 download/2014/tmp/14075841957_fdf6c37e2a_o.jpg
```


```
$ vi mydir/foo.txt
$ vi mydir/bar.txt
$ aws s3 mv --recursive mydir s3://trentm-play/mydir
move: mydir/foo.txt to s3://trentm-play/mydir/foo.txt
move: mydir/bar.txt to s3://trentm-play/mydir/bar.txt
$ find .
.
./mydir

$ aws s3 ls s3://trentm-play/mydir --recursive
2019-06-17 13:42:38          4 mydir/bar.txt
2019-06-17 13:42:38          4 mydir/foo.txt
$ aws s3 mv s3://trentm-play/mydir s3://trentm-play/anotherdir
fatal error: An error occurred (404) when calling the HeadObject operation: Key "mydir" does not exist
$ aws s3 mv --recursive s3://trentm-play/mydir s3://trentm-play/anotherdir
move: s3://trentm-play/mydir/foo.txt to s3://trentm-play/anotherdir/foo.txt
move: s3://trentm-play/mydir/bar.txt to s3://trentm-play/anotherdir/bar.txt
```

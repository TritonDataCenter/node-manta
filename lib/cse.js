// Copyright 2017 Joyent, Inc.

/*
 * Client side encryption module that implements RFD 71:
 * https://github.com/joyent/rfd/tree/master/rfd/0071
 *
 * Exports decrypt(), encrypt(), and isSupported() functions for use
 * by the Manta client module to encrypt/decrypt get/put requests to Manta.
 */

var crypto = require('crypto');
var assert = require('assert-plus');
var ParseEtMStream = require('./parse_etm_stream');
var PassThrough = require('stream').PassThrough;
var util = require('util');
var verror = require('verror');

var VError = verror.VError;

var VERSION = 1;
var CIPHERS = {
    'AES128/GCM/NOPADDING': {
        string: 'aes-128-gcm',
        blockBytes: 16,
        ivBytes: 16,
        keyBytes: 16,
        tagBytes: 16
    },
    'AES192/GCM/NOPADDING': {
        string: 'aes-192-gcm',
        blockBytes: 16,
        ivBytes: 16,
        keyBytes: 24,
        tagBytes: 16
    },
    'AES256/GCM/NOPADDING': {
        string: 'aes-256-gcm',
        blockBytes: 16,
        ivBytes: 16,
        keyBytes: 32,
        tagBytes: 16
    },
    'AES128/CTR/NOPADDING': {
        string: 'aes-128-ctr',
        blockBytes: 16,
        ivBytes: 16,
        keyBytes: 16
    },
    'AES192/CTR/NOPADDING': {
        string: 'aes-192-ctr',
        blockBytes: 16,
        ivBytes: 16,
        keyBytes: 24
    },
    'AES256/CTR/NOPADDING': {
        string: 'aes-256-ctr',
        blockBytes: 16,
        ivBytes: 16,
        keyBytes: 32
    },
    'AES128/CBC/PKCS5PADDING': {
        string: 'aes-128-cbc',
        isPadded: true,
        blockBytes: 16,
        ivBytes: 16,
        keyBytes: 16
    },
    'AES192/CBC/PKCS5PADDING': {
        string: 'aes-192-cbc',
        isPadded: true,
        blockBytes: 16,
        ivBytes: 16,
        keyBytes: 24
    },
    'AES256/CBC/PKCS5PADDING': {
        string: 'aes-256-cbc',
        isPadded: true,
        blockBytes: 16,
        ivBytes: 16,
        keyBytes: 32
    }
};

// GCM encryption modes are only supported in node v1.0 and greater.
var NODE_MAJOR = parseInt(process.versions.node.split('.')[0], 10);
if (NODE_MAJOR === 0) {
    delete CIPHERS['AES128/GCM/NOPADDING'];
    delete CIPHERS['AES192/GCM/NOPADDING'];
    delete CIPHERS['AES256/GCM/NOPADDING'];
}

var HMACS = [
    {
        type: 'HmacMD5',
        algorithm: 'md5',
        bytes: 16
    },
    {
        type: 'HmacSHA1',
        algorithm: 'sha1',
        bytes: 20
    },
    {
        type: 'HmacSHA256',
        algorithm: 'sha256',
        bytes: 32
    },
    {
        type: 'HmacSHA512',
        algorithm: 'sha512',
        bytes: 64
    }
];
var REQUIRED_HEADERS = [
    'm-encrypt-key-id',
    'm-encrypt-iv',
    'm-encrypt-cipher',
    'm-encrypt-type'
];
/*JSSTYLED*/
var METADATA_PATTERN = /^e\-.*/i;


var ENCRYPT_AUTH_MODES = ['MandatoryAuthentication', 'OptionalAuthentication'];
var ENCRYPT_AUTH_MODES_UPPER = ['MANDATORYAUTHENTICATION',
    'OPTIONALAUTHENTICATION'];

// Case insensitive validation of auth mode
function validateAuthMode(authMode) {
    if (ENCRYPT_AUTH_MODES_UPPER.indexOf(authMode.toUpperCase()) === -1) {
        throw new Error(util.format(
            'invalid authentication mode: "%s" (must be one of "%s")',
            authMode, ENCRYPT_AUTH_MODES.join('", "')));
    }
}
exports.validateAuthMode = validateAuthMode;


/**
 * Decrypt an encrypted stream and verify the integrity of the decrypted payload
 * The encrypted m-encrypt-metadata header is also decrypted and removed.
 *
 * Parameters:
 *  - options: getKey function used to retrieve key value. Signature for getKey
 *       is getKey(keyId, cb) the cb function should return (err, key)
 *  - encrypted: readable stream of encrypted data
 *  - res: raw HTTP response from manta request, used for reading headers
 *  - cb: callback of the form f(err, output, res)
 */
exports.decrypt = function decrypt(options, encrypted, res, cb) {
    assert.object(options, 'options');
    assert.object(res, 'res');
    assert.object(res.headers, 'res.headers');
    assert.stream(encrypted, 'encrypted');
    assert.func(options.getKey, 'options.getKey');

    var isRangeRequest = options.isRangeRequest !== undefined ?
        options.isRangeRequest : false;
    var isMandatoryAuthentication = true;
    if (options.authMode !== undefined) {
        validateAuthMode(options.authMode);
        isMandatoryAuthentication = (
            options.authMode === 'MandatoryAuthentication');
    }

    var invalidHeaders = validateHeaders(res.headers);
    if (invalidHeaders) {
        cb(new Error('Headers are missing or invalid: ' +
            invalidHeaders), null, res);
        return;
    }

    var algorithm = getAlgorithm(res.headers['m-encrypt-cipher']);
    if (!algorithm) {
        cb(new Error('Unsupported cipher algorithm: ' +
            res.headers['m-encrypt-cipher']), null, res);
        return;
    }

    var hmacType = null;
    if (!algorithm.tagBytes) {
        hmacType = getHmacType(res.headers['m-encrypt-hmac-type']);
        if (util.isError(hmacType)) {
            cb(hmacType, null, res);
            return;
        }
    }

    options.getKey(res.headers['m-encrypt-key-id'], function (err, key) {
        if (err) {
            cb(new VError(err, 'failed executing options.getKey'), null, res);
            return;
        }

        var iv = new Buffer(res.headers['m-encrypt-iv'], 'base64');
        var decipher = crypto.createDecipheriv(algorithm.string, key, iv);
        var hmac = null;

        if (!algorithm.tagBytes) {
            hmac = crypto.createHmac(hmacType.algorithm, key);
            hmac.update(iv);
        }

        var parseEtMStream = new ParseEtMStream(hmacType,
            res.headers['content-length'], algorithm.tagBytes);
        var output = new PassThrough();
        var passThrough = new PassThrough();
        var byteLength = 0;

        // Only used for AEAD ciphers
        var bufferedForAuth = new Buffer('');
        var isTagSet = false;
        function handleParseTag(authTag) {
            decipher.setAuthTag(authTag);
            isTagSet = true;
            if (bufferedForAuth.length) {
                var decrypted = decipher.update(bufferedForAuth);

                if (decrypted.length) {
                    passThrough.write(decrypted);
                    bufferedForAuth = new Buffer('');
                }
            }
        }

        // Write cipher data to decipher and pass to passThrough stream
        function handleEtmData(data) {
            // AEAD requires the auth tag when authenticating the request
            if (algorithm.tagBytes && isMandatoryAuthentication && !isTagSet) {
                bufferedForAuth = Buffer.concat([bufferedForAuth, data]);
                return;
            }

            var decrypted = decipher.update(data);
            if (decrypted.length) {
                passThrough.write(decrypted);
            }
        }

        function handlePassThroughData(data) {
            byteLength += Buffer.byteLength(data);

            if (hmac) {
                hmac.update(data);
            }
        }

        function handleEtmFinish() {
            // final called for AEAD after setting the auth tag
            if (!algorithm.tagBytes) {
                passThrough.write(decipher.final());
            }

            // Indicate that we are done writing to passThrough
            passThrough.end();
        }

        function handleEncryptedError(streamErr) {
            parseEtMStream.removeListener('tag', handleParseTag);
            parseEtMStream.removeListener('data', handleEtmData);
            parseEtMStream.removeListener('finish', handleEtmFinish);
            decipher.removeListener('error', handleDecipherError);
            passThrough.removeListener('end', handlePassThroughEnd);
            passThrough.removeListener('data', handlePassThroughData);

            output.emit('error', new VError(streamErr,
                'failed to read encrypted data'));
        }

        function handleDecipherError(decipherErr) {
            passThrough.removeListener('data', handlePassThroughData);
            passThrough.removeListener('end', handlePassThroughEnd);
            output.emit('error', new VError(decipherErr,
                'failed to write to decipher'));
        }

        function handlePassThroughEnd(data) {
            if (!algorithm.tagBytes && !isRangeRequest) {
                var digest = hmac.digest();
                if (digest.compare(parseEtMStream.digest()) !== 0) {
                    output.emit('error', new Error('cipher hmac doesn\'t ' +
                        'match stored hmac value'));
                    return;
                }
            } else if (algorithm.tagBytes && isMandatoryAuthentication) {
                try {
                    decipher.final();
                } catch (authErr) {
                    output.emit('error', authErr);
                }
            }

            var origLength = res.headers['m-encrypt-plaintext-content-length'];
            if (!isRangeRequest && origLength &&
                byteLength !== parseInt(origLength, 10)) {

                output.emit('error', new Error(
                    'decrypted file size doesn\'t match original copy'));
                return;
            }

            // Overwrite the content-length with the decrypted byte length
            res.headers['content-length'] = byteLength;
        }

        var decErr = decryptMetadata(algorithm, hmacType, res.headers, key);
        if (decErr) {
            cb(decErr, null, res);
            return;
        }

        encrypted.once('error', handleEncryptedError);
        parseEtMStream.on('data', handleEtmData);
        parseEtMStream.once('finish', handleEtmFinish);
        passThrough.on('data', handlePassThroughData);
        passThrough.once('end', handlePassThroughEnd);
        decipher.once('error', handleDecipherError);

        cb(null, output, res);

        if (algorithm.tagBytes && !isRangeRequest) {
            parseEtMStream.once('tag', handleParseTag);
        }

        encrypted.pipe(parseEtMStream);
        passThrough.pipe(output);
    });
};


/**
 * Encrypt a readable stream and any e-header headers.
 *
 * Parameters:
 *  - options:
 *      - cipher: (string) encryption algorithm to use, refer to RFD 71 for list
 *      - key: (string) raw encryption key value
 *      - keyId: (string) identifier for the key, will be saved with object
 *      - hmacType: (string) type of hmac algorithm to use
 *      - contentLength: (number) original size of input stream in bytes
 *      - headers: (object) raw request headers, *will be mutated*
 *          - "e-header" headers are encrypted and deleted
 *  - input: readable stream to encrypt
 *  - cb: callback of the form f(err, output)
 */
exports.encrypt = function encrypt(options, input, cb) {
    assert.object(options, 'options');
    assert.stream(input, 'input');
    assert.string(options.cipher, 'options.cipher');
    assert.string(options.key, 'options.key');
    assert.string(options.keyId, 'options.keyId');
    assert.optionalString(options.hmacType, 'options.hmacType');
    assert.optionalNumber(options.contentLength, 'options.contentLength');
    assert.object(options.headers, 'options.headers');

    var algorithm = getAlgorithm(options.cipher);
    if (!algorithm) {
        throw new Error('Unsupported cipher algorithm: ' + options.cipher);
    }

    assert.ok(Buffer.byteLength(options.key) === algorithm.keyBytes,
        'key size must be ' + algorithm.keyBytes + ' bytes');

    var hmacType = getHmacType(options.hmacType || 'HmacSHA256');
    if (util.isError(hmacType)) {
        throw hmacType;
    }

    var iv = crypto.randomBytes(algorithm.ivBytes);
    var cipher = crypto.createCipheriv(algorithm.string, options.key, iv);
    var hmac = null;
    var output = new PassThrough();

    // only calculate hmac when not using AEAD cipher
    if (!algorithm.tagBytes) {
        options.headers['m-encrypt-hmac-type'] = hmacType.type;
        hmac = crypto.createHmac(hmacType.algorithm, options.key);
        hmac.update(iv);
        input.on('data', handleInputData);
    } else {
        options.headers['m-encrypt-aead-tag-length'] = algorithm.tagBytes;
    }

    function handleInputData(data) {
        hmac.update(data);
    }

    cipher.once('error', function (err) {
        input.removeListener('data', handleInputData);
        output.emit('error', new VError(err, 'failed reading cipher'));
    });

    cipher.once('end', function (data) {
        // when the algorithm is an AEAD one, write the auth tag
        if (algorithm.tagBytes) {
            var authTag = cipher.getAuthTag();
            if (!authTag) {
                output.emit('error', new Error('Failed to get auth tag'));
            } else {
                output.write(authTag);
            }
        } else {
          var digest = hmac.digest();
          assert.ok(Buffer.byteLength(digest) === hmacType.bytes,
              'hmac digest not expected size. expected bytes: ' +
              hmacType.bytes + ', actual bytes: ' + Buffer.byteLength(digest));

          // Append the digest to the end of the payload
          output.write(digest);
        }
    });

    var originalContentLength = options.contentLength ||
      options.headers['content-length'];

    // If not chunked encoding, calculate content-length with hmac/auth bytes
    if (originalContentLength) {
        calculateContentLength(originalContentLength, options.headers,
            algorithm, hmacType.bytes);
    }

    options.headers['m-encrypt-type'] = 'client/' + VERSION;
    options.headers['m-encrypt-key-id'] = options.keyId;
    options.headers['m-encrypt-iv'] = new Buffer(iv).toString('base64');
    options.headers['m-encrypt-cipher'] = options.cipher;

    encryptMetadata(algorithm, hmacType, options.headers, options.key);
    input.pipe(cipher).pipe(output);
    cb(null, output);
};


/**
 * Determines if the response is encrypted and can be decrypted by this module
 *
 * Parameters:
 *  - headers: (object) raw response headers
 * Returns:
 *  boolean indicating if the response is encrypted and if this module can
 *      decrypt the response.
 */
exports.isSupported = function isSupported(headers) {
    var encTypes = headers['m-encrypt-type'] ?
        headers['m-encrypt-type'].split('/') : [];

    assert.ok(encTypes.length === 0 || encTypes.length === 2, 'm-encrypt-type' +
        ' header must have a single / separator');

    return (encTypes[0] === 'client' && isSupportedVersion(encTypes[1]));
};


function isSupportedVersion(version) {
    if (!/\d/.test(version)) {
        return (false);
    }

    var major = parseInt(version, 10);

    return (major === VERSION);
}


function validateHeaders(headers) {
    var missingHeaders = [];
    REQUIRED_HEADERS.forEach(function (header) {
        if (headers[header] === undefined || headers[header] === null) {
            missingHeaders.push(header);
        }
    });

    return (missingHeaders.length ? missingHeaders : null);
}


function decryptMetadata(algorithm, hmacType, headers, key) {
    if (!headers['m-encrypt-metadata']) {
        return (false);
    }

    var decipher = crypto.createDecipheriv(algorithm.string, key,
        new Buffer(headers['m-encrypt-metadata-iv'], 'base64'));
    var encrypted = new Buffer(headers['m-encrypt-metadata'], 'base64');
    var hmac = null;

    if (algorithm.tagBytes) {
        var offset = Buffer.byteLength(encrypted) - algorithm.tagBytes;
        var authTag = encrypted.slice(offset);

        encrypted = encrypted.slice(0, offset);
        decipher.setAuthTag(authTag);
    } else {
        hmac = crypto.createHmac(hmacType.algorithm, key);
        hmac.update(encrypted);
        if (headers['m-encrypt-metadata-hmac'] !== hmac.digest('base64')) {
            return (new Error('m-encrypt-metadata-hmac doesn\'t match'));
        }
    }

    var decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    var deserializedHeaders = deserializeHeaders(decrypted.toString());
    var headerKeys = Object.keys(deserializedHeaders) || [];
    for (var i = 0, il = headerKeys.length; i < il; ++i) {
        var headerKey = headerKeys[i];
        var value = deserializedHeaders[headerKey];
        headers[headerKey] = value;
    }

    delete headers['m-encrypt-metadata-iv'];
    delete headers['m-encrypt-metadata-hmac'];
    delete headers['m-encrypt-metadata'];
    delete headers['m-encrypt-metadata-aead-tag-length'];

    if (headers['e-content-type']) {
        headers['content-type'] = headers['e-content-type'];
        delete headers['e-content-type'];
    }

    // style dictates we must always return a value, false indicates success
    return (false);
}


function encryptMetadata(algorithm, hmacType, headers, key) {
    var iv = crypto.randomBytes(algorithm.ivBytes);
    headers['m-encrypt-metadata-iv'] = new Buffer(iv).toString('base64');
    var cipher = crypto.createCipheriv(algorithm.string, key, iv);
    var hmac = crypto.createHmac(hmacType.algorithm, key);

    var keysToEncrypt = [];
    var headersToEncrypt = {};
    Object.keys(headers).forEach(function (headerKey) {
        if (METADATA_PATTERN.test(headerKey)) {
            keysToEncrypt.push(headerKey);
            headersToEncrypt[headerKey] = headers[headerKey];
        }
    });

    var serializedHeaders = serializeHeaders(headersToEncrypt);
    var encrypted = cipher.update(serializedHeaders);

    encrypted = Buffer.concat([encrypted, cipher.final()]);
    if (algorithm.tagBytes) {
        headers['m-encrypt-metadata-aead-tag-length'] = algorithm.tagBytes;
        encrypted = Buffer.concat([encrypted, cipher.getAuthTag()]);
    } else {
        hmac.update(encrypted);
        headers['m-encrypt-metadata-hmac'] = hmac.digest('base64');
    }

    headers['m-encrypt-metadata'] = encrypted.toString('base64');

    keysToEncrypt.forEach(function (keyToDelete) {
        delete headers[keyToDelete];
    });
}


function serializeHeaders(headers) {
    var result = '';
    var keys = Object.keys(headers) || [];
    for (var i = 0, il = keys.length; i < il; ++i) {
        var key = keys[i];
        var value = headers[key];
        result += key + ': ' + value + '\n';
    }

    return (result);
}


function deserializeHeaders(serializedHeaders) {
    var result = {};
    var headers = serializedHeaders.split('\n') || [];
    headers.forEach(function (headerStr) {
        var header = headerStr.split(': ');
        var key = header[0];
        var value = header[1];
        if (key !== '') {
            result[key] = value;
        }
    });

    return (result);
}


function getAlgorithm(cipher) {
    cipher = cipher.toUpperCase();
    return (CIPHERS.hasOwnProperty(cipher) && CIPHERS[cipher]);
}


function getHmacType(hmac) {
    hmac = hmac.toLowerCase();
    for (var i = 0, il = HMACS.length; i < il; ++i) {
        var hmacType = HMACS[i];
        if (hmacType.type.toLowerCase() === hmac) {
            return (hmacType);
        }
    }

    var validHmacs = HMACS.map(function (hmacObj) {
        return (hmacObj.type);
    });

    return new Error('Unsupported HMAC: ' + hmac + '. Valid HMACs are ' +
        validHmacs.join(', '));
}


function calculateContentLength(originalContentLength, headers, algorithm,
    hmacBytes) {

    originalContentLength = parseInt(originalContentLength, 10) || 0;
    headers['m-encrypt-plaintext-content-length'] = originalContentLength;

    var tagOrHmacBytes = (algorithm.tagBytes || hmacBytes);
    var calculatedContentLength = originalContentLength + tagOrHmacBytes;

    // Calculate content-length for padded algorithms
    if (algorithm.isPadded) {
        var padding = 0;
        if (originalContentLength > algorithm.blockBytes) {
            padding = originalContentLength % algorithm.blockBytes;
        } else {
            calculatedContentLength = algorithm.blockBytes;
        }

        // e.g. content is 20 bytes, block is 16, padding is 4, result = 32
        if (padding) {
            calculatedContentLength = (originalContentLength - padding) +
                algorithm.blockBytes;
        }

        calculatedContentLength += tagOrHmacBytes;
    }

    headers['content-length'] = calculatedContentLength;
}

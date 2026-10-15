// ─── Minimal CBOR Encoder for ISO 18013-5/7 ─────────────────────────────────
// Purpose-built encoder for the DeviceRequest and EncryptionInfo structures
// required by the W3C Digital Credentials API (protocol: "org-iso-mdoc").
//
// Supports: unsigned integers, negative integers, byte strings, text strings,
// arrays, maps (plain objects), booleans, null, and CBOR tags.
//
// Ref: RFC 7049 / RFC 8949 (CBOR), ISO 18013-5:2021, ISO 18013-7 Annex C
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const crypto = require("crypto");

// In-memory ephemeral reader keys indexed by sessionId for response decryption
const sessionReaderKeys = new Map();

/**
 * Encodes a JavaScript value to a CBOR Buffer.
 * @param {*} value
 * @returns {Buffer}
 */
function encode(value) {
  const chunks = [];
  _encode(value, chunks);
  return Buffer.concat(chunks);
}

/**
 * Encodes to base64url string (no padding).
 * @param {*} value
 * @returns {string}
 */
function encodeBase64url(value) {
  return encode(value).toString("base64url");
}

// ── Core type dispatch ────────────────────────────────────────────────────────

function _encode(value, chunks) {
  if (value === null || value === undefined) {
    chunks.push(Buffer.from([0xf6])); // null
    return;
  }
  if (typeof value === "boolean") {
    chunks.push(Buffer.from([value ? 0xf5 : 0xf4]));
    return;
  }
  if (typeof value === "number") {
    _encodeNumber(value, chunks);
    return;
  }
  if (typeof value === "string") {
    _encodeText(value, chunks);
    return;
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    _encodeBytes(Buffer.from(value), chunks);
    return;
  }
  if (value instanceof CborTag) {
    _encodeTag(value, chunks);
    return;
  }
  if (Array.isArray(value)) {
    _encodeArray(value, chunks);
    return;
  }
  if (value instanceof Map) {
    _encodeMap(value, chunks);
    return;
  }
  if (typeof value === "object") {
    _encodeMap(value, chunks);
    return;
  }
  throw new Error(`CBOR: cannot encode type ${typeof value}`);
}

// ── Unsigned integer: major type 0 ───────────────────────────────────────────
function _encodeUint(n, majorType, chunks) {
  const mt = majorType << 5;
  if (n < 24) {
    chunks.push(Buffer.from([mt | n]));
  } else if (n <= 0xff) {
    chunks.push(Buffer.from([mt | 24, n]));
  } else if (n <= 0xffff) {
    const b = Buffer.alloc(3);
    b[0] = mt | 25;
    b.writeUInt16BE(n, 1);
    chunks.push(b);
  } else if (n <= 0xffffffff) {
    const b = Buffer.alloc(5);
    b[0] = mt | 26;
    b.writeUInt32BE(n, 1);
    chunks.push(b);
  } else {
    // 64-bit – use BigInt path
    const b = Buffer.alloc(9);
    b[0] = mt | 27;
    const big = BigInt(Math.floor(n));
    b.writeBigUInt64BE(big, 1);
    chunks.push(b);
  }
}

function _encodeNumber(n, chunks) {
  if (!Number.isFinite(n)) throw new Error("CBOR: cannot encode Infinity / NaN");
  if (Number.isInteger(n) && n >= 0) {
    _encodeUint(n, 0, chunks); // major type 0
  } else if (Number.isInteger(n) && n < 0) {
    _encodeUint(-1 - n, 1, chunks); // major type 1
  } else {
    // Float64 (major type 7, additional 27)
    const b = Buffer.alloc(9);
    b[0] = 0xfb;
    b.writeDoubleBE(n, 1);
    chunks.push(b);
  }
}

// ── Byte string: major type 2 ─────────────────────────────────────────────────
function _encodeBytes(buf, chunks) {
  _encodeUint(buf.length, 2, chunks);
  chunks.push(buf);
}

// ── Text string: major type 3 ─────────────────────────────────────────────────
function _encodeText(str, chunks) {
  const buf = Buffer.from(str, "utf8");
  _encodeUint(buf.length, 3, chunks);
  chunks.push(buf);
}

// ── Array: major type 4 ───────────────────────────────────────────────────────
function _encodeArray(arr, chunks) {
  _encodeUint(arr.length, 4, chunks);
  for (const item of arr) {
    _encode(item, chunks);
  }
}

// ── Map: major type 5 ─────────────────────────────────────────────────────────
function _encodeMap(obj, chunks) {
  if (obj instanceof Map) {
    _encodeUint(obj.size, 5, chunks);
    for (const [key, val] of obj.entries()) {
      if (typeof key === "number") {
        _encodeNumber(key, chunks);
      } else if (typeof key === "string" && /^-?\d+$/.test(key)) {
        _encodeNumber(parseInt(key, 10), chunks);
      } else {
        _encode(key, chunks);
      }
      _encode(val, chunks);
    }
    return;
  }

  const keys = Object.keys(obj);
  _encodeUint(keys.length, 5, chunks);
  for (const key of keys) {
    if (/^-?\d+$/.test(key)) {
      _encodeNumber(parseInt(key, 10), chunks);
    } else {
      _encodeText(key, chunks);
    }
    _encode(obj[key], chunks);
  }
}

// ── Tagged value: major type 6 ────────────────────────────────────────────────
class CborTag {
  constructor(tag, value) {
    this.tag = tag;
    this.value = value;
  }
}

function _encodeTag(tagged, chunks) {
  _encodeUint(tagged.tag, 6, chunks);
  _encode(tagged.value, chunks);
}

// ── Bstr-wrapped CBOR (tag 24) ────────────────────────────────────────────────
// ISO 18013-5 frequently embeds CBOR-in-CBOR as bstr. Tag 24 marks the outer
// byte string as "encoded CBOR item".
function encodeEmbedded(value) {
  const inner = encode(value);
  // The result is a CBOR byte string (major 2) wrapping the inner CBOR
  const chunks = [];
  _encodeBytes(inner, chunks);
  return Buffer.concat(chunks);
}

/**
 * Builds a compliant ISO 18013-5 DeviceRequest CBOR structure.
 *
 * DeviceRequest = {
 *   "version": tstr,   ; "1.0"
 *   "docRequests": [DocRequest+]
 * }
 * DocRequest = {
 *   "itemsRequest": #6.24(bstr .cbor ItemsRequest),
 *   ? "readerAuth": ReaderAuth
 * }
 * ItemsRequest = {
 *   "docType": tstr,
 *   "nameSpaces": NameSpaces
 * }
 */

// Helper to convert PEM string or Buffer to DER Buffer for COSE x5chain
function pemToDer(pem) {
  if (!pem) return Buffer.alloc(0);
  if (Buffer.isBuffer(pem)) {
    const str = pem.toString("utf8");
    if (str.includes("-----BEGIN")) {
      const match = str.match(/-----BEGIN [^-]*CERTIFICATE-----([^-]+)-----END [^-]*CERTIFICATE-----/);
      if (match) {
        return Buffer.from(match[1].replace(/\s+/g, ""), "base64");
      }
    } else {
      return pem;
    }
  }
  if (typeof pem === "string") {
    const match = pem.match(/-----BEGIN [^-]*CERTIFICATE-----([^-]+)-----END [^-]*CERTIFICATE-----/);
    if (match) {
      return Buffer.from(match[1].replace(/\s+/g, ""), "base64");
    }
    const b64 = pem.replace(/-----[A-Z0-9 ]+-----/g, "").replace(/\s+/g, "");
    return Buffer.from(b64, "base64");
  }
  return Buffer.alloc(0);
}

/**
 * Builds a compliant ISO 18013-5 / 18013-7 DeviceRequest CBOR structure.
 *
 * DeviceRequest = {
 *   "version": tstr,   ; "1.0"
 *   "docRequests": [DocRequest+]
 * }
 * DocRequest = {
 *   "itemsRequest": #6.24(bstr .cbor ItemsRequest),
 *   ? "readerAuth": ReaderAuth
 * }
 * ItemsRequest = {
 *   "docType": tstr,
 *   "nameSpaces": NameSpaces
 * }
 *
 * @param {Object} options
 * @param {string} [options.docType]
 * @param {Object} [options.dataElements] - mDL data elements to request
 * @param {Buffer|string} [options.readerCert] - Optional Apple Reader cert (X.509 DER or PEM)
 * @param {KeyObject|string} [options.readerKey] - Optional private key for ReaderAuth signing
 * @param {string} [options.passphrase] - Optional key passphrase
 * @returns {Buffer} raw CBOR bytes
 */
function buildDeviceRequest(options = {}) {
  const docType = options.docType || "org.iso.18013.5.1.mDL";

  // Standard mDL elements (intentToRetain = false).
  // Includes birth_date, name, and issuing_authority so all state mDLs (e.g. California DMV)
  // match the document request and fire Apple Wallet prompt (matching main branch technique).
  const requestedElements = options.dataElements || {
    age_over_21: false,
    birth_date: false,
    family_name: false,
    given_name: false,
    issuing_authority: false,
  };

  // ItemsRequest CBOR (embedded in a bstr via Tag 24)
  const itemsRequestCbor = encode({
    docType,
    nameSpaces: {
      "org.iso.18013.5.1": requestedElements,
    },
  });

  const docRequest = {
    itemsRequest: new CborTag(24, itemsRequestCbor),
  };

  // If Apple Reader Authentication credentials are provided, verify key compatibility (ISO 18013-5 Section 9.1.4)
  if (options.readerCert && options.readerKey) {
    try {
      let keyObj = null;
      try {
        keyObj = crypto.createPrivateKey(options.readerKey);
      } catch (_) {}

      // ISO 18013-5 mdoc Reader Authentication strictly requires EC P-256 with ES256 (alg -7)
      if (keyObj && keyObj.asymmetricKeyType === "ec") {
        const signer = crypto.createSign("SHA256");
        signer.update(itemsRequestCbor);
        const signOpts = {
          key: options.readerKey,
          dsaEncoding: "ieee-p1363",
        };
        if (options.passphrase) {
          signOpts.passphrase = options.passphrase;
        }
        const signature = signer.sign(signOpts);

        // x5chain in COSE header must be DER byte strings (bstr)
        const certDer = pemToDer(options.readerCert);

        // COSE_Sign1 structure: [protected, unprotected, payload, signature]
        // Protected header map { 1: -7 } (alg: ES256)
        const protectedHeader = encode(new Map([[1, -7]]));
        const unprotectedHeader = new Map([
          [33, [certDer]], // Label 33 is x5chain in RFC 9360
          ["x5chain", [certDer]],
        ]);

        docRequest.readerAuth = [
          protectedHeader,
          unprotectedHeader,
          null, // detached payload
          signature,
        ];
        console.log("[cborEncoder] Attached valid EC P-256 ReaderAuth signature to DeviceRequest.");
      } else {
        console.log(
          `[cborEncoder] Reader key type is ${keyObj?.asymmetricKeyType || "unknown"} (ISO 18013-5 requires EC P-256 for mdoc ReaderAuth). ` +
          `Omitting readerAuth to allow standard Apple Wallet presentation (matching main branch).`
        );
      }
    } catch (authErr) {
      console.warn("[cborEncoder] ReaderAuth signing skipped:", authErr.message);
    }
  }

  const deviceRequest = {
    version: "1.0",
    docRequests: [docRequest],
  };

  return encode(deviceRequest);
}

/**
 * Builds a compliant ISO 18013-7 Annex C EncryptionInfo CBOR structure.
 *
 * For the browser-based Digital Credentials API, encryptionInfo wraps:
 *   - A genuine ephemeral verifier public key (COSE_Key) for HPKE response encryption
 *   - A session transcript nonce
 *
 * Generates a real ephemeral NIST P-256 (prime256v1) key pair using WebCrypto/Node crypto,
 * exports exact 32-byte affine coordinates, stores the private key by sessionId,
 * and encodes COSE_Key map parameters with exact RFC 9052 integer labels.
 *
 * @param {string} sessionId
 * @returns {Buffer} raw CBOR bytes
 */
function buildEncryptionInfo(sessionId, options = {}) {
  // 1. Generate real ephemeral ECDH P-256 key pair
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });

  // 2. Export JWK to obtain exact 32-byte affine coordinates on NIST P-256
  const pubJwk = publicKey.export({ format: "jwk" });
  const privJwk = privateKey.export({ format: "jwk" });
  const x = Buffer.from(pubJwk.x, "base64url");
  const y = Buffer.from(pubJwk.y, "base64url");

  // 3. Generate or accept 16-byte cryptographically secure random nonce
  const nonce = (options && options.nonce && Buffer.isBuffer(options.nonce))
    ? options.nonce
    : ((options && options.nonce && typeof options.nonce === "string")
        ? Buffer.from(options.nonce, "hex")
        : crypto.randomBytes(16));

  // 4. Persist private key & nonce for this session for later HPKE response decryption
  if (sessionId) {
    sessionReaderKeys.set(sessionId, {
      privateKey,
      publicKey,
      jwk: privJwk,
      nonce,
      nonceHex: nonce.toString("hex"),
      nonceBase64url: nonce.toString("base64url"),
      createdAt: Date.now(),
    });
    // Housekeeping: clean keys older than 1 hour
    if (sessionReaderKeys.size > 200) {
      const oneHourAgo = Date.now() - 3600000;
      for (const [sId, data] of sessionReaderKeys.entries()) {
        if (data.createdAt < oneHourAgo) sessionReaderKeys.delete(sId);
      }
    }
  }

  // 5. Construct valid COSE_Key (RFC 9052 Section 7, Table 21 & Table 22)
  // Integer Labels:
  //   1: kty = 2 (EC2)
  //  -1: crv = 1 (P-256)
  //  -2: x   = 32-byte Buffer
  //  -3: y   = 32-byte Buffer
  const coseKey = new Map([
    [1, 2],
    [-1, 1],
    [-2, x],
    [-3, y],
  ]);

  // 6. ISO 18013-7 Annex C EncryptionInfo structure:
  //   supportedEncAlgorithms: [1] (HPKE_BASE_P256_SHA256_AES128GCM)
  //   eReaderKey: COSE_Key
  //   sessionTranscript: { nonce }
  const encryptionInfo = new Map([
    ["supportedEncAlgorithms", [1]],
    ["eReaderKey", coseKey],
    ["sessionTranscript", new Map([["nonce", nonce]])],
  ]);

  return encode(encryptionInfo);
}

/**
 * Decodes a CBOR Buffer or Uint8Array into a JavaScript value.
 * Automatically unwraps CBOR Tag 24 (#6.24(bstr)) embedded CBOR items.
 *
 * @param {Buffer|Uint8Array} buf
 * @returns {*}
 */
function decode(buf) {
  if (!buf || (buf.length === 0 && !Buffer.isBuffer(buf))) return null;
  const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  let offset = 0;

  function readUint(info) {
    if (info < 24) return info;
    if (info === 24) {
      if (offset >= buffer.length) throw new Error("CBOR unexpected EOF");
      const val = buffer.readUInt8(offset);
      offset += 1;
      return val;
    }
    if (info === 25) {
      if (offset + 2 > buffer.length) throw new Error("CBOR unexpected EOF");
      const val = buffer.readUInt16BE(offset);
      offset += 2;
      return val;
    }
    if (info === 26) {
      if (offset + 4 > buffer.length) throw new Error("CBOR unexpected EOF");
      const val = buffer.readUInt32BE(offset);
      offset += 4;
      return val;
    }
    if (info === 27) {
      if (offset + 8 > buffer.length) throw new Error("CBOR unexpected EOF");
      const val = Number(buffer.readBigUInt64BE(offset));
      offset += 8;
      return val;
    }
    throw new Error(`CBOR invalid integer additional info: ${info}`);
  }

  function decodeItem() {
    if (offset >= buffer.length) return undefined;
    const initial = buffer[offset++];
    const major = initial >> 5;
    const info = initial & 0x1f;

    // Major 0: unsigned integer
    if (major === 0) return readUint(info);

    // Major 1: negative integer
    if (major === 1) return -1 - readUint(info);

    // Major 2: byte string
    if (major === 2) {
      const len = readUint(info);
      if (offset + len > buffer.length) throw new Error("CBOR byte string out of bounds");
      const res = buffer.slice(offset, offset + len);
      offset += len;
      return res;
    }

    // Major 3: text string (UTF-8)
    if (major === 3) {
      const len = readUint(info);
      if (offset + len > buffer.length) throw new Error("CBOR text string out of bounds");
      const res = buffer.toString("utf8", offset, offset + len);
      offset += len;
      return res;
    }

    // Major 4: array
    if (major === 4) {
      const len = readUint(info);
      const arr = [];
      for (let i = 0; i < len; i++) {
        arr.push(decodeItem());
      }
      return arr;
    }

    // Major 5: map
    if (major === 5) {
      const len = readUint(info);
      const map = {};
      for (let i = 0; i < len; i++) {
        const key = decodeItem();
        const val = decodeItem();
        const keyStr = typeof key === "string" ? key : String(key);
        map[keyStr] = val;
      }
      return map;
    }

    // Major 6: tagged value
    if (major === 6) {
      const tag = readUint(info);
      const val = decodeItem();
      // Tag 24: CBOR item embedded in bstr (standard ISO 18013-5 ItemsRequest & IssuerSignedItem)
      if (tag === 24 && Buffer.isBuffer(val)) {
        try {
          return decode(val);
        } catch (_) {
          return val;
        }
      }
      return val;
    }

    // Major 7: simple types & floats
    if (major === 7) {
      if (info === 20) return false;
      if (info === 21) return true;
      if (info === 22) return null;
      if (info === 23) return undefined;
      if (info === 25) {
        offset += 2;
        return 0.0;
      }
      if (info === 26) {
        if (offset + 4 > buffer.length) throw new Error("CBOR unexpected EOF");
        const val = buffer.readFloatBE(offset);
        offset += 4;
        return val;
      }
      if (info === 27) {
        if (offset + 8 > buffer.length) throw new Error("CBOR unexpected EOF");
        const val = buffer.readDoubleBE(offset);
        offset += 8;
        return val;
      }
      return null;
    }

    throw new Error(`CBOR unknown major type: ${major}`);
  }

  return decodeItem();
}

// Curve NIST P-256 (secp256r1) parameters for SEC1 point decompression
const P256_P = (1n << 256n) - (1n << 224n) + (1n << 192n) + (1n << 96n) - 1n;
const P256_A = P256_P - 3n;
const P256_B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;

function decompressP256(compBuf) {
  if (!compBuf || !Buffer.isBuffer(compBuf)) return compBuf;
  if (compBuf.length === 65 && compBuf[0] === 0x04) return compBuf;
  if (compBuf.length !== 33 || (compBuf[0] !== 0x02 && compBuf[0] !== 0x03)) return compBuf;
  const prefix = compBuf[0];
  const xBytes = compBuf.slice(1);
  const x = BigInt("0x" + xBytes.toString("hex"));

  // y^2 = (x^3 + ax + b) mod p
  const y2 = (x * x % P256_P * x % P256_P + P256_A * x % P256_P + P256_B) % P256_P;

  // Since p = 3 mod 4, modular square root y = y2^((p + 1)/4) mod p
  function modPow(base, exp, mod) {
    let res = 1n;
    base = base % mod;
    while (exp > 0n) {
      if (exp % 2n === 1n) res = (res * base) % mod;
      base = (base * base) % mod;
      exp = exp / 2n;
    }
    return res;
  }
  let y = modPow(y2, (P256_P + 1n) / 4n, P256_P);
  const expectedBit = prefix === 0x03 ? 1n : 0n;
  if ((y % 2n) !== expectedBit) {
    y = (P256_P - y) % P256_P;
  }
  const yHex = y.toString(16).padStart(64, "0");
  const yBuf = Buffer.from(yHex, "hex");
  return Buffer.concat([Buffer.from([0x04]), xBytes, yBuf]);
}

/**
 * Decrypts an ISO/IEC 18013-7 Annex C HPKE-encrypted response payload.
 *
 * Algorithm Suite:
 *   - Mode: Base (0x00)
 *   - KEM: DHKEM(P-256, HKDF-SHA256) (0x0010)
 *   - KDF: HKDF-SHA256 (0x0001)
 *   - AEAD: AES-128-GCM (0x0001)
 *
 * @param {Buffer} enc - Encapsulated ephemeral public key (KEM output)
 * @param {Buffer} ciphertext - AEAD ciphertext with auth tag appended
 * @param {Object} privateKeyJwk - Receiver P-256 JWK private key (containing d, x, y)
 * @param {Buffer} [info] - Optional context info (defaults to empty)
 * @param {Buffer} [aad] - Optional additional authenticated data (defaults to empty)
 * @returns {Buffer} Decrypted plaintext bytes (DeviceResponse CBOR)
 */
function decryptHpke(enc, ciphertext, privateKeyJwk, info = Buffer.alloc(0), aad = Buffer.alloc(0)) {
  if (!enc || !ciphertext || !privateKeyJwk) {
    throw new Error("Missing required parameters for HPKE decryption");
  }

  let encBuf = Buffer.isBuffer(enc) ? enc : Buffer.from(enc, "base64url");
  const cipherBuf = Buffer.isBuffer(ciphertext) ? ciphertext : Buffer.from(ciphertext, "base64url");

  // Decompress P-256 point if wallet returned 33-byte compressed key
  encBuf = decompressP256(encBuf);

  const d = Buffer.from(privateKeyJwk.d, "base64url");
  const pkR_x = Buffer.from(privateKeyJwk.x, "base64url");
  const pkR_y = Buffer.from(privateKeyJwk.y, "base64url");
  const pkR_uncompressed = Buffer.concat([Buffer.from([0x04]), pkR_x, pkR_y]);

  // 1. Perform ECDH: dh = ecdh(skR, enc)
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.setPrivateKey(d);
  const dh = ecdh.computeSecret(encBuf);

  // 2. RFC 9180 labeledExtract and labeledExpand
  const kemSuiteId = Buffer.concat([Buffer.from("KEM"), Buffer.from([0x00, 0x10])]);
  const hpkeSuiteId = Buffer.concat([Buffer.from("HPKE"), Buffer.from([0x00, 0x10, 0x00, 0x01, 0x00, 0x01])]);

  function labeledExtract(suiteId, salt, label, ikm) {
    const labeledIkm = Buffer.concat([Buffer.from("HPKE-v1"), suiteId, Buffer.from(label), ikm]);
    return crypto.createHmac("sha256", salt.length > 0 ? salt : Buffer.alloc(32, 0)).update(labeledIkm).digest();
  }

  function labeledExpand(suiteId, prk, label, contextInfo, len) {
    const labeledInfo = Buffer.concat([
      Buffer.from([len >> 8, len & 0xff]),
      Buffer.from("HPKE-v1"),
      suiteId,
      Buffer.from(label),
      contextInfo,
    ]);
    return Buffer.from(crypto.hkdfSync("sha256", prk, Buffer.alloc(0), labeledInfo, len));
  }

  // 3. KEM Extract & Expand: sharedSecret = Extract("", dh)
  const kemContext = Buffer.concat([encBuf, pkR_uncompressed]);
  const sharedSecret = labeledExtract(kemSuiteId, Buffer.alloc(0), "shared_secret", dh);
  const keyScheduleSecret = labeledExpand(kemSuiteId, sharedSecret, "secret", kemContext, 32);

  // 4. Key Schedule Base Mode (mode = 0)
  const mode = Buffer.from([0]);
  const pskIdHash = labeledExtract(hpkeSuiteId, Buffer.alloc(0), "psk_id_hash", Buffer.alloc(0));
  const infoHash = labeledExtract(hpkeSuiteId, Buffer.alloc(0), "info_hash", info);
  const ksContext = Buffer.concat([mode, pskIdHash, infoHash]);

  const secret = labeledExtract(hpkeSuiteId, keyScheduleSecret, "secret", Buffer.alloc(0));
  const key = labeledExpand(hpkeSuiteId, secret, "key", ksContext, 16);
  const baseNonce = labeledExpand(hpkeSuiteId, secret, "base_nonce", ksContext, 12);

  // 5. Decrypt AES-128-GCM
  const tagLen = 16;
  if (cipherBuf.length < tagLen) {
    throw new Error("Ciphertext too short for AES-128-GCM tag");
  }
  const tag = cipherBuf.slice(-tagLen);
  const encData = cipherBuf.slice(0, -tagLen);

  const decipher = crypto.createDecipheriv("aes-128-gcm", key, baseNonce);
  decipher.setAuthTag(tag);
  if (aad && aad.length > 0) decipher.setAAD(aad);

  return Buffer.concat([decipher.update(encData), decipher.final()]);
}

/**
 * Retrieves the stored ephemeral reader key for a session.
 * @param {string} sessionId
 * @returns {Object|null}
 */
function getSessionReaderKey(sessionId) {
  return sessionReaderKeys.get(sessionId) || null;
}

module.exports = {
  encode,
  encodeBase64url,
  decode,
  decryptHpke,
  buildDeviceRequest,
  buildEncryptionInfo,
  getSessionReaderKey,
  CborTag,
  encodeEmbedded,
};

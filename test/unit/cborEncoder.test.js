const test = require("node:test");
const assert = require("node:assert");
const cbor = require("../../server/services/cborEncoder");
const appleCertManager = require("../../server/services/appleCertManager");

test("cborEncoder - ISO 18013-5 & 18013-7 Structures", async (t) => {
  appleCertManager.init();
  const creds = appleCertManager.getReaderCredentials();

  await t.test("encodes and decodes standard primitive data types", () => {
    const original = {
      str: "PassGate mDL",
      num: 21,
      bool: true,
      arr: [1, 2, 3],
      nested: { age_over_21: true }
    };
    const encoded = cbor.encode(original);
    assert.ok(Buffer.isBuffer(encoded), "Encoded CBOR must be a Buffer");
    assert.ok(encoded.length > 0, "Encoded buffer must not be empty");

    const decoded = cbor.decode(encoded);
    assert.strictEqual(decoded.str, original.str);
    assert.strictEqual(decoded.num, original.num);
    assert.strictEqual(decoded.bool, original.bool);
    assert.deepStrictEqual(decoded.arr, original.arr);
    assert.strictEqual(decoded.nested.age_over_21, true);
  });

  await t.test("buildDeviceRequest generates valid ISO 18013-7 DeviceRequest structure", () => {
    const sessionNonce = "test-session-nonce-12345";
    const reqBuffer = cbor.buildDeviceRequest({
      docType: "org.iso.18013.5.1.mDL",
      requestedElements: {
        age_over_21: false,
        birth_date: false,
        family_name: false,
        given_name: false,
        issuing_authority: false,
      },
      sessionNonce,
      readerCertDer: creds.certDer,
      readerKeyPem: creds.key,
    });

    assert.ok(Buffer.isBuffer(reqBuffer), "DeviceRequest must be a buffer");
    assert.ok(reqBuffer.length > 50, "DeviceRequest buffer must have appropriate length");

    // Decode and verify top-level CBOR structure
    const decoded = cbor.decode(reqBuffer);
    assert.strictEqual(decoded.version, "1.0", "DeviceRequest version must be 1.0");
    assert.ok(Array.isArray(decoded.docRequests), "docRequests must be an array");
    assert.strictEqual(decoded.docRequests.length, 1, "Must contain exactly 1 docRequest");
  });

  await t.test("buildEncryptionInfo generates valid ISO 18013-7 EncryptionInfo Buffer and caches session key", () => {
    const encInfo = cbor.buildEncryptionInfo("test-session-cache-key");
    assert.ok(Buffer.isBuffer(encInfo), "EncryptionInfo must be a buffer");
    assert.ok(encInfo.length > 50, "EncryptionInfo buffer must have length > 50");

    // Decode CBOR structure
    const decoded = cbor.decode(encInfo);
    assert.ok(typeof decoded === "object", "Decoded EncryptionInfo must be an object/map");

    const key = cbor.getSessionReaderKey("test-session-cache-key");
    assert.ok(key, "Session key must be cached");
    assert.ok(key.jwk && key.jwk.x, "Cached public key x must exist");
    assert.ok(key.jwk && key.jwk.d, "Cached private key d must exist");
  });
});

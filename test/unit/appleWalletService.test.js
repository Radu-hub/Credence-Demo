const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const appleWalletService = require("../../server/services/appleWalletService");
const appleCertManager = require("../../server/services/appleCertManager");
const cbor = require("../../server/services/cborEncoder");

test("appleWalletService - Auth Options & Response Verification", async (t) => {
  appleCertManager.init();

  await t.test("generates valid ISO 18013-7 auth options", async () => {
    const sessionId = "unit-test-sess-1";
    const authOpts = await appleWalletService.generateAuthOptions(sessionId, "http://localhost:3000");

    assert.strictEqual(authOpts.sessionId, sessionId);
    assert.strictEqual(authOpts.protocol, "iso18013-7");
    assert.strictEqual(authOpts.targetElement, "age_over_21");
    assert.ok(authOpts.deviceRequest, "Must include deviceRequest");
    assert.ok(authOpts.encryptionInfo, "Must include encryptionInfo");
    assert.ok(authOpts.nonce, "Must include session nonce");
    assert.ok(Array.isArray(authOpts.digital?.providers), "Must have digital.providers array");
  });

  await t.test("verifies over-21 mDL presentation with HPKE encryption", async () => {
    const testSessionId = "unit-test-hpke-" + Date.now();
    await appleWalletService.generateAuthOptions(testSessionId, "http://localhost:3000");

    const sessionKey = cbor.getSessionReaderKey(testSessionId);
    assert.ok(sessionKey, "Session key must be stored");

    const { publicKey: clientPub, privateKey: clientPriv } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const clientPubJwk = clientPub.export({ format: "jwk" });
    const enc = Buffer.concat([Buffer.from([0x04]), Buffer.from(clientPubJwk.x, "base64url"), Buffer.from(clientPubJwk.y, "base64url")]);

    const pkR_uncompressed = Buffer.concat([
      Buffer.from([0x04]),
      Buffer.from(sessionKey.jwk.x, "base64url"),
      Buffer.from(sessionKey.jwk.y, "base64url"),
    ]);

    const ecdhClient = crypto.createECDH("prime256v1");
    ecdhClient.setPrivateKey(Buffer.from(clientPriv.export({ format: "jwk" }).d, "base64url"));
    const dh = ecdhClient.computeSecret(pkR_uncompressed);

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

    const kemContext = Buffer.concat([enc, pkR_uncompressed]);
    const sharedSecret = labeledExtract(kemSuiteId, Buffer.alloc(0), "shared_secret", dh);
    const keyScheduleSecret = labeledExpand(kemSuiteId, sharedSecret, "secret", kemContext, 32);

    const mode = Buffer.from([0]);
    const pskIdHash = labeledExtract(hpkeSuiteId, Buffer.alloc(0), "psk_id_hash", Buffer.alloc(0));
    const infoHash = labeledExtract(hpkeSuiteId, Buffer.alloc(0), "info_hash", Buffer.alloc(0));
    const ksContext = Buffer.concat([mode, pskIdHash, infoHash]);

    const secret = labeledExtract(hpkeSuiteId, keyScheduleSecret, "secret", Buffer.alloc(0));
    const key = labeledExpand(hpkeSuiteId, secret, "key", ksContext, 16);
    const baseNonce = labeledExpand(hpkeSuiteId, secret, "base_nonce", ksContext, 12);

    const deviceResponseObj = {
      version: "1.0",
      documents: [
        {
          docType: "org.iso.18013.5.1.mDL",
          issuerSigned: {
            nameSpaces: {
              "org.iso.18013.5.1": [
                {
                  digestID: 0,
                  elementIdentifier: "age_over_21",
                  elementValue: true,
                },
              ],
            },
            issuerAuth: [
              cbor.encode(new Map([[1, -7]])),
              new Map([[33, [Buffer.from("fake-ds-cert-der")]]]),
              null,
              Buffer.alloc(64, 1),
            ],
          },
        },
      ],
      status: 0,
    };

    const plaintextDeviceResponse = cbor.encode(deviceResponseObj);
    const cipher = crypto.createCipheriv("aes-128-gcm", key, baseNonce);
    const ciphertext = Buffer.concat([
      cipher.update(plaintextDeviceResponse),
      cipher.final(),
      cipher.getAuthTag(),
    ]);

    const verifyResult = await appleWalletService.verifyWalletResponse(testSessionId, {
      enc: enc.toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
    });

    assert.strictEqual(verifyResult.decision, "GRANTED");
    assert.strictEqual(verifyResult.age_over_21, true);
    assert.strictEqual(verifyResult.wasEncrypted, true);
  });

  await t.test("derives over-21 verification from birth_date when age_over_21 boolean is omitted", async () => {
    const testSessionId = "unit-test-bd-" + Date.now();
    await appleWalletService.generateAuthOptions(testSessionId, "http://localhost:3000");

    const birthDateResponse = {
      version: "1.0",
      documents: [
        {
          docType: "org.iso.18013.5.1.mDL",
          issuerSigned: {
            nameSpaces: {
              "org.iso.18013.5.1": [
                {
                  digestID: 0,
                  elementIdentifier: "birth_date",
                  elementValue: "1990-05-20",
                },
              ],
            },
          },
        },
      ],
    };

    const verifyResult = await appleWalletService.verifyWalletResponse(testSessionId, {
      data: cbor.encode(birthDateResponse).toString("base64url"),
    });

    assert.strictEqual(verifyResult.decision, "GRANTED");
    assert.strictEqual(verifyResult.age_over_21, true);
    assert.ok(verifyResult.reason.includes("Age 21+ confirmed"));
  });

  await t.test("denies under-21 mDL presentation (age_over_21: false)", async () => {
    const testSessionId = "unit-test-under-" + Date.now();
    await appleWalletService.generateAuthOptions(testSessionId, "http://localhost:3000");

    const under21Response = {
      version: "1.0",
      documents: [
        {
          docType: "org.iso.18013.5.1.mDL",
          issuerSigned: {
            nameSpaces: {
              "org.iso.18013.5.1": [
                {
                  digestID: 0,
                  elementIdentifier: "age_over_21",
                  elementValue: false,
                },
              ],
            },
          },
        },
      ],
    };

    const verifyUnder21 = await appleWalletService.verifyWalletResponse(testSessionId, {
      data: cbor.encode(under21Response).toString("base64url"),
    });

    assert.strictEqual(verifyUnder21.decision, "DENIED");
    assert.strictEqual(verifyUnder21.age_over_21, false);
    assert.ok(verifyUnder21.reason.includes("does not meet the legal drinking age of 21"));
  });
});

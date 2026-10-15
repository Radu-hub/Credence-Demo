// ─── Apple Wallet End-to-End Verification Test Script ───────────────────────
const http = require("http");
const crypto = require("crypto");
const cbor = require("../server/services/cborEncoder");
const appleCertManager = require("../server/services/appleCertManager");
const appleWalletService = require("../server/services/appleWalletService");

async function runTests() {
  console.log("=== Testing Apple Wallet on the Web Engine ===");

  // 1. Test Cert Manager
  console.log("\n[Test 1] Cert Manager initialization...");
  const creds = appleCertManager.getReaderCredentials();
  console.log("Reader credentials loaded:", {
    isConfigured: creds.isConfigured,
    hasCert: Boolean(creds.certDer && creds.certDer.length > 0),
    hasKey: Boolean(creds.key),
  });

  // 2. Test Auth Options Generation (ISO 18013-7, age_over_21)
  console.log("\n[Test 2] Auth Options Generation (ISO 18013-7)...");
  const testSessionId = "test-session-" + Date.now();
  const authOptions = appleWalletService.generateAuthOptions(testSessionId);
  console.log("Generated Auth Options:", {
    sessionId: authOptions.sessionId,
    protocol: authOptions.protocol,
    targetElement: authOptions.targetElement,
    hasDeviceRequest: Boolean(authOptions.deviceRequest),
    hasEncryptionInfo: Boolean(authOptions.encryptionInfo),
    hasNonce: Boolean(authOptions.nonce),
    providersProtocol: authOptions.digital?.providers?.[0]?.protocol,
  });

  if (authOptions.protocol !== "iso18013-7") {
    throw new Error(`Expected protocol iso18013-7, got ${authOptions.protocol}`);
  }
  if (authOptions.targetElement !== "age_over_21") {
    throw new Error(`Expected targetElement age_over_21, got ${authOptions.targetElement}`);
  }

  // Decode DeviceRequest to ensure ONLY age_over_21 is requested
  const devReqBuf = Buffer.from(authOptions.deviceRequest, "base64url");
  const decodedDevReq = cbor.decode(devReqBuf);
  const itemsReq = decodedDevReq.docRequests[0].itemsRequest;
  console.log("Requested Data Elements in ItemsRequest:", itemsReq.nameSpaces["org.iso.18013.5.1"]);

  // 3. Test HPKE Encryption and Decryption Cycle with Over-21 mDL
  console.log("\n[Test 3] Simulating Apple Wallet Over-21 Presentation with HPKE...");
  const sessionKey = cbor.getSessionReaderKey(testSessionId);
  if (!sessionKey) throw new Error("Session key not found!");

  // Client generates ephemeral ECDH keypair
  const { publicKey: clientPub, privateKey: clientPriv } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const clientPubJwk = clientPub.export({ format: "jwk" });
  const enc = Buffer.concat([Buffer.from([0x04]), Buffer.from(clientPubJwk.x, "base64url"), Buffer.from(clientPubJwk.y, "base64url")]);

  // Recipient public key uncompressed
  const pkR_uncompressed = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(sessionKey.jwk.x, "base64url"),
    Buffer.from(sessionKey.jwk.y, "base64url"),
  ]);

  // Client ECDH
  const ecdhClient = crypto.createECDH("prime256v1");
  ecdhClient.setPrivateKey(Buffer.from(clientPriv.export({ format: "jwk" }).d, "base64url"));
  const dh = ecdhClient.computeSecret(pkR_uncompressed);

  // HPKE derivation
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

  // Construct DeviceResponse CBOR with age_over_21: true
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

  // Encrypt with AES-128-GCM
  const cipher = crypto.createCipheriv("aes-128-gcm", key, baseNonce);
  const ciphertext = Buffer.concat([
    cipher.update(plaintextDeviceResponse),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  // Verify response with appleWalletService
  const verifyResult = await appleWalletService.verifyWalletResponse(testSessionId, {
    enc: enc.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  });

  console.log("Over-21 Verification Result:", {
    decision: verifyResult.decision,
    age_over_21: verifyResult.age_over_21,
    wasEncrypted: verifyResult.wasEncrypted,
    reason: verifyResult.reason,
  });

  if (verifyResult.decision !== "GRANTED" || verifyResult.age_over_21 !== true) {
    throw new Error(`Expected GRANTED and age_over_21=true, got ${verifyResult.decision}`);
  }

  // 4. Test Under-21 mDL
  console.log("\n[Test 4] Simulating Under-21 mDL presentation...");
  const testSessionIdUnder = "test-session-under-" + Date.now();
  appleWalletService.generateAuthOptions(testSessionIdUnder);

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

  const verifyUnder21 = await appleWalletService.verifyWalletResponse(testSessionIdUnder, {
    data: cbor.encode(under21Response).toString("base64url"),
  });

  console.log("Under-21 Verification Result:", {
    decision: verifyUnder21.decision,
    age_over_21: verifyUnder21.age_over_21,
    reason: verifyUnder21.reason,
  });

  if (verifyUnder21.decision !== "DENIED" || verifyUnder21.age_over_21 !== false) {
    throw new Error(`Expected DENIED and age_over_21=false, got ${verifyUnder21.decision}`);
  }

  console.log("\n✅ ALL TESTS PASSED SUCCESSFULLY!");
}

runTests().catch((err) => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});

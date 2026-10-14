require("dotenv").config();
const assert = require("assert");
const cbor = require("../server/services/cborEncoder");
const { extractMdlAttributes, verifyMdlPresentation } = require("../server/services/mdlVerifier");

async function runTests() {
  console.log("=== TESTING REAL APPLE DEVELOPER PROFILE & ISO 18013-5/7 MDOC VERIFICATION ===");

  // ── Test 1: Real ISO 18013-5 Tag 24 IssuerSignedItem Array (Apple Wallet format) ──
  console.log("1. Testing ISO 18013-5 CBOR DeviceResponse with Tag 24 IssuerSignedItem array...");

  const birthDateItem = cbor.encode(new Map([
    ["digestID", 0],
    ["random", Buffer.from("11223344", "hex")],
    ["elementIdentifier", "birth_date"],
    ["elementValue", "1997-03-24"],
  ]));

  const givenNameItem = cbor.encode(new Map([
    ["digestID", 1],
    ["random", Buffer.from("55667788", "hex")],
    ["elementIdentifier", "given_name"],
    ["elementValue", "Jordan"],
  ]));

  const familyNameItem = cbor.encode(new Map([
    ["digestID", 2],
    ["random", Buffer.from("99aabbcc", "hex")],
    ["elementIdentifier", "family_name"],
    ["elementValue", "Taylor"],
  ]));

  const ageOver21Item = cbor.encode(new Map([
    ["digestID", 3],
    ["random", Buffer.from("ddeeff00", "hex")],
    ["elementIdentifier", "age_over_21"],
    ["elementValue", true],
  ]));

  const issuingAuthorityItem = cbor.encode(new Map([
    ["digestID", 4],
    ["random", Buffer.from("00112233", "hex")],
    ["elementIdentifier", "issuing_authority"],
    ["elementValue", "California DMV"],
  ]));

  const rawDeviceResponse = {
    version: "1.0",
    documents: [
      {
        docType: "org.iso.18013.5.1.mDL",
        issuerSigned: {
          nameSpaces: {
            "org.iso.18013.5.1": [
              new cbor.CborTag(24, birthDateItem),
              new cbor.CborTag(24, givenNameItem),
              new cbor.CborTag(24, familyNameItem),
              new cbor.CborTag(24, ageOver21Item),
              new cbor.CborTag(24, issuingAuthorityItem),
            ],
          },
          issuerAuth: [null, null, null, Buffer.from("dummy-sig")],
        },
        deviceSigned: {
          nameSpaces: {},
          deviceAuth: { deviceSignature: Buffer.from("dummy-dev-sig") },
        },
      },
    ],
    status: 0,
  };

  const devRespCbor = cbor.encode(rawDeviceResponse);
  const base64urlPayload = devRespCbor.toString("base64url");

  // Verify attribute extraction from base64url CBOR string
  const attrs = extractMdlAttributes(base64urlPayload);
  assert.strictEqual(attrs.given_name, "Jordan", "Given name must be extracted");
  assert.strictEqual(attrs.family_name, "Taylor", "Family name must be extracted");
  assert.strictEqual(attrs.birth_date, "1997-03-24", "Birth date must be extracted");
  assert.strictEqual(attrs.age_over_21, true, "age_over_21 must be true");
  assert.strictEqual(attrs.issuing_authority, "California DMV", "Issuing authority must match");
  console.log("   ✅ Extracted from ISO 18013-5 CBOR:", {
    name: `${attrs.given_name} ${attrs.family_name}`,
    birth_date: attrs.birth_date,
    age_over_21: attrs.age_over_21,
    issuing_authority: attrs.issuing_authority,
  });

  // Verify policy evaluation
  const result1 = verifyMdlPresentation(base64urlPayload, 21);
  assert.strictEqual(result1.decision, "GRANTED", "Adult mDL must be GRANTED");
  assert.strictEqual(result1.checks.age_requirement_met, true);
  assert(result1.policy.computed_age >= 21, "Computed age must be >= 21");
  console.log(`   ✅ Adult Policy Decision: ${result1.decision}, Computed Age: ${result1.policy.computed_age}`);

  // ── Test 2: ISO 18013-7 Annex C HPKE Encrypted Response ──
  console.log("2. Testing ISO 18013-7 Annex C HPKE Encrypted Response decryption...");

  const testSessionId = "test-apple-profile-session-456";
  // Generate session reader encryption info
  cbor.buildEncryptionInfo(testSessionId);
  const sessionKey = cbor.getSessionReaderKey(testSessionId);
  assert(sessionKey && sessionKey.jwk, "Session reader key must exist");

  // Simulate Sender (Apple Wallet) encrypting DeviceResponse using recipient public key
  const crypto = require("crypto");
  const senderEcdh = crypto.createECDH("prime256v1");
  senderEcdh.generateKeys();
  const encSender = senderEcdh.getPublicKey(); // 65 bytes uncompressed

  const pkR_x = Buffer.from(sessionKey.jwk.x, "base64url");
  const pkR_y = Buffer.from(sessionKey.jwk.y, "base64url");
  const pkR = Buffer.concat([Buffer.from([0x04]), pkR_x, pkR_y]);
  const dhSender = senderEcdh.computeSecret(pkR);

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

  const kemContextSender = Buffer.concat([encSender, pkR]);
  const sharedSecretSender = labeledExtract(kemSuiteId, Buffer.alloc(0), "shared_secret", dhSender);
  const keyScheduleSecretSender = labeledExpand(kemSuiteId, sharedSecretSender, "secret", kemContextSender, 32);

  const mode = Buffer.from([0]);
  const pskIdHash = labeledExtract(hpkeSuiteId, Buffer.alloc(0), "psk_id_hash", Buffer.alloc(0));
  const infoHash = labeledExtract(hpkeSuiteId, Buffer.alloc(0), "info_hash", Buffer.alloc(0));
  const ksContext = Buffer.concat([mode, pskIdHash, infoHash]);

  const secretSender = labeledExtract(hpkeSuiteId, keyScheduleSecretSender, "secret", Buffer.alloc(0));
  const keySender = labeledExpand(hpkeSuiteId, secretSender, "key", ksContext, 16);
  const baseNonceSender = labeledExpand(hpkeSuiteId, secretSender, "base_nonce", ksContext, 12);

  const cipher = crypto.createCipheriv("aes-128-gcm", keySender, baseNonceSender);
  const encData = Buffer.concat([cipher.update(devRespCbor), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ciphertextSender = Buffer.concat([encData, tag]);

  // Annex C payload format: [ "dcapi", { enc, ciphertext } ]
  const hpkePayload = [
    "dcapi",
    {
      enc: encSender.toString("base64url"),
      ciphertext: ciphertextSender.toString("base64url"),
    },
  ];

  const result2 = verifyMdlPresentation(hpkePayload, 21, testSessionId);
  assert.strictEqual(result2.decision, "GRANTED", "HPKE decrypted payload must be GRANTED");
  assert.strictEqual(result2.attributes.given_name, "Jordan");
  assert.strictEqual(result2.attributes.family_name, "Taylor");
  console.log(`   ✅ HPKE Decryption + Policy Decision: ${result2.decision}, Name: ${result2.attributes.given_name} ${result2.attributes.family_name}`);

  // ── Test 3: Standalone age_over_21 Boolean Claim (Privacy-Preserving without DOB) ──
  console.log("3. Testing privacy-preserving credential with age_over_21 only...");
  const privacyPayload = {
    docType: "org.iso.18013.5.1.mDL",
    nameSpaces: {
      "org.iso.18013.5.1": {
        given_name: "Morgan",
        family_name: "Lee",
        age_over_21: true,
        issuing_authority: "Apple Developer Test Profile",
      },
    },
  };
  const result3 = verifyMdlPresentation(privacyPayload, 21);
  assert.strictEqual(result3.decision, "GRANTED");
  assert.strictEqual(result3.checks.age_requirement_met, true);
  assert.strictEqual(result3.policy.computed_age, "21+");
  console.log(`   ✅ Privacy-Preserving Age Check: ${result3.decision}, Computed Age: ${result3.policy.computed_age}`);

  // ── Test 4: Numeric age_in_years Claim ──
  console.log("4. Testing numeric age_in_years claim...");
  const numericAgePayload = {
    docType: "org.iso.18013.5.1.mDL",
    attributes: {
      first_name: "Casey",
      last_name: "Morgan",
      age_in_years: 24,
      issuing_authority: "State DMV",
    },
  };
  const result4 = verifyMdlPresentation(numericAgePayload, 21);
  assert.strictEqual(result4.decision, "GRANTED");
  assert.strictEqual(result4.policy.computed_age, 24);
  console.log(`   ✅ Numeric Age Check: ${result4.decision}, Computed Age: ${result4.policy.computed_age}`);

  // ── Test 5: Underage Credential (Minor) ──
  console.log("5. Testing underage minor credential...");
  const minorPayload = {
    docType: "org.iso.18013.5.1.mDL",
    attributes: {
      given_name: "Sammy",
      family_name: "Junior",
      birth_date: "2008-01-15",
      age_over_21: false,
    },
  };
  const result5 = verifyMdlPresentation(minorPayload, 21);
  assert.strictEqual(result5.decision, "DENIED");
  assert.strictEqual(result5.checks.age_requirement_met, false);
  console.log(`   ✅ Underage Check correctly DENIED: ${result5.decision}, Age: ${result5.policy.computed_age}`);

  console.log("\n🎉 ALL APPLE DEVELOPER PROFILE & ISO 18013-5/7 MDOC TESTS PASSED 100%!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

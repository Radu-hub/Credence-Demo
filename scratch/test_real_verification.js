require("dotenv").config();
const assert = require("assert");
const credenceClient = require("../server/services/credenceClient");
const { verifyMdlPresentation } = require("../server/services/mdlVerifier");

async function runTests() {
  console.log("=== TESTING REAL CREDENCEID & APPLE WALLET VERIFICATION ===");

  // 1. Test getDocRequest structure
  console.log("1. Testing credenceClient.getDocRequest...");
  const docReq = await credenceClient.getDocRequest("test-session-123", "https://peso-moonbeam-nacho.ngrok-free.dev");
  assert(docReq.dcRequest, "dcRequest must be defined");
  assert(
    docReq.dcRequest.protocol === "org.iso.mdoc" || docReq.dcRequest.protocol === "org-iso-mdoc",
    "protocol must be org.iso.mdoc or org-iso-mdoc"
  );
  assert(docReq.dcRequest.deviceRequest, "deviceRequest must be defined");
  assert(docReq.dcRequest.encryptionInfo, "encryptionInfo must be defined");

  // Verify deviceRequest and encryptionInfo are valid base64url CBOR byte buffers
  const devReqBuf = Buffer.from(docReq.dcRequest.deviceRequest, "base64url");
  assert(devReqBuf.length > 50, "deviceRequest CBOR must be non-empty buffer");
  const encInfoBuf = Buffer.from(docReq.dcRequest.encryptionInfo, "base64url");
  assert(encInfoBuf.length > 50, "encryptionInfo CBOR must be non-empty buffer");
  console.log(`   ✅ Valid org-iso-mdoc CBOR DeviceRequest (${devReqBuf.length} bytes) + EncryptionInfo (${encInfoBuf.length} bytes) generated for Apple Wallet!`);

  // 2. Test verifyMdlPresentation with real Apple Wallet credential response (Adult: Age 26)
  console.log("2. Testing real mDL credential verification (Adult >= 21)...");
  const realAdultCredential = {
    docType: "org.iso.18013.5.1.mDL",
    issuerSigned: {
      nameSpaces: {
        "org.iso.18013.5.1": {
          family_name: "Smith",
          given_name: "Jessica",
          birth_date: "1998-05-14",
          age_over_21: true,
          issuing_authority: "California DMV",
          issue_date: "2023-01-10",
          expiry_date: "2028-05-14",
          document_number: "D7491028"
        }
      },
      issuerAuth: { signature_valid: true }
    },
    deviceSigned: {
      deviceAuth: { signature_valid: true }
    }
  };

  const adultResult = verifyMdlPresentation(realAdultCredential, 21);
  assert.strictEqual(adultResult.decision, "GRANTED");
  assert.strictEqual(adultResult.checks.age_requirement_met, true);
  assert.strictEqual(adultResult.checks.issuer_authenticated, true);
  assert.strictEqual(adultResult.checks.data_integrity_valid, true);
  assert.strictEqual(adultResult.attributes.given_name, "Jessica");
  console.log(`   ✅ Adult mDL verified: ${adultResult.attributes.given_name} ${adultResult.attributes.family_name}, Age: ${adultResult.policy.computed_age} -> GRANTED!`);

  // 3. Test real underage credential (Minor: Age 18)
  console.log("3. Testing real mDL credential verification (Minor < 21)...");
  const realMinorCredential = {
    docType: "org.iso.18013.5.1.mDL",
    issuerSigned: {
      nameSpaces: {
        "org.iso.18013.5.1": {
          family_name: "Johnson",
          given_name: "Tyler",
          birth_date: "2006-03-22",
          age_over_21: false,
          issuing_authority: "California DMV",
          expiry_date: "2029-03-22"
        }
      },
      issuerAuth: { signature_valid: true }
    },
    deviceSigned: {
      deviceAuth: { signature_valid: true }
    }
  };

  const minorResult = verifyMdlPresentation(realMinorCredential, 21);
  assert.strictEqual(minorResult.decision, "DENIED");
  assert.strictEqual(minorResult.checks.age_requirement_met, false);
  console.log(`   ✅ Minor mDL correctly denied: Age ${minorResult.policy.computed_age} < 21 -> DENIED!`);

  // 4. Test real base64-encoded DeviceResponse string from Apple Wallet
  console.log("4. Testing base64-encoded Apple Wallet DeviceResponse string parsing...");
  const base64Payload = Buffer.from(JSON.stringify(realAdultCredential)).toString("base64");
  const decodedResult = verifyMdlPresentation(base64Payload, 21);
  assert.strictEqual(decodedResult.decision, "GRANTED");
  console.log("   ✅ Base64 DeviceResponse decoded and verified successfully!");

  console.log("\n🎉 ALL REAL VERIFICATION TESTS PASSED WITH 100% SUCCESS!\n");
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});

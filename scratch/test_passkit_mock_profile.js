const { MOCK_SCENARIOS } = require("../server/services/mockScenarios");
const { verifyMdlPresentation } = require("../server/services/mdlVerifier");
const router = require("../server/routes/verification");

// Helper to simulate express request/response in-memory
function mockRequest(method, url, body = {}) {
  return new Promise((resolve) => {
    const req = {
      method,
      url,
      originalUrl: url,
      body,
      headers: { host: "localhost:3000" },
      get: (header) => (header.toLowerCase() === "host" ? "localhost:3000" : ""),
    };

    const res = {
      statusCode: 200,
      headers: {},
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(k, v) {
        this.headers[k] = v;
      },
      json(data) {
        resolve({ statusCode: this.statusCode, data });
      },
      send(data) {
        resolve({ statusCode: this.statusCode, data });
      },
    };

    router(req, res, (err) => {
      if (err) resolve({ statusCode: 500, error: err });
    });
  });
}

async function run() {
  console.log("=== RUNNING PASSKIT MOCK PROFILE IN-MEMORY TESTS ===");

  // 1. Verify MOCK_SCENARIOS has passkit_mock and apple_wallet_mock
  if (!MOCK_SCENARIOS.passkit_mock) {
    throw new Error("MOCK_SCENARIOS.passkit_mock is undefined");
  }
  if (!MOCK_SCENARIOS.apple_wallet_mock) {
    throw new Error("MOCK_SCENARIOS.apple_wallet_mock is undefined");
  }
  console.log("✓ PASS: MOCK_SCENARIOS contains passkit_mock:", MOCK_SCENARIOS.passkit_mock.name);

  // 2. Test GET /mock-scenarios route
  const getScenariosRes = await mockRequest("GET", "/mock-scenarios");
  const found = getScenariosRes.data.scenarios.find((s) => s.id === "passkit_mock");
  if (!found) {
    throw new Error("passkit_mock not returned by GET /mock-scenarios route");
  }
  console.log("✓ PASS: GET /mock-scenarios route returned passkit_mock scenario");

  // 3. Test verification directly on Swift #if DEBUG code chunk
  const swiftMockPayloadString = `{
    "org.iso.18013.5.1": {
      "given_name": "John",
      "family_name": "Doe",
      "birth_date": "1970-01-01"
    }
  }`;

  const directVerified = verifyMdlPresentation(swiftMockPayloadString);
  if (directVerified.decision !== "GRANTED") {
    throw new Error(`Direct verification failed: ${JSON.stringify(directVerified)}`);
  }
  if (directVerified.attributes.given_name !== "John" || directVerified.attributes.family_name !== "Doe") {
    throw new Error(`Attribute mismatch: ${JSON.stringify(directVerified.attributes)}`);
  }
  if (directVerified.policy.computed_age < 21) {
    throw new Error(`Age check failed: ${directVerified.policy.computed_age}`);
  }
  console.log(`✓ PASS: Direct verifyMdlPresentation(swiftMockPayloadString) -> GRANTED (Age: ${directVerified.policy.computed_age})`);

  // 4. Test POST /session to create a session
  const createSessionRes = await mockRequest("POST", "/session", {});
  const sessionId = createSessionRes.data.sessionId;
  console.log("✓ PASS: Created session:", sessionId);

  // 5. Test POST /mock-payload with scenario: "passkit_mock"
  const mockPayloadRes = await mockRequest("POST", "/mock-payload", {
    session_id: sessionId,
    scenario: "passkit_mock",
  });
  if (mockPayloadRes.data.decision !== "GRANTED" || mockPayloadRes.data.result.attributes.given_name !== "John") {
    throw new Error(`POST /mock-payload failed: ${JSON.stringify(mockPayloadRes.data)}`);
  }
  console.log(`✓ PASS: POST /mock-payload for passkit_mock -> GRANTED (Age: ${mockPayloadRes.data.result.policy.computed_age})`);

  // 6. Test POST /verify-doc with Swift raw string
  const session2Res = await mockRequest("POST", "/session", {});
  const session2Id = session2Res.data.sessionId;

  const verifyDocRes = await mockRequest("POST", "/verify-doc", {
    sessionId: session2Id,
    walletResponse: swiftMockPayloadString,
  });
  if (verifyDocRes.data.decision !== "GRANTED") {
    throw new Error(`POST /verify-doc failed: ${JSON.stringify(verifyDocRes.data)}`);
  }
  console.log(`✓ PASS: POST /verify-doc with walletResponse: swiftMockPayloadString -> GRANTED (Name: ${verifyDocRes.data.result.attributes.given_name} ${verifyDocRes.data.result.attributes.family_name})`);

  // 7. Test POST /verify-doc with direct namespace in body
  const session3Res = await mockRequest("POST", "/session", {});
  const session3Id = session3Res.data.sessionId;

  const verifyDocDirectRes = await mockRequest("POST", "/verify-doc", {
    sessionId: session3Id,
    "org.iso.18013.5.1": {
      given_name: "John",
      family_name: "Doe",
      birth_date: "1970-01-01",
    },
  });
  if (verifyDocDirectRes.data.decision !== "GRANTED") {
    throw new Error(`POST /verify-doc direct failed: ${JSON.stringify(verifyDocDirectRes.data)}`);
  }
  console.log("✓ PASS: POST /verify-doc with direct org.iso.18013.5.1 in body -> GRANTED");

  console.log("\nALL 7 TESTS PASSED SUCCESSFULLY! 🚀");
}

run().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exitCode = 1;
});

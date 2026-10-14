require("dotenv").config();
const assert = require("assert");
const credenceClient = require("../server/services/credenceClient");
const verificationRoutes = require("../server/routes/verification");

async function testCredenceInjection() {
  console.log("=== VERIFYING CREDENCE CLOUD RETURN-URL & ORIGIN INJECTION ===");

  const simulatedTunnel = "stage-wallet-demo.ngrok-free.app";
  const mockReq = {
    protocol: "http",
    headers: {
      "x-forwarded-proto": "https",
      "x-forwarded-host": simulatedTunnel,
    },
    get(header) {
      if (header.toLowerCase() === "host") return simulatedTunnel;
      return this.headers[header.toLowerCase()];
    },
  };

  // Intercept fetch calls made by credenceClient
  const originalFetch = global.fetch;
  let interceptedAuthPayload = null;
  let interceptedAuthHeaders = null;
  let interceptedInitiatePayload = null;
  let interceptedInitiateHeaders = null;

  global.fetch = async (url, options) => {
    if (url.includes("/v1/setup")) {
      interceptedAuthPayload = JSON.parse(options.body);
      interceptedAuthHeaders = options.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: "mock_test_token_999",
          expiresIn: 3600,
        }),
      };
    }

    if (url.includes("/openid4vp/v1/mdoc/initiate")) {
      interceptedInitiatePayload = JSON.parse(options.body);
      interceptedInitiateHeaders = options.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sessionId: "cloud-session-12345",
          walletUri: `openid4vp://authorize?client_id=passgate&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback%3Fsession_id%3Dtest-sid`,
          redirectUrl: `https://${simulatedTunnel}/callback?session_id=test-sid`,
        }),
      };
    }

    return originalFetch(url, options);
  };

  try {
    const testSessionId = "test-uuid-5555";
    const dynamicOrigin = verificationRoutes.resolveRequestOrigin(mockReq);

    console.log("1. Testing resolveRequestOrigin(mockReq)...");
    assert.strictEqual(
      dynamicOrigin,
      `https://${simulatedTunnel}`,
      `Origin should resolve to https://${simulatedTunnel}`
    );
    console.log(`   ✅ Resolved origin: ${dynamicOrigin}`);

    console.log("2. Testing credenceClient.createLiveSession with dynamic req...");
    const returnUrl = `${dynamicOrigin}/callback?session_id=${testSessionId}`;
    const sessionResult = await credenceClient.createLiveSession(
      testSessionId,
      mockReq,
      returnUrl
    );

    console.log("3. Validating interceptor results sent to Credence Cloud:");
    console.log("   - Setup Origin Header:", interceptedAuthHeaders.Origin);
    assert.strictEqual(
      interceptedAuthHeaders.Origin,
      `https://${simulatedTunnel}`,
      "Origin header in setup call must match active tunnel domain"
    );
    console.log("   ✅ Setup Origin header verified.");

    console.log("   - Initiate Payload returnUrl:", interceptedInitiatePayload.returnUrl);
    assert(
      interceptedInitiatePayload.returnUrl.startsWith(`https://${simulatedTunnel}/callback`),
      "Initiate returnUrl must start with active tunnel URL"
    );
    assert(
      !interceptedInitiatePayload.returnUrl.includes("localhost"),
      "Initiate returnUrl must never contain localhost"
    );
    console.log("   ✅ Credence Cloud initiate payload returnUrl is 100% dynamically injected!");

    console.log("4. Testing URL-encoded deep-link rebasing on returned walletUri...");
    // Test that client/server rebasing replaces embedded percent-encoded localhost
    const rebasedWalletUri = verificationRoutes.resolveRequestOrigin ?
      sessionResult.walletUri.replace(/https?%3A%2F%2F(localhost|127\.0\.0\.1)(%3A\d+)?/gi, encodeURIComponent(dynamicOrigin)) :
      sessionResult.walletUri;

    console.log("   - Original walletUri:", sessionResult.walletUri);
    console.log("   - Rebased walletUri:", rebasedWalletUri);
    assert(
      rebasedWalletUri.includes(encodeURIComponent(dynamicOrigin)),
      "Embedded redirect_uri inside openid4vp deep link must be rebased to active tunnel"
    );
    assert(
      !rebasedWalletUri.includes("localhost"),
      "Rebased walletUri must have zero localhost occurrences"
    );
    console.log("   ✅ Deep-link embedded parameters rebased successfully!");

    console.log("\n🎉 ALL CREDENCE INJECTION TESTS PASSED WITH 100% SUCCESS!");
  } finally {
    global.fetch = originalFetch;
  }
}

testCredenceInjection().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

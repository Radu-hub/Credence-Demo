// ─── HTTP Endpoints Integration Test ─────────────────────────────────────────
const http = require("http");

// Import the configured Express app
require("dotenv").config();
const express = require("express");
const verificationRoutes = require("../server/routes/verification");
const walletRoutes = require("../server/routes/wallet");

const app = express();
app.use(express.json());
app.use("/api/verification", verificationRoutes);
app.use("/api/wallet", walletRoutes);

const server = app.listen(0, async () => {
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  try {
    // 1. GET /api/wallet/status
    console.log("\n[Test 1] Testing GET /api/wallet/status...");
    const statusRes = await fetch(`${baseUrl}/api/wallet/status`);
    const statusData = await statusRes.json();
    console.log("Status response:", statusData);
    if (statusData.status !== "ok") throw new Error("Status endpoint failed");

    // 2. GET /api/wallet/auth-options
    console.log("\n[Test 2] Testing GET /api/wallet/auth-options...");
    const authRes = await fetch(`${baseUrl}/api/wallet/auth-options`);
    const authData = await authRes.json();
    console.log("Auth-options response:", {
      sessionId: authData.sessionId,
      protocol: authData.protocol,
      targetElement: authData.targetElement,
      hasDeviceRequest: Boolean(authData.deviceRequest),
      hasEncryptionInfo: Boolean(authData.encryptionInfo),
      providers: authData.digital?.providers?.length,
    });
    if (authData.protocol !== "iso18013-7" || authData.targetElement !== "age_over_21") {
      throw new Error("Invalid auth-options response");
    }

    // 3. POST /api/wallet/auth-options with specific sessionId
    console.log("\n[Test 3] Testing POST /api/wallet/auth-options with custom sessionId...");
    const customSessionId = "custom-http-session-123";
    const postAuthRes = await fetch(`${baseUrl}/api/wallet/auth-options`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: customSessionId }),
    });
    const postAuthData = await postAuthRes.json();
    console.log("POST auth-options sessionId match:", postAuthData.sessionId === customSessionId);
    if (postAuthData.sessionId !== customSessionId) throw new Error("SessionId mismatch");

    // 4. POST /api/wallet/verify with over-21 payload
    console.log("\n[Test 4] Testing POST /api/wallet/verify (Over 21)...");
    const verifyRes = await fetch(`${baseUrl}/api/wallet/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: customSessionId,
        credential: {
          data: {
            "org.iso.18013.5.1": {
              age_over_21: true,
            },
          },
        },
      }),
    });
    const verifyData = await verifyRes.json();
    console.log("Verify outcome:", {
      success: verifyData.success,
      decision: verifyData.decision,
      age_over_21: verifyData.age_over_21,
    });
    if (verifyData.decision !== "GRANTED" || verifyData.age_over_21 !== true) {
      throw new Error("Expected decision GRANTED");
    }

    // 5. POST /api/wallet/verify with under-21 payload
    console.log("\n[Test 5] Testing POST /api/wallet/verify (Under 21)...");
    const underSessionId = "custom-under-session-456";
    await fetch(`${baseUrl}/api/wallet/auth-options`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: underSessionId }),
    });
    const verifyUnderRes = await fetch(`${baseUrl}/api/wallet/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: underSessionId,
        credential: {
          data: {
            "org.iso.18013.5.1": {
              age_over_21: false,
            },
          },
        },
      }),
    });
    const verifyUnderData = await verifyUnderRes.json();
    console.log("Verify under-21 outcome:", {
      success: verifyUnderData.success,
      decision: verifyUnderData.decision,
      age_over_21: verifyUnderData.age_over_21,
    });
    if (verifyUnderData.decision !== "DENIED" || verifyUnderData.age_over_21 !== false) {
      throw new Error("Expected decision DENIED");
    }

    console.log("\n🎉 ALL HTTP ENDPOINT TESTS PASSED!");
  } catch (err) {
    console.error("HTTP TEST FAILED:", err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

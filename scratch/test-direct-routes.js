// Direct Express router dispatch test (no network socket needed)
const walletRoutes = require("../server/routes/wallet");

function createMockReqRes(method, url, body = {}, query = {}) {
  const req = {
    method,
    url,
    body,
    query,
    headers: {},
    get: (h) => req.headers[h.toLowerCase()],
  };

  let statusCode = 200;
  let responseData = null;
  let resolveResponse;
  const responsePromise = new Promise((resolve) => {
    resolveResponse = resolve;
  });

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      resolveResponse({ statusCode, data });
      return this;
    },
    send(data) {
      responseData = data;
      resolveResponse({ statusCode, data });
      return this;
    },
    setHeader() {},
  };

  return {
    req,
    res,
    waitForResponse: () => responsePromise,
    getResult: () => ({ statusCode, data: responseData }),
  };
}

async function runDirectRouteTests() {
  console.log("=== Testing Wallet Express Router Handlers Directly ===");

  // 1. GET /api/wallet/status
  console.log("\n[Route Test 1] GET /status");
  const t1 = createMockReqRes("GET", "/status");
  walletRoutes.handle(t1.req, t1.res, () => {});
  const r1 = t1.getResult();
  console.log("Status Code:", r1.statusCode, "Response:", r1.data);
  if (r1.data.status !== "ok") throw new Error("Status failed");

  // 2. GET /api/wallet/auth-options
  console.log("\n[Route Test 2] GET /auth-options");
  const t2 = createMockReqRes("GET", "/auth-options", {}, { sessionId: "sess-direct-1" });
  walletRoutes.handle(t2.req, t2.res, () => {});
  const r2 = await t2.waitForResponse();
  console.log("Auth-Options Code:", r2.statusCode, {
    sessionId: r2.data.sessionId,
    protocol: r2.data.protocol,
    targetElement: r2.data.targetElement,
    hasDeviceRequest: Boolean(r2.data.deviceRequest),
  });
  if (!r2.data.protocol || r2.data.targetElement !== "age_over_21") {
    throw new Error("Invalid auth-options");
  }

  // 3. POST /api/wallet/verify (Over 21)
  console.log("\n[Route Test 3] POST /verify (Over 21)");
  const t3 = createMockReqRes("POST", "/verify", {
    sessionId: "sess-direct-1",
    credential: {
      data: {
        "org.iso.18013.5.1": {
          age_over_21: true,
        },
      },
    },
  });
  walletRoutes.handle(t3.req, t3.res, () => {});
  const r3 = await t3.waitForResponse();
  console.log("Verify Over 21 Code:", r3.statusCode, {
    decision: r3.data.decision,
    age_over_21: r3.data.age_over_21,
    reason: r3.data.reason,
  });
  if (r3.data.decision !== "GRANTED" || r3.data.age_over_21 !== true) {
    throw new Error("Expected decision GRANTED");
  }

  // 4. POST /api/wallet/verify (Under 21)
  console.log("\n[Route Test 4] POST /verify (Under 21)");
  const t4_opt = createMockReqRes("GET", "/auth-options", {}, { sessionId: "sess-direct-under" });
  walletRoutes.handle(t4_opt.req, t4_opt.res, () => {});
  await t4_opt.waitForResponse();

  const t4 = createMockReqRes("POST", "/verify", {
    sessionId: "sess-direct-under",
    credential: {
      data: {
        "org.iso.18013.5.1": {
          age_over_21: false,
        },
      },
    },
  });
  walletRoutes.handle(t4.req, t4.res, () => {});
  const r4 = await t4.waitForResponse();
  console.log("Verify Under 21 Code:", r4.statusCode, {
    decision: r4.data.decision,
    age_over_21: r4.data.age_over_21,
    reason: r4.data.reason,
  });
  if (r4.data.decision !== "DENIED" || r4.data.age_over_21 !== false) {
    throw new Error("Expected decision DENIED");
  }

  console.log("\n✅ ALL DIRECT ROUTE HANDLER TESTS PASSED!");
}

runDirectRouteTests().catch((err) => {
  console.error("Direct Route Test Failed:", err);
  process.exit(1);
});

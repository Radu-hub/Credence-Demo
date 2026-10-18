const test = require("node:test");
const assert = require("node:assert");
const verificationRoutes = require("../../server/routes/verification");
const walletRoutes = require("../../server/routes/wallet");

// In-process Express dispatch helper (zero network sockets required)
function createMockReqRes(method, url, body = {}, query = {}, headers = {}) {
  const req = {
    method,
    url,
    body,
    query,
    headers: { ...headers },
    get: (h) => req.headers[h.toLowerCase()],
    protocol: "https",
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

test("API Routes Integration Tests (In-Process Dispatch)", async (t) => {
  await t.test("GET /api/wallet/status returns reader configuration and status ok", async () => {
    const mock = createMockReqRes("GET", "/status");
    walletRoutes.handle(mock.req, mock.res, () => {});
    const { statusCode, data } = await mock.waitForResponse();

    assert.strictEqual(statusCode, 200);
    assert.strictEqual(data.status, "ok");
    assert.strictEqual(typeof data.readerAuth.isConfigured, "boolean");
    assert.ok(data.targetElement.includes("age_over_21"));
  });

  await t.test("GET /api/wallet/auth-options returns ISO 18013-7 structure", async () => {
    const mock = createMockReqRes("GET", "/auth-options", {}, { sessionId: "inproc-test-1" });
    walletRoutes.handle(mock.req, mock.res, () => {});
    const { statusCode, data } = await mock.waitForResponse();

    assert.strictEqual(statusCode, 200);
    assert.strictEqual(data.sessionId, "inproc-test-1");
    assert.strictEqual(data.targetElement, "age_over_21");
    assert.ok(data.protocol, "Must return protocol");
    assert.ok(Boolean(data.deviceRequest) || Boolean(data.hasDeviceRequest), "Must have deviceRequest");
  });

  await t.test("POST /api/wallet/auth-options preserves requested sessionId", async () => {
    const customSession = "custom-inproc-session-456";
    const mock = createMockReqRes("POST", "/auth-options", { sessionId: customSession });
    walletRoutes.handle(mock.req, mock.res, () => {});
    const { statusCode, data } = await mock.waitForResponse();

    assert.strictEqual(statusCode, 200);
    assert.strictEqual(data.sessionId, customSession);
  });

  await t.test("POST /api/wallet/verify processes age verification decision (Over 21)", async () => {
    const testSession = "inproc-verify-over-21";
    const authMock = createMockReqRes("POST", "/auth-options", { sessionId: testSession });
    walletRoutes.handle(authMock.req, authMock.res, () => {});
    await authMock.waitForResponse();

    const verifyMock = createMockReqRes("POST", "/verify", {
      sessionId: testSession,
      credential: {
        data: {
          "org.iso.18013.5.1": {
            age_over_21: true,
          },
        },
      },
    });

    walletRoutes.handle(verifyMock.req, verifyMock.res, () => {});
    const { statusCode, data } = await verifyMock.waitForResponse();

    assert.strictEqual(statusCode, 200);
    assert.strictEqual(data.decision, "GRANTED");
    assert.strictEqual(data.age_over_21, true);
  });

  await t.test("POST /api/wallet/verify processes age verification decision (Under 21)", async () => {
    const testSession = "inproc-verify-under-21";
    const authMock = createMockReqRes("POST", "/auth-options", { sessionId: testSession });
    walletRoutes.handle(authMock.req, authMock.res, () => {});
    await authMock.waitForResponse();

    const verifyMock = createMockReqRes("POST", "/verify", {
      sessionId: testSession,
      credential: {
        data: {
          "org.iso.18013.5.1": {
            age_over_21: false,
          },
        },
      },
    });

    walletRoutes.handle(verifyMock.req, verifyMock.res, () => {});
    const { statusCode, data } = await verifyMock.waitForResponse();

    assert.strictEqual(statusCode, 200);
    assert.strictEqual(data.decision, "DENIED");
    assert.strictEqual(data.age_over_21, false);
  });

  await t.test("POST /api/wallet/verify processes iOS native simulator mock presentation payload", async () => {
    const iosSession = "ios-sim-session-789";
    const verifyMock = createMockReqRes("POST", "/verify", {
      sessionId: iosSession,
      isSimulatorMock: true,
      personaId: "john-appleseed",
      claims: {
        given_name: "John",
        family_name: "Appleseed",
        birth_date: "1999-05-15",
        age_over_21: "true",
        issuing_authority: "California DMV (Apple Mock)",
      },
      age_over_21: true,
    });

    walletRoutes.handle(verifyMock.req, verifyMock.res, () => {});
    const { statusCode, data } = await verifyMock.waitForResponse();

    assert.strictEqual(statusCode, 200);
    assert.strictEqual(data.decision, "GRANTED");
    assert.strictEqual(data.age_over_21, true);
    assert.strictEqual(data.attributes.given_name, "John");
    assert.strictEqual(data.attributes.family_name, "Appleseed");
  });

  await t.test("POST /api/verification/session creates active session", async () => {
    const mock = createMockReqRes("POST", "/session");
    verificationRoutes.handle(mock.req, mock.res, () => {});
    const { statusCode, data } = await mock.waitForResponse();

    assert.ok([200, 201].includes(statusCode), `Status code ${statusCode} must be 200 or 201`);
    assert.ok(data.id, "Must return session ID");
    assert.ok(["active", "awaiting_scan"].includes(data.status), "Status must be active or awaiting_scan");
    assert.ok(data.qrTargetUrl || data.walletUri, "Must return qrTargetUrl or walletUri");
    assert.ok(data.dcRequest, "Must return pre-fetched dcRequest");

    // Fetch created session
    const getMock = createMockReqRes("GET", `/session/${data.id}`);
    verificationRoutes.handle(getMock.req, getMock.res, () => {});
    const getRes = await getMock.waitForResponse();

    assert.strictEqual(getRes.statusCode, 200);
    assert.strictEqual(getRes.data.id, data.id);
  });
});

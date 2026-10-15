// ─── Verification Routes ─────────────────────────────────────────────────────
// POST /api/verification/session          → create mDL verification session (Live Cloud SDK with Smart Fallback)
// GET  /api/verification/session/:id      → poll session status (queries live Credence Cloud when active)
// POST /api/verification/session/:id/cancel → cancel active session
// POST /api/verification/mock-payload     → inject test scenario or custom payload
// GET  /api/verification/mock-scenarios   → list available test personas
// POST /api/verification/webhook          → live CredenceID callback endpoint
// ─────────────────────────────────────────────────────────────────────────────

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const QRCode = require("qrcode");
const { MOCK_SCENARIOS } = require("../services/mockScenarios");
const { verifyMdlPresentation } = require("../services/mdlVerifier");
const credenceClient = require("../services/credenceClient");

const router = express.Router();

// ── In-memory session store & simulation timers ─────────────────────────────
const sessions = new Map();
const sessionTimers = new Map();
let lastActiveSessionId = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function isMock() {
  return process.env.USE_MOCK === "true";
}

function getMinAge() {
  return parseInt(process.env.MIN_AGE, 10) || 21;
}

/**
 * Builds a realistic OpenID4VP mdoc device engagement URI (Flow C).
 */
function buildEngagementUri(sessionId) {
  const profileId = process.env.CREDENCE_PROFILE_ID || "1289dbb9-4d60-11f1-bf44-023b9538e812";
  const baseUrl = (process.env.CREDENCE_API_BASE_URL || "https://credenceid.com/cloudsdkdev").replace(/\/+$/, "");
  const minAge = getMinAge();

  return `mdoc-openid4vp://?client_id=passgate-kiosk&request_uri=${encodeURIComponent(
    `${baseUrl}/openid4vp/v1/mdoc/request/${sessionId}`
  )}&session_id=${sessionId}&min_age=${minAge}&profile_id=${encodeURIComponent(profileId)}`;
}

/**
 * Renders an engagement string to a high-contrast PNG data URL.
 */
async function generateQrDataUrl(text) {
  try {
    return await QRCode.toDataURL(text, {
      width: 280,
      margin: 2,
      color: { dark: "#0a0e17", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });
  } catch (err) {
    console.error("[QRCode generation error]", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/verification/qr-image
// Dynamic QR image generator for any requested payload URL (fallback for mobile)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/qr-image", async (req, res) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("Missing url parameter");
    const dataUrl = await generateQrDataUrl(targetUrl);
    if (!dataUrl) return res.status(500).send("Failed to generate QR");
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
    const imgBuffer = Buffer.from(base64Data, "base64");
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-cache");
    return res.send(imgBuffer);
  } catch (err) {
    return res.status(500).send("Error generating QR image");
  }
});

/**
 * Cancels any pending automated simulation timers for a session.
 */
function clearSessionTimers(sessionId) {
  if (sessionTimers.has(sessionId)) {
    const timers = sessionTimers.get(sessionId);
    timers.forEach((t) => clearTimeout(t));
    sessionTimers.delete(sessionId);
  }
}

/**
 * Processes and executes a mock payload verification pipeline on a session.
 */
function applyMockPayloadToSession(session, payload, _delayMs = 0) {
  clearSessionTimers(session.id);

  // Disable remote cloud polling for this session so live polls never overwrite test results
  session._liveMode = false;

  const minAge = getMinAge();
  const result = verifyMdlPresentation(payload, minAge, session.id);

  session.status = "completed";
  session.result = result;
  session.updatedAt = new Date().toISOString();

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/verification/mock-scenarios
// Returns all predefined mock personas and scenarios for testing.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mock-scenarios", (_req, res) => {
  const scenarios = Object.values(MOCK_SCENARIOS).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
  }));
  res.json({ scenarios });
});

/**
 * Dynamically resolves the active request origin at the exact moment of execution.
 * Derives origin directly from request headers (x-forwarded-proto, x-forwarded-host, host)
 * so sessions never bake static environment variables or stale localhost addresses.
 */
function resolveRequestOrigin(req) {
  // 1. Check x-forwarded-host (e.g. reverse proxy / ngrok)
  const forwardedHost =
    req?.headers?.["x-forwarded-host"] ||
    req?.headers?.["x-original-host"];
  if (forwardedHost && !forwardedHost.includes("localhost") && !forwardedHost.includes("127.0.0.1")) {
    const proto = req?.headers?.["x-forwarded-proto"] || (forwardedHost.includes("ngrok") ? "https" : "http");
    return `${proto}://${forwardedHost}`.replace(/\/+$/, "");
  }

  // 2. Check direct host header if it's already a public domain
  const rawHost = (typeof req?.get === "function" ? req.get("host") : req?.headers?.host) || "";
  if (rawHost && !rawHost.includes("localhost") && !rawHost.includes("127.0.0.1")) {
    const proto = req?.headers?.["x-forwarded-proto"] || (rawHost.includes("ngrok") ? "https" : (req?.protocol || "http"));
    return `${proto}://${rawHost}`.replace(/\/+$/, "");
  }

  // 3. If request is from localhost/127.0.0.1, check configured public tunnel origin
  const configured = process.env.CREDENCE_ORIGIN || process.env.PUBLIC_URL;
  if (configured && !configured.includes("localhost") && !configured.includes("127.0.0.1")) {
    return configured.replace(/\/+$/, "");
  }

  // 4. Default fallback to active ngrok domain
  return "https://peso-moonbeam-nacho.ngrok-free.dev";
}

/**
 * Dynamically rebases plain or URL-encoded localhost occurrences to the active public origin.
 */
function rebaseOrigin(urlStr, targetOrigin) {
  if (!urlStr || typeof urlStr !== "string") return urlStr;
  const effectiveOrigin = (targetOrigin && !targetOrigin.includes("localhost") && !targetOrigin.includes("127.0.0.1"))
    ? targetOrigin
    : (process.env.CREDENCE_ORIGIN || process.env.PUBLIC_URL || "https://peso-moonbeam-nacho.ngrok-free.dev").replace(/\/+$/, "");

  // Replace plain localhost:port
  let rebased = urlStr.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/g, effectiveOrigin);
  // Replace URL-encoded localhost:port (e.g. in openid4vp redirect_uri query params)
  const encodedLocalhostPattern = /https?%3A%2F%2F(localhost|127\.0\.0\.1)(%3A\d+)?/gi;
  if (encodedLocalhostPattern.test(rebased)) {
    rebased = rebased.replace(encodedLocalhostPattern, encodeURIComponent(effectiveOrigin));
  }
  return rebased;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/verification/session
// Creates a new verification session.
// In live mode (USE_MOCK=false), calls Credence Cloud API via Flow C: OpenID4VP
// with ISO mdoc to obtain the live `walletUri` QR payload.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/session", async (req, res) => {
  const sessionId = uuidv4();
  lastActiveSessionId = sessionId;

  // Dynamically derive active request origin at the exact moment of session creation
  const currentOrigin = resolveRequestOrigin(req);

  // Standard mobile web URL encoded into the desktop QR code:
  // When scanned by a smartphone camera, iOS/Android natively opens this web URL in Safari or Chrome!
  let mobileVerifyUrl = `${currentOrigin}/verify?session_id=${encodeURIComponent(sessionId)}`;
  if (currentOrigin.includes("ngrok")) {
    mobileVerifyUrl += `&ngrok-skip-browser-warning=true`;
  }
  const qrDataUrl = await generateQrDataUrl(mobileVerifyUrl);

  // Generate Apple Wallet Document Request (W3C Digital Credentials API: org-iso-mdoc)
  const docReqInfo = await credenceClient.getDocRequest(sessionId, req);
  const dcRequest = docReqInfo.dcRequest;

  // ── 1. Pure Mock Mode (if explicitly requested via USE_MOCK=true) ─────────
  if (isMock()) {
    console.log("[POST /session] Operating in local mock mode (USE_MOCK=true).");
    const engagementUri = buildEngagementUri(sessionId);
    const engagementQrDataUrl = await generateQrDataUrl(engagementUri);

    const session = {
      id: sessionId,
      status: "awaiting_scan",
      publicOrigin: currentOrigin,
      mobileVerifyUrl,
      qrPayload: mobileVerifyUrl,
      qrDataUrl,
      engagementUri,
      engagementQrDataUrl,
      walletUri: engagementUri,
      redirectUrl: `${currentOrigin}/callback?session_id=${encodeURIComponent(sessionId)}&mock_auth=true`,
      returnUrl: `${currentOrigin}/callback?session_id=${encodeURIComponent(sessionId)}`,
      dcRequest,
      protocol: "OpenID4VP Web Flow (Mock Mode)",
      profile: process.env.CREDENCE_PROFILE_NAME || "Age Check Profile 2.0",
      profileId: process.env.CREDENCE_PROFILE_ID || "1289dbb9-4d60-11f1-bf44-023b9538e812",
      createdAt: new Date().toISOString(),
      result: null,
      _liveMode: false,
    };
    sessions.set(sessionId, session);

    return res.status(201).json(session);
  }

  // ── 2. Live Credence Cloud SDK Integration (OpenID4VP Web Presentation Flow)
  try {
    console.log(`[POST /session] Live Mode active (USE_MOCK=false). Initiating OpenID4VP web redirect session with Credence Cloud...`);
    const returnUrl = `${currentOrigin}/callback?session_id=${encodeURIComponent(sessionId)}`;
    const liveSession = await credenceClient.createLiveSession(sessionId, req, returnUrl);

    // Exact online browser authorization redirect & wallet URI from Credence Cloud (rebased to currentOrigin)
    const liveWalletUri = rebaseOrigin(liveSession.walletUri, currentOrigin);
    const liveRedirectUrl = rebaseOrigin(liveSession.redirectUrl || liveSession.walletUri, currentOrigin);
    const engagementQrDataUrl = await generateQrDataUrl(liveWalletUri);

    const session = {
      id: sessionId,
      status: "awaiting_scan",
      publicOrigin: currentOrigin,
      mobileVerifyUrl,
      qrPayload: mobileVerifyUrl,
      qrDataUrl,
      engagementUri: liveWalletUri,
      engagementQrDataUrl,
      walletUri: liveWalletUri,
      redirectUrl: liveRedirectUrl,
      returnUrl: liveSession.returnUrl || returnUrl,
      dcRequest,
      protocol: "OpenID4VP Web Redirect Flow (Live Credence Cloud)",
      profile: process.env.CREDENCE_PROFILE_NAME || "Age Check Profile 2.0",
      profileId: process.env.CREDENCE_PROFILE_ID || "1289dbb9-4d60-11f1-bf44-023b9538e812",
      createdAt: new Date().toISOString(),
      result: null,
      _liveMode: true,
      _credenceSessionId: liveSession.cloudSessionId,
    };

    sessions.set(sessionId, session);
    console.log(`[POST /session] Live OpenID4VP web session created: ${sessionId} (Remote: ${liveSession.cloudSessionId})`);
    console.log(`[POST /session] Mobile Web URL (QR): ${mobileVerifyUrl}`);
    console.log(`[POST /session] Live redirectUrl: ${liveRedirectUrl.substring(0, 80)}...`);
    return res.status(201).json(session);
  } catch (liveErr) {
    // ── 3. Smart Fallback Safety Net ────────────────────────────────────────
    console.warn(`\n⚠️  [Credence Cloud Live API Failed]: ${liveErr.message}`);
    console.warn(`    Engaging Smart Fallback Safety Net: Generating OpenID4VP web fallback session.`);
    console.warn(`    Your local testing & checkout state machine will continue to function seamlessly.\n`);

    const fallbackUri = buildEngagementUri(sessionId);
    const engagementQrDataUrl = await generateQrDataUrl(fallbackUri);

    const fallbackSession = {
      id: sessionId,
      status: "awaiting_scan",
      publicOrigin: currentOrigin,
      mobileVerifyUrl,
      qrPayload: mobileVerifyUrl,
      qrDataUrl,
      engagementUri: fallbackUri,
      engagementQrDataUrl,
      walletUri: fallbackUri,
      redirectUrl: `${currentOrigin}/callback?session_id=${encodeURIComponent(sessionId)}&mock_auth=true`,
      returnUrl: `${currentOrigin}/callback?session_id=${encodeURIComponent(sessionId)}`,
      dcRequest,
      protocol: "OpenID4VP Web Flow (Local Fallback)",
      profile: process.env.CREDENCE_PROFILE_NAME || "Age Check Profile 2.0",
      profileId: process.env.CREDENCE_PROFILE_ID || "1289dbb9-4d60-11f1-bf44-023b9538e812",
      createdAt: new Date().toISOString(),
      result: null,
      _liveMode: false,
      _fallback: true,
      _liveError: liveErr.message,
    };

    sessions.set(sessionId, fallbackSession);
    return res.status(201).json(fallbackSession);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/verification/verify-doc
// Real mDL verification endpoint: receives and validates genuine credential
// returned from Apple Wallet (via W3C Digital Credentials API) or digital wallet app.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/verify-doc", async (req, res) => {
  try {
    const { sessionId, session_id, data, credential, walletResponse } = req.body;
    const targetId = sessionId || session_id || lastActiveSessionId;
    const session = targetId ? sessions.get(targetId) : null;

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const payload = data || credential || walletResponse;
    if (!payload) {
      return res.status(400).json({ error: "No credential data provided" });
    }

    console.log(`[POST /verify-doc] Received real mDL presentation for session ${targetId}`);
    clearSessionTimers(targetId);

    // Transition session to verifying state
    session.status = "verifying";
    session.updatedAt = new Date().toISOString();

    // 1. Attempt Credence Cloud SDK verification if active
    let verifiedAttributes = null;
    let trustInfo = null;

    try {
      const cloudRes = await credenceClient.verifyDocRequest(targetId, payload, req);
      if (cloudRes && (cloudRes.res === true || cloudRes.completed === true)) {
        verifiedAttributes = cloudRes.attributes || cloudRes.resDetails;
        trustInfo = cloudRes.trust;
      }
    } catch (cloudErr) {
      console.warn("[POST /verify-doc] Credence Cloud verifyDocRequest:", cloudErr.message);
    }

    // 2. Perform cryptographic & policy verification
    const verificationInput = verifiedAttributes
      ? { attributes: verifiedAttributes, trust: trustInfo }
      : payload;

    const result = verifyMdlPresentation(verificationInput, getMinAge(), targetId);

    session.status = "completed";
    session.result = result;
    session.updatedAt = new Date().toISOString();

    console.log(`[POST /verify-doc] Verification outcome for ${targetId}: ${result.decision} (${result.reason})`);
    console.log(`[POST /verify-doc] Extracted attributes for ${targetId}:`, {
      name: `${result.attributes.given_name || "—"} ${result.attributes.family_name || ""}`.trim(),
      birth_date: result.attributes.birth_date || "—",
      age_over_21: result.attributes.age_over_21,
      computed_age: result.policy.computed_age,
      issuing_authority: result.attributes.issuing_authority,
      doc_type: result.document?.friendly_type,
    });

    return res.json({
      success: true,
      sessionId: targetId,
      decision: result.decision,
      result,
    });
  } catch (err) {
    console.error("[POST /verify-doc] Error verifying credential:", err);
    return res.status(500).json({ error: "Failed to verify credential: " + err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/verification/mock-payload
// Manual mock payload handler: lets developers & presenters simulate scanning
// any preset scenario or custom ISO/IEC 18013-5 payload immediately without
// waiting or needing live hardware.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/mock-payload", async (req, res) => {
  try {
    const { session_id, scenario = "adult_verified", payload: customPayload, delay_ms = 700 } = req.body;

    let targetId = session_id || lastActiveSessionId;

    // If no session exists yet, create one automatically
    if (!targetId || !sessions.has(targetId)) {
      targetId = uuidv4();
      lastActiveSessionId = targetId;
      const engagementUri = buildEngagementUri(targetId);
      const qrDataUrl = await generateQrDataUrl(engagementUri);
      const newSession = {
        id: targetId,
        status: "awaiting_scan",
        qrPayload: engagementUri,
        qrDataUrl: qrDataUrl,
        engagementUri: engagementUri,
        protocol: "ISO/IEC 18013-5 (mdoc)",
        createdAt: new Date().toISOString(),
        result: null,
      };
      sessions.set(targetId, newSession);
    }

    const session = sessions.get(targetId);

    // Determine payload to evaluate
    let payloadToEvaluate = null;
    if (customPayload) {
      payloadToEvaluate = customPayload;
    } else if (MOCK_SCENARIOS[scenario]) {
      payloadToEvaluate = MOCK_SCENARIOS[scenario].payload;
    } else {
      return res.status(400).json({
        error: `Unknown scenario '${scenario}'.`,
        available_scenarios: Object.keys(MOCK_SCENARIOS),
      });
    }

    // Process and advance the state machine
    const result = applyMockPayloadToSession(session, payloadToEvaluate, delay_ms);

    return res.json({
      success: true,
      message: `Mock payload processed for session ${session.id}`,
      scenario_applied: scenario,
      session_id: session.id,
      status: session.status,
      decision: result.decision,
      result: result,
    });
  } catch (err) {
    console.error("[POST /mock-payload]", err);
    return res.status(500).json({ error: "Failed to process mock payload" });
  }
});

// Route alias for convenience: POST /session/:id/simulate
router.post("/session/:id/simulate", (req, res) => {
  req.body = { ...req.body, session_id: req.params.id };
  return router.handle(req, res);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/verification/session/:id/cancel
// Cancels an active verification session and clears associated timers.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/session/:id/cancel", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  clearSessionTimers(session.id);
  session.status = "cancelled";
  session.updatedAt = new Date().toISOString();

  return res.json({ success: true, message: "Session cancelled", session_id: session.id });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/verification/session/:id
// Polling endpoint for kiosk frontend.
// In live mode, actively queries Credence Cloud to check if a remote wallet has completed verification.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/session/:id", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  // If live mode is active and session is pending, poll Credence Cloud
  if (session._liveMode === true && session.status !== "completed" && session.status !== "cancelled") {
    try {
      const cloudStatus = await credenceClient.checkSessionStatus(
        session._credenceSessionId || session.id,
        req
      );

      if (cloudStatus.completed) {
        console.log(`[GET /session/${session.id}] Credence Cloud reported verified presentation via OpenID4VP!`);
        const result = verifyMdlPresentation(
          { identity: cloudStatus.attributes, attributes: cloudStatus.attributes, trust: cloudStatus.trust },
          getMinAge()
        );
        session.status = "completed";
        session.result = result;
        session.updatedAt = new Date().toISOString();
      } else if (cloudStatus.status && cloudStatus.status !== session.status) {
        session.status = cloudStatus.status;
        session.updatedAt = new Date().toISOString();
      }
    } catch (pollErr) {
      // Non-blocking log during live polling
      console.warn(`[GET /session/${session.id}] Credence Cloud query failed:`, pollErr.message);
    }
  }

  // Dynamically rebase URLs to active public tunnel origin
  const currentOrigin = resolveRequestOrigin(req);
  const outSession = { ...session };
  outSession.publicOrigin = currentOrigin;

  if (outSession.redirectUrl) outSession.redirectUrl = rebaseOrigin(outSession.redirectUrl, currentOrigin);
  if (outSession.returnUrl) outSession.returnUrl = rebaseOrigin(outSession.returnUrl, currentOrigin);
  if (outSession.mobileVerifyUrl) outSession.mobileVerifyUrl = rebaseOrigin(outSession.mobileVerifyUrl, currentOrigin);
  if (outSession.qrPayload) outSession.qrPayload = rebaseOrigin(outSession.qrPayload, currentOrigin);
  if (outSession.walletUri) outSession.walletUri = rebaseOrigin(outSession.walletUri, currentOrigin);
  if (outSession.engagementUri) outSession.engagementUri = rebaseOrigin(outSession.engagementUri, currentOrigin);

  // Ensure ngrok-skip-browser-warning parameter is present on mobile URL when accessed over ngrok
  if (currentOrigin.includes("ngrok") && outSession.mobileVerifyUrl && !outSession.mobileVerifyUrl.includes("ngrok-skip-browser-warning")) {
    const sep = outSession.mobileVerifyUrl.includes("?") ? "&" : "?";
    outSession.mobileVerifyUrl = `${outSession.mobileVerifyUrl}${sep}ngrok-skip-browser-warning=true`;
  }

  return res.json(outSession);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/verification/webhook
// Webhook for CredenceID Cloud callback.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/webhook", (req, res) => {
  try {
    const { session_id, attributes, trust_info, raw_payload } = req.body;

    const session = sessions.get(session_id);
    if (!session) {
      return res.status(404).json({ error: "Unknown session" });
    }

    clearSessionTimers(session_id);

    const payload = raw_payload || { attributes, trust: trust_info };
    const result = verifyMdlPresentation(payload, getMinAge());

    session.status = "completed";
    session.result = result;
    session.updatedAt = new Date().toISOString();

    return res.json({ status: "processed", session_id });
  } catch (err) {
    console.error("[POST /webhook] Error:", err);
    return res.status(500).json({ error: "Failed to process webhook" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/verification/callback
// Handles browser redirect from digital wallet after user grants authorization.
// Exchanges response_code via Credence resume endpoint or falls back gracefully.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/callback", async (req, res) => {
  try {
    const {
      session_id,
      sessionId,
      state,
      response_code,
      responseCode,
      code,
      scenario,
    } = req.query;

    const resolvedSessionId = session_id || sessionId || state || lastActiveSessionId;
    const resolvedResponseCode = response_code || responseCode || code;

    console.log(`[GET /callback] Received wallet redirect: sessionId=${resolvedSessionId}, responseCode=${resolvedResponseCode}`);

    const session = resolvedSessionId ? sessions.get(resolvedSessionId) : null;

    if (resolvedResponseCode) {
      try {
        const resumeData = await credenceClient.resumeSession(resolvedResponseCode, req);
        if (resumeData.completed && session) {
          const result = verifyMdlPresentation(
            { identity: resumeData.attributes, attributes: resumeData.attributes, trust: resumeData.trust },
            getMinAge()
          );
          session.status = "completed";
          session.result = result;
          session.updatedAt = new Date().toISOString();
        }
      } catch (resumeErr) {
        console.warn("[GET /callback] Resume endpoint error:", resumeErr.message);
      }
    } else if (session && session.status !== "completed") {
      const isExplicitMock = req.query.mock_auth === "true" || req.query.simulate === "true" || Boolean(scenario);
      if (isExplicitMock) {
        // Direct mock/fallback authorization when explicitly triggered by demo simulator
        const scenarioKey = scenario || "adult_verified";
        const mockPayload = MOCK_SCENARIOS[scenarioKey]?.payload || MOCK_SCENARIOS.adult_verified.payload;
        const result = verifyMdlPresentation(mockPayload, getMinAge());
        session.status = "completed";
        session.result = result;
        session.updatedAt = new Date().toISOString();
      } else {
        console.log(`[GET /callback] Redirect without authorization code or explicit mock flag. Waiting for wallet response.`);
      }
    }

    const sid = session ? session.id : (resolvedSessionId || "");
    const currentOrigin = resolveRequestOrigin(req);
    return res.redirect(`${currentOrigin}/?session_id=${encodeURIComponent(sid)}&callback=true`);
  } catch (err) {
    console.error("[GET /callback] Error:", err);
    const currentOrigin = resolveRequestOrigin(req);
    return res.redirect(`${currentOrigin}/?callback_error=true`);
  }
});

router.resolveRequestOrigin = resolveRequestOrigin;

module.exports = router;

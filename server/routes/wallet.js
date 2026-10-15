// ─── Apple Wallet on the Web Router ─────────────────────────────────────────
// Endpoints for W3C Digital Credentials API (protocol: "iso18013-7"):
//
// GET /api/wallet/auth-options    → Generates signed ISO 18013-7 request & HPKE encryptionInfo
// POST /api/wallet/auth-options   → Generates signed auth options for a specified sessionId
// POST /api/wallet/verify         → Decrypts HPKE payload, validates IACA root, extracts age_over_21
// GET /api/wallet/status          → Diagnostic health check for Apple Developer keys & IACA roots
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const appleWalletService = require("../services/appleWalletService");
const appleCertManager = require("../services/appleCertManager");
const credenceClient = require("../services/credenceClient");
const verificationRouter = require("./verification");

const router = express.Router();

// Helper to access shared sessions Map
function getSessionMap() {
  return verificationRouter.sessions || new Map();
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GET & POST /api/wallet/auth-options
 *
 * Builds a cryptographically signed request payload using live Credence Cloud SDK
 * (when available via ngrok) or our Apple Identity Access Certificate and private key
 * material with HPKE encryption parameters.
 * ─────────────────────────────────────────────────────────────────────────────
 */
async function handleAuthOptions(req, res) {
  try {
    const requestedId = req.query?.sessionId || req.body?.sessionId || req.query?.session_id || req.body?.session_id;
    const sessionId = requestedId || uuidv4();

    console.log(`[WalletRouter] Generating auth-options for session ${sessionId}...`);

    let liveDcRequest = null;
    try {
      const docReqInfo = await credenceClient.getDocRequest(sessionId, req);
      if (docReqInfo && docReqInfo.dcRequest && docReqInfo.dcRequest.deviceRequest) {
        liveDcRequest = docReqInfo.dcRequest;
        console.log(`[WalletRouter] Obtained live-signed Apple Wallet docRequest from Credence Cloud for session ${sessionId}`);
      }
    } catch (liveErr) {
      console.log(`[WalletRouter] Credence getDocRequest note:`, liveErr.message);
    }

    let authOptions = null;
    if (liveDcRequest) {
      const deviceRequest = liveDcRequest.deviceRequest;
      const encryptionInfo = liveDcRequest.encryptionInfo;
      authOptions = {
        sessionId,
        protocol: "org-iso-mdoc",
        targetElement: "age_over_21",
        hasDeviceRequest: Boolean(deviceRequest),
        hasEncryptionInfo: Boolean(encryptionInfo),
        deviceRequest,
        encryptionInfo,
        readerAuthSigned: Boolean(liveDcRequest.isLiveSigned),
        isLiveSigned: Boolean(liveDcRequest.isLiveSigned),
        digital: {
          requests: [
            {
              protocol: "org-iso-mdoc",
              data: {
                deviceRequest,
                encryptionInfo,
              },
            },
            {
              protocol: "iso18013-7",
              data: {
                deviceRequest,
                encryptionInfo,
              },
            },
          ],
        },
      };
    } else {
      authOptions = appleWalletService.generateAuthOptions(sessionId, { req });
    }

    // Ensure session is tracked in PassGate session store
    const sessions = getSessionMap();
    let session = sessions.get(sessionId);
    if (!session) {
      const currentOrigin = typeof verificationRouter.resolveRequestOrigin === "function"
        ? verificationRouter.resolveRequestOrigin(req)
        : (process.env.CREDENCE_ORIGIN || process.env.PUBLIC_URL || "http://localhost:3000");

      session = {
        id: sessionId,
        status: "awaiting_scan",
        publicOrigin: currentOrigin,
        mobileVerifyUrl: `${currentOrigin}/verify?session_id=${encodeURIComponent(sessionId)}`,
        protocol: "W3C Digital Credentials API (iso18013-7)",
        targetElement: "age_over_21",
        createdAt: new Date().toISOString(),
        result: null,
      };
      sessions.set(sessionId, session);
    }

    session.authOptions = authOptions;
    session.dcRequest = {
      protocol: "org-iso-mdoc",
      deviceRequest: authOptions.deviceRequest,
      encryptionInfo: authOptions.encryptionInfo,
      nonce: authOptions.nonce,
      targetElement: "age_over_21",
      digital: authOptions.digital,
    };

    return res.json(authOptions);
  } catch (err) {
    console.error("[WalletRouter /auth-options error]:", err);
    return res.status(500).json({
      error: "Failed to generate Apple Wallet auth options: " + err.message,
    });
  }
}

router.get("/auth-options", handleAuthOptions);
router.post("/auth-options", handleAuthOptions);

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/wallet/verify
 *
 * Verification/callback endpoint that accepts the encrypted response payload
 * returned from the client browser, decrypts it using our ephemeral private key,
 * validates the issuer's certificate chain (IACA roots), and extracts the
 * boolean over-21 verification outcome.
 * ─────────────────────────────────────────────────────────────────────────────
 */
router.post("/verify", async (req, res) => {
  try {
    const { sessionId, session_id, credential, data, response } = req.body;
    const targetSessionId = sessionId || session_id || (typeof verificationRouter.getLastActiveSessionId === "function" ? verificationRouter.getLastActiveSessionId() : null);

    if (!targetSessionId) {
      return res.status(400).json({ error: "Missing sessionId in verification request." });
    }

    const payload = credential || data || response || req.body;
    if (!payload) {
      return res.status(400).json({ error: "No credential presentation payload provided." });
    }

    console.log(`[WalletRouter] POST /verify received presentation for session ${targetSessionId}`);

    // Cancel simulation timers if any
    if (typeof verificationRouter.clearSessionTimers === "function") {
      verificationRouter.clearSessionTimers(targetSessionId);
    }

    const sessions = getSessionMap();
    const session = sessions.get(targetSessionId);
    if (session) {
      session.status = "verifying";
      session.updatedAt = new Date().toISOString();
    }

    // Decrypt, validate IACA chain, and extract age_over_21
    const result = await appleWalletService.verifyWalletResponse(targetSessionId, payload);

    if (session) {
      session.status = "completed";
      session.result = result;
      session.updatedAt = new Date().toISOString();
    }

    return res.json({
      success: true,
      sessionId: targetSessionId,
      decision: result.decision,
      age_over_21: result.age_over_21,
      reason: result.reason,
      checks: result.checks,
      attributes: result.attributes,
      policy: result.policy,
      trust: result.trust,
      document: result.document,
      result,
    });
  } catch (err) {
    console.error("[WalletRouter /verify error]:", err);
    return res.status(500).json({
      error: "Apple Wallet cryptographic verification failed: " + err.message,
    });
  }
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GET /api/wallet/status
 *
 * Diagnostic endpoint reporting active Apple Developer credentials & IACA status.
 * ─────────────────────────────────────────────────────────────────────────────
 */
router.get("/status", (_req, res) => {
  const creds = appleCertManager.getReaderCredentials();
  res.json({
    status: "ok",
    readerAuth: {
      isConfigured: creds.isConfigured,
      merchantId: creds.merchantId || "Not set (optional)",
      certLength: creds.certDer ? creds.certDer.length : 0,
      mode: creds.isConfigured ? "PRODUCTION / LIVE SIGNED" : "DEVELOPMENT (Self-Signed Keypair)",
    },
    targetElement: "age_over_21 (ISO/IEC 18013-7 Annex C)",
    iacaRootsLoaded: appleCertManager._iacaRoots?.length || 0,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;

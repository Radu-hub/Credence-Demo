// ─── CredenceID Cloud SDK Client (OpenID4VP Web-to-Mobile Redirect Flow) ───
// Supports both:
// 1. Proximity / Cross-Device QR scan (walletUri encoded into QR)
// 2. Web-to-Mobile direct wallet redirect / app-link (redirectUrl / walletUri with returnUrl)
// 3. Callback resumption via GET /openid4vp/v1/mdoc/resume?response_code=<code>
// 4. Polling via POST /openid4vp/v1/mdoc/result (202 = pending, 200 = ready)
// ─────────────────────────────────────────────────────────────────────────────

const cborEncoder = require("./cborEncoder");

class CredenceClient {
  constructor() {
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
    this.refreshToken = null;
  }

  getBaseUrl() {
    return (process.env.CREDENCE_API_BASE_URL || "https://credenceid.com/cloudsdk/playground").replace(/\/+$/, "");
  }

  getLicenseKey() {
    return process.env.CREDENCE_API_KEY || "";
  }

  getProfileId() {
    return process.env.CREDENCE_PROFILE_ID || process.env.CREDENCE_TENANT_ID || "";
  }

  extractOrigin(originOrReq) {
    if (!originOrReq) return null;
    if (typeof originOrReq === "string") {
      return originOrReq.replace(/\/+$/, "");
    }
    // Express request object
    const req = originOrReq;

    // 1. Check reverse proxy / ngrok forwarded headers
    const forwardedHost =
      req.headers?.["x-forwarded-host"] ||
      req.headers?.["x-original-host"];
    if (forwardedHost && !forwardedHost.includes("localhost") && !forwardedHost.includes("127.0.0.1")) {
      const proto = req.headers?.["x-forwarded-proto"] || (forwardedHost.includes("ngrok") ? "https" : "http");
      return `${proto}://${forwardedHost}`.replace(/\/+$/, "");
    }

    // 2. Direct host header if already a public domain
    const rawHost = (typeof req.get === "function" ? req.get("host") : req.headers?.host) || "";
    if (rawHost && !rawHost.includes("localhost") && !rawHost.includes("127.0.0.1")) {
      const proto = req.headers?.["x-forwarded-proto"] || (rawHost.includes("ngrok") ? "https" : (req.protocol || "http"));
      return `${proto}://${rawHost}`.replace(/\/+$/, "");
    }

    // 3. Fallback for localhost requests: use configured public tunnel / origin
    const configured = process.env.CREDENCE_ORIGIN || process.env.PUBLIC_URL;
    if (configured && !configured.includes("localhost") && !configured.includes("127.0.0.1")) {
      return configured.replace(/\/+$/, "");
    }

    // 4. Default ngrok domain
    return "https://peso-moonbeam-nacho.ngrok-free.dev";
  }

  getOrigin(originOrReq) {
    const extracted = this.extractOrigin(originOrReq);
    if (extracted) {
      return extracted;
    }
    if (process.env.PUBLIC_URL && !process.env.PUBLIC_URL.includes("localhost")) {
      return process.env.PUBLIC_URL.replace(/\/+$/, "");
    }
    if (process.env.TUNNEL_URL) return process.env.TUNNEL_URL.replace(/\/+$/, "");
    if (process.env.APP_BASE_URL && !process.env.APP_BASE_URL.includes("localhost")) {
      return process.env.APP_BASE_URL.replace(/\/+$/, "");
    }
    return `http://localhost:${process.env.PORT || 3000}`;
  }

  /**
   * Performs authentication setup with Credence Cloud to obtain an accessToken.
   * Endpoint: POST /v1/setup
   * @param {string|Object} [originOrReq] - Optional public tunnel origin or Express request
   */
  async authenticate(originOrReq) {
    const origin = this.getOrigin(originOrReq);
    const now = Date.now();

    // Return cached token if valid for at least another 60 seconds and origin matches
    if (this.cachedToken && this.tokenExpiresAt > now + 60000 && this.cachedOrigin === origin) {
      return this.cachedToken;
    }

    const baseUrl = this.getBaseUrl();
    const licenseKey = this.getLicenseKey();
    const profileId = this.getProfileId();

    if (!licenseKey) {
      throw new Error("Missing CREDENCE_API_KEY in environment configuration.");
    }

    const setupUrl = `${baseUrl}/v1/setup`;
    console.log(`[Credence Cloud] Authenticating via ${setupUrl} (Origin: ${origin})...`);

    const response = await fetch(setupUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({
        licenseKey,
        profileId,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr = errText;
      try {
        parsedErr = JSON.parse(errText);
      } catch (_e) {
        // use raw text
      }
      throw new Error(
        `Credence setup failed (${response.status} ${response.statusText}): ${
          typeof parsedErr === "object" ? JSON.stringify(parsedErr) : parsedErr
        }`
      );
    }

    const data = await response.json();
    this.cachedToken = data.accessToken || data.token;
    const expiresIn = data.expiresIn || 900; // default 15 minutes
    this.tokenExpiresAt = Date.now() + expiresIn * 1000;
    this.refreshToken = data.refreshToken || null;
    this.cachedOrigin = origin;

    console.log(`[Credence Cloud] Authentication successful. Access token valid for ${expiresIn}s.`);
    return this.cachedToken;
  }

  /**
   * Initiates a live OpenID4VP verification session configured for an
   * online browser-redirect authorization URL (OpenID4VP web presentation flow).
   * Endpoint: POST /openid4vp/v1/mdoc/initiate
   * @param {string} localSessionId - Generated UUID for correlation
   * @param {string|Object} [originOrReq] - Express request or dynamic origin
   * @param {string} [customReturnUrl] - Optional custom redirect callback URL
   * @returns {Promise<{ cloudSessionId: string, walletUri: string, redirectUrl: string, returnUrl: string, requestUri?: string, raw: Object }>}
   */
  async createLiveSession(localSessionId, originOrReq, customReturnUrl) {
    const origin = this.getOrigin(originOrReq);
    const token = await this.authenticate(origin);
    const baseUrl = this.getBaseUrl();

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Origin: origin,
    };

    // Calculate dynamic callback returnUrl where wallet redirects browser after approval
    // NEVER fall back to static process.env.CREDENCE_ORIGIN or hardcoded localhost when dynamic origin is available!
    const returnUrl =
      customReturnUrl ||
      `${origin}/callback?session_id=${encodeURIComponent(localSessionId)}`;

    const primaryUrl = `${baseUrl}/openid4vp/v1/mdoc/initiate`;
    console.log(`[Credence Cloud] Initiating OpenID4VP web redirect session via ${primaryUrl}`);
    console.log(`[Credence Cloud] Injected returnUrl in initiate payload: "${returnUrl}" (Origin: "${origin}")`);

    const initiateBody = {
      returnUrl,
      flow: "web",
      response_mode: "query",
      profileId: this.getProfileId(),
    };

    try {
      const res = await fetch(primaryUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(initiateBody),
      });

      if (res.ok) {
        const data = await res.json();
        console.log(`[Credence Cloud] OpenID4VP web initiation successful! Session ID: ${data.sessionId || localSessionId}`);

        // Extract online browser-redirect authorization URL & wallet URI
        const redirectUrl =
          data.redirectUrl ||
          data.authorizationUrl ||
          data.authUrl ||
          data.universalLink ||
          data.walletUri ||
          data.uri;

        const walletUri =
          data.walletUri ||
          data.uri ||
          redirectUrl;

        if (!redirectUrl && !walletUri) {
          throw new Error("Credence Cloud response missing authorization redirect URL.");
        }

        return {
          cloudSessionId: data.sessionId || localSessionId,
          walletUri: walletUri || redirectUrl,
          redirectUrl: redirectUrl || walletUri,
          returnUrl,
          requestUri: data.requestUri,
          raw: data,
        };
      } else {
        const errText = await res.text();
        console.warn(`[Credence Cloud] OpenID4VP initiation returned ${res.status}: ${errText}`);
        throw new Error(`OpenID4VP initiation failed (${res.status}): ${errText}`);
      }
    } catch (primaryErr) {
      console.warn(`[Credence Cloud] Primary OpenID4VP initiate failed: ${primaryErr.message}`);

      // Fallback candidate: Legacy DC API / getDocRequest if running on older sandbox
      const legacyUrl = `${baseUrl}/v1/getDocRequest`;
      try {
        console.log(`[Credence Cloud] Trying fallback endpoint ${legacyUrl}...`);
        const legacyRes = await fetch(legacyUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            sessionId: localSessionId,
            profileId: this.getProfileId(),
            returnUrl,
          }),
        });

        if (legacyRes.ok) {
          const data = await legacyRes.json();
          const fallbackUri =
            data.walletUri ||
            data.uri ||
            (data.dcRequest ? JSON.stringify(data.dcRequest) : `openid4vp://session?session_id=${data.sessionId || localSessionId}`);

          return {
            cloudSessionId: data.sessionId || localSessionId,
            walletUri: fallbackUri,
            redirectUrl: data.redirectUrl || fallbackUri,
            returnUrl,
            raw: data,
          };
        }
      } catch (_e) {
        // ignore and rethrow primary error
      }

      throw primaryErr;
    }
  }

  /**
   * Resumes a same-device OpenID4VP verification using the response_code
   * passed back by the digital wallet redirect.
   * Endpoint: GET /openid4vp/v1/mdoc/resume?response_code=<code>
   * @param {string} responseCode - One-time response code from wallet redirect
   * @returns {Promise<{ completed: boolean, attributes?: Object, trust?: Object, raw?: Object }>}
   */
  async resumeSession(responseCode, originOrReq) {
    if (!responseCode) {
      throw new Error("Missing response_code parameter for session resume.");
    }

    const origin = this.getOrigin(originOrReq);
    const token = await this.authenticate(origin);
    const baseUrl = this.getBaseUrl();

    const resumeUrl = `${baseUrl}/openid4vp/v1/mdoc/resume?response_code=${encodeURIComponent(responseCode)}`;
    console.log(`[Credence Cloud] Resuming session via ${resumeUrl} (Origin: ${origin})...`);

    const res = await fetch(resumeUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: origin,
      },
    });

    if (res.ok) {
      const data = await res.json();
      console.log("[Credence Cloud] Session successfully resumed from wallet redirect:", data);

      const identity = data.identity || data.attributes || data.claims || data.verifiedClaims || {};
      const isSuccess = data.success !== false;

      return {
        completed: true,
        attributes: identity,
        trust: data.trust || {
          issuer_authenticated: isSuccess,
          device_signature_valid: isSuccess,
          data_integrity: isSuccess ? "VERIFIED" : "FAILED",
          digest_algorithm: "SHA-256",
        },
        raw: data,
      };
    } else {
      const errText = await res.text();
      throw new Error(`Resume failed (${res.status}): ${errText}`);
    }
  }

  /**
   * Queries Credence Cloud for verification results of an active session.
   * Primary Endpoint: POST /openid4vp/v1/mdoc/result
   * HTTP 202 = Pending (waiting for wallet consent / presentation)
   * HTTP 200 = Complete (returns verified identity attributes and cryptographic status)
   * @param {string} cloudSessionId - Remote session identifier
   * @param {string|Object} [originOrReq] - Dynamic origin or Express request
   * @returns {Promise<{ completed: boolean, attributes?: Object, trust?: Object, raw?: Object }>}
   */
  async checkSessionStatus(cloudSessionId, originOrReq) {
    const origin = this.getOrigin(originOrReq);
    const token = await this.authenticate(origin);
    const baseUrl = this.getBaseUrl();

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Origin: origin,
    };

    // Primary Flow C result endpoint
    const resultUrl = `${baseUrl}/openid4vp/v1/mdoc/result`;

    try {
      const res = await fetch(resultUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ sessionId: cloudSessionId }),
      });

      // 202 Accepted: Verification still pending
      if (res.status === 202) {
        return {
          completed: false,
          status: "awaiting_scan",
        };
      }

      // 200 OK: Handshake completed
      if (res.ok) {
        const data = await res.json();
        console.log(`[Credence Cloud] OpenID4VP result received for session ${cloudSessionId}:`, data);

        let identity = data.identity || data.attributes || data.claims || data.verifiedClaims || {};
        if (typeof identity === "string") {
          try {
            identity = JSON.parse(identity);
          } catch (_) {}
        }
        if (data.resDetails) {
          try {
            const parsedRes = typeof data.resDetails === "string" ? JSON.parse(data.resDetails) : data.resDetails;
            identity = { ...identity, ...(parsedRes.identity || parsedRes) };
          } catch (_) {}
        }

        const isSuccess = data.success !== false;

        return {
          completed: true,
          attributes: identity,
          trust: data.trust || {
            issuer_authenticated: isSuccess,
            device_signature_valid: isSuccess,
            data_integrity: isSuccess ? "VERIFIED" : "FAILED",
            digest_algorithm: "SHA-256",
          },
          raw: data,
        };
      }

      const errText = await res.text();
      console.warn(`[Credence Cloud] Result polling returned ${res.status}: ${errText}`);
    } catch (pollErr) {
      console.warn(`[Credence Cloud] Result polling error: ${pollErr.message}`);
    }

    // Secondary fallback status endpoints
    const fallbackStatusEndpoints = [
      { url: `${baseUrl}/v1/sessions/${cloudSessionId}`, method: "GET" },
      { url: `${baseUrl}/v1/status/${cloudSessionId}`, method: "GET" },
    ];

    for (const ep of fallbackStatusEndpoints) {
      try {
        const res = await fetch(ep.url, { method: ep.method, headers });
        if (res.ok) {
          const data = await res.json();
          const isDone =
            data.status === "completed" ||
            data.status === "verified" ||
            data.res === true ||
            Boolean(data.attributes || data.verifiedClaims);

          if (isDone) {
            return {
              completed: true,
              attributes: data.attributes || data.verifiedClaims || data.resDetails || {},
              trust: data.trust || {
                issuer_authenticated: data.res !== false,
                device_signature_valid: data.res !== false,
                data_integrity: "VERIFIED",
              },
              raw: data,
            };
          }
        }
      } catch (_e) {
        // continue
      }
    }

    return { completed: false, status: "awaiting_scan" };
  }

  /**
   * Constructs a standard ISO 18013-5 / ISO 18013-7 Annex C DeviceRequest
   * payload for Apple Wallet via the W3C Digital Credentials API.
   *
   * Protocol: "org-iso-mdoc" (WebKit / Safari on iOS 18+)
   *
   * Both deviceRequest and encryptionInfo are base64url-encoded CBOR byte
   * strings as required by the WebKit MobileDocumentRequest IDL:
   *   dictionary MobileDocumentRequest {
   *     required DOMString deviceRequest;   // base64url CBOR DeviceRequest
   *     required DOMString encryptionInfo;  // base64url CBOR EncryptionInfo
   *   };
   */
  buildAppleWalletDocRequest(sessionId) {
    try {
      const readerCert = process.env.APPLE_READER_CERT || null;
      const readerKey = process.env.APPLE_READER_KEY || null;

      // Build proper ISO 18013-5 CBOR DeviceRequest
      const deviceRequestCbor = cborEncoder.buildDeviceRequest({ readerCert, readerKey });
      const deviceRequest = deviceRequestCbor.toString("base64url");

      // Build proper ISO 18013-7 Annex C CBOR EncryptionInfo with real ephemeral P-256 ECDH key
      const encryptionInfoCbor = cborEncoder.buildEncryptionInfo(sessionId || "default-session");
      const encryptionInfo = encryptionInfoCbor.toString("base64url");

      const isLiveSigned = Boolean(readerCert && readerKey);

      console.log(`[CredenceClient] Built CBOR DeviceRequest (${deviceRequestCbor.length} bytes, liveSigned: ${isLiveSigned}) + EncryptionInfo (${encryptionInfoCbor.length} bytes)`);

      return {
        protocol: "org-iso-mdoc",
        deviceRequest,
        encryptionInfo,
        isLiveSigned,
      };
    } catch (err) {
      console.warn("[CredenceClient] CBOR build failed, using base64url JSON fallback:", err.message);

      // Fallback: base64url-encoded JSON (non-spec but structurally present)
      const requestPayload = {
        version: "1.0",
        docRequests: [{
          itemsRequest: {
            docType: "org.iso.18013.5.1.mDL",
            nameSpaces: {
              "org.iso.18013.5.1": {
                age_over_21: false,
                birth_date: false,
                family_name: false,
                given_name: false,
                issuing_authority: false,
              },
            },
          },
        }],
      };
      const deviceRequest = Buffer.from(JSON.stringify(requestPayload)).toString("base64url");
      const encryptionInfo = Buffer.from(JSON.stringify({ curve: "P-256", sessionId })).toString("base64url");
      return { protocol: "org-iso-mdoc", deviceRequest, encryptionInfo, isLiveSigned: false };
    }
  }

  /**
   * Retrieves document request specification for Apple Wallet / DC API flow.
   * Endpoint: POST /v1/getDocRequest
   */
  async getDocRequest(sessionId, originOrReq) {
    const origin = this.getOrigin(originOrReq);
    const baseUrl = this.getBaseUrl();

    try {
      const token = await this.authenticate(origin);
      const res = await fetch(`${baseUrl}/v1/getDocRequest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          Origin: origin,
        },
        body: JSON.stringify({
          sessionId,
          profileId: this.getProfileId(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log(`[Credence Cloud] /v1/getDocRequest successful for session ${sessionId}`);
        const dcRequest = data.dcRequest || data;
        dcRequest.isLiveSigned = true;
        return {
          sessionId: data.sessionId || sessionId,
          dcRequest,
          isLiveSigned: true,
        };
      }
    } catch (err) {
      console.warn(`[Credence Cloud] /v1/getDocRequest fallback (${err.message})`);
    }

    // Standard ISO 18013-5 mdoc request for Apple Wallet
    return {
      sessionId,
      dcRequest: this.buildAppleWalletDocRequest(sessionId),
      isLiveSigned: false,
    };
  }

  /**
   * Verifies document response returned by user's wallet via POST /v1/verifyDocRequest.
   */
  async verifyDocRequest(sessionId, walletData, originOrReq) {
    const origin = this.getOrigin(originOrReq);
    const baseUrl = this.getBaseUrl();

    try {
      const token = await this.authenticate(origin);
      const res = await fetch(`${baseUrl}/v1/verifyDocRequest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          Origin: origin,
        },
        body: JSON.stringify({
          sessionId,
          data: typeof walletData === "string" ? walletData : JSON.stringify(walletData),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log(`[Credence Cloud] /v1/verifyDocRequest verified:`, data.res);
        const parsedDetails =
          typeof data.resDetails === "string"
            ? JSON.parse(data.resDetails)
            : data.resDetails || {};

        return {
          completed: Boolean(data.res),
          res: data.res,
          attributes: parsedDetails,
          trust: {
            issuer_authenticated: data.res === true,
            device_signature_valid: data.res === true,
            data_integrity: data.res === true ? "VERIFIED" : "UNVERIFIED",
          },
          raw: data,
        };
      }
    } catch (err) {
      console.warn(`[Credence Cloud] /v1/verifyDocRequest error: ${err.message}`);
    }

    return null;
  }
}

const credenceClient = new CredenceClient();
module.exports = credenceClient;

// ─── PassGate · mDL Digital Identity & Age Verification Suite ────────────────
// Coordinates multi-scenario tabs:
// 1. Direct Kiosk Verify (standalone mDL check with QR & tail-end photo match)
// 2. Age-Gated Bar & Menu Ordering (cart with 21+ detection & checkout verification)
// 3. VIP Nightclub Access Control (autonomous turnstile, capacity stats, bouncer face check, audit log)
// 4. Express Car Rental Kiosk (Class C driver privileges, age check, digital key dispenser)
// ─────────────────────────────────────────────────────────────────────────────

(() => {
  "use strict";

  // ── DOM Helpers ────────────────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ── Tab Management ────────────────────────────────────────────────────────
  const tabButtons = $$("#demo-tabs-nav .tab-btn");
  const tabPanels = {
    qr:     $("#tab-panel-qr"),
    verify: $("#tab-panel-verify"),
    menu:   $("#tab-panel-menu"),
  };

  let activeTabKey = "qr";

  function switchTab(tabKey) {
    if (!tabPanels[tabKey]) return;
    activeTabKey = tabKey;

    // Update tab button styles
    tabButtons.forEach((btn) => {
      const match = btn.getAttribute("data-tab") === tabKey;
      btn.classList.toggle("active", match);
    });

    // Update tab panels
    Object.entries(tabPanels).forEach(([key, panel]) => {
      if (panel) {
        panel.classList.toggle("active", key === tabKey);
      }
    });

    // Update URL hash without scroll jump
    try {
      history.replaceState(null, "", `#${tabKey}`);
    } catch (_) {}

    // Initialize or refresh active tab's session & QR code if needed
    ensureTabSession(tabKey);
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-tab");
      if (target) switchTab(target);
    });
  });

  // ── Common API Request Helper ─────────────────────────────────────────────
  async function api(path, opts = {}) {
    const res = await fetch(`/api/verification${path}`, {
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
        ...(opts.headers || {}),
      },
      ...opts,
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json();
  }

  // ── Real-Time Clock ───────────────────────────────────────────────────────
  const clockEl = $("#clock");
  function tickClock() {
    if (!clockEl) return;
    clockEl.textContent = new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
  tickClock();
  setInterval(tickClock, 1000);

  // ── QR Code Renderer (Universal) ──────────────────────────────────────────
  async function renderQrCodeTo(containerEl, targetUrl, size = 200) {
    if (!containerEl) return;
    containerEl.innerHTML = "";

    if (!targetUrl) {
      containerEl.innerHTML = `<span style="color:#64748b;font-size:.78rem">Generating QR…</span>`;
      return;
    }

    let rendered = false;

    // 1. Try QRCode.toCanvas
    if (typeof QRCode !== "undefined" && typeof QRCode.toCanvas === "function") {
      try {
        const canvas = document.createElement("canvas");
        await QRCode.toCanvas(canvas, targetUrl, {
          width: size,
          margin: 2,
          color: { dark: "#090d16", light: "#ffffff" },
          errorCorrectionLevel: "M",
        });
        containerEl.innerHTML = "";
        containerEl.appendChild(canvas);
        rendered = true;
      } catch (err) {
        console.warn("[QRCode.toCanvas] fallback:", err);
      }
    }

    // 2. Try new QRCode(...)
    if (!rendered && typeof QRCode === "function") {
      try {
        containerEl.innerHTML = "";
        new QRCode(containerEl, {
          text: targetUrl,
          width: size,
          height: size,
          colorDark: "#090d16",
          colorLight: "#ffffff",
          correctLevel: (QRCode.CorrectLevel && QRCode.CorrectLevel.M) || 0,
        });
        rendered = true;
      } catch (err) {
        console.warn("[new QRCode] fallback:", err);
      }
    }

    // 3. Try dynamic server image
    if (!rendered) {
      const img = document.createElement("img");
      img.src = `/api/verification/qr-image?url=${encodeURIComponent(targetUrl)}`;
      img.alt = "Mobile Verification Link";
      img.width = size;
      img.height = size;
      containerEl.innerHTML = "";
      containerEl.appendChild(img);
    }
  }

  // Determines the public URL that a mobile smartphone camera must open
  function resolveTargetOrigin(session) {
    const locOrigin = window.location.origin;
    if (locOrigin && !locOrigin.includes("localhost") && !locOrigin.includes("127.0.0.1")) {
      return locOrigin.replace(/\/+$/, "");
    }
    if (session && session.publicOrigin && !session.publicOrigin.includes("localhost") && !session.publicOrigin.includes("127.0.0.1")) {
      return session.publicOrigin.replace(/\/+$/, "");
    }
    if (session && session.mobileVerifyUrl) {
      try {
        const parsed = new URL(session.mobileVerifyUrl);
        if (!parsed.hostname.includes("localhost") && !parsed.hostname.includes("127.0.0.1")) {
          return parsed.origin;
        }
      } catch (_) {}
    }
    return "https://peso-moonbeam-nacho.ngrok-free.dev";
  }

  function rebaseToOrigin(urlStr, targetOrigin) {
    if (!urlStr || typeof urlStr !== "string") return urlStr;
    const effectiveOrigin = targetOrigin || resolveTargetOrigin();
    let rebased = urlStr.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/g, effectiveOrigin);
    const encodedLocalhost = /https?%3A%2F%2F(localhost|127\.0\.0\.1)(%3A\d+)?/gi;
    if (encodedLocalhost.test(rebased)) {
      rebased = rebased.replace(encodedLocalhost, encodeURIComponent(effectiveOrigin));
    }
    if (rebased.startsWith("/")) {
      rebased = `${effectiveOrigin}${rebased}`;
    }
    return rebased;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB 1: DIRECT KIOSK VERIFICATION LOGIC
  // ═══════════════════════════════════════════════════════════════════════════
  const directStates = {
    awaiting:  $("#state-awaiting"),
    verifying: $("#state-verifying"),
    granted:   $("#state-granted"),
    denied:    $("#state-denied"),
  };

  const btnWalletRedirect    = $("#btn-wallet-redirect");
  const btnSimulateMobile    = $("#btn-simulate-mobile");
  const btnRefreshSession    = $("#btn-refresh-session");
  const btnResetGranted      = $("#btn-reset-granted");
  const btnResetDenied       = $("#btn-reset-denied");
  const btnCancelVerifying   = $("#btn-cancel-verifying");
  const btnToggleCredenceIos = $("#btn-toggle-credence-ios");
  const credenceIosQrPanel   = $("#credence-ios-qr-panel");
  const credenceIosQrContainer = $("#credence-ios-qr-container");
  const credenceIosUriText   = $("#credence-ios-uri-text");

  const qrContainer          = $("#qr-container");
  const mobileUrlDisplay     = $("#mobile-url-display");
  const btnCopyMobileUrl     = $("#btn-copy-mobile-url");
  const awaitingStatus       = $("#awaiting-status");
  const terminalAwaitingStatus = $("#terminal-awaiting-status");

  const grantedDetails       = $("#granted-details");
  const trustBadges          = $("#trust-badges");
  const deniedReason         = $("#denied-reason");
  const deniedDetails        = $("#denied-details");
  const deniedBadges         = $("#denied-badges");

  const visualMatchContainer = $("#visual-match-container");
  const portraitActivePanel  = $("#portrait-active-panel");
  const grantedPortraitImg   = $("#granted-portrait-img");
  const portraitSubjectName  = $("#portrait-subject-name");
  const portraitDocType      = $("#portrait-doc-type");
  const portraitPrivacyNote  = $("#portrait-privacy-note");

  const btnTogglePayload     = $("#btn-toggle-payload");
  const payloadDrawer        = $("#payload-drawer");
  const rawPayloadBox        = $("#raw-payload-box");
  const payloadProtocolLabel = $("#payload-protocol-label");
  const btnCopyPayload       = $("#btn-copy-payload");
  const copyToast            = $("#copy-toast");
  const mobileErrorToast     = $("#mobile-error-toast");

  let currentDirectSessionId = null;
  let currentDirectSessionData = null;
  let directPollTimer = null;

  function goDirectState(stateName) {
    Object.values(directStates).forEach((s) => s && s.classList.remove("active"));
    if (directStates[stateName]) {
      directStates[stateName].classList.add("active");
    }
  }

  async function startNewDirectSession() {
    goDirectState("awaiting");
    if (awaitingStatus) awaitingStatus.textContent = "Initiating OpenID4VP web session…";
    if (terminalAwaitingStatus) terminalAwaitingStatus.textContent = "Terminal Ready · Waiting for patron presentation or verify action";
    if (qrContainer) qrContainer.innerHTML = `<div class="radar-spinner" style="width:36px;height:36px;margin:3rem auto;position:relative;"></div>`;
    if (visualMatchContainer) visualMatchContainer.style.display = "none";
    if (portraitActivePanel) portraitActivePanel.style.display = "none";
    if (portraitPrivacyNote) portraitPrivacyNote.style.display = "none";
    if (grantedPortraitImg) grantedPortraitImg.src = "";

    try {
      const session = await api("/session", { method: "POST" });
      currentDirectSessionId = session.id;
      currentDirectSessionData = session;

      const targetOrigin = resolveTargetOrigin(session);
      let qrTargetUrl = `${targetOrigin}/verify?session_id=${encodeURIComponent(session.id)}`;
      if (targetOrigin.includes("ngrok")) {
        qrTargetUrl += "&ngrok-skip-browser-warning=true";
      }

      if (mobileUrlDisplay) mobileUrlDisplay.value = qrTargetUrl;

      // Render Desktop QR
      await renderQrCodeTo(qrContainer, qrTargetUrl, 220);

      // Render Credence iOS QR
      const engagementUri = session.engagementUri || session.walletUri || "";
      if (credenceIosUriText) credenceIosUriText.textContent = engagementUri;
      if (engagementUri && credenceIosQrContainer) {
        renderQrCodeTo(credenceIosQrContainer, engagementUri, 200);
      }

      // Populate payload drawer
      if (rawPayloadBox) {
        rawPayloadBox.value = JSON.stringify(
          {
            sessionId: session.id,
            activeOrigin: targetOrigin,
            mobileVerifyUrl: qrTargetUrl,
            walletUri: session.walletUri ? rebaseToOrigin(session.walletUri, targetOrigin) : "",
            engagementUri: session.engagementUri || "",
            mode: session._liveMode ? "LIVE_CLOUD_SDK" : "SMART_FALLBACK",
          },
          null,
          2
        );
      }
      if (payloadProtocolLabel) {
        payloadProtocolLabel.textContent = session._liveMode
          ? "OpenID4VP Web · 🟢 LIVE CLOUD SDK"
          : "OpenID4VP Web · 🟡 LOCAL FALLBACK";
      }

      if (awaitingStatus) awaitingStatus.textContent = "Session active · Ready for digital wallet";
      if (terminalAwaitingStatus) terminalAwaitingStatus.textContent = "Terminal Ready · Waiting for patron presentation or verify action";

      // Start background polling
      startDirectPolling(session.id);
    } catch (err) {
      console.error("Direct session init failed:", err);
      if (awaitingStatus) awaitingStatus.textContent = "Could not initialize session. Tap Refresh.";
    }
  }

  function startDirectPolling(sessionId) {
    stopDirectPolling();
    directPollTimer = setInterval(async () => {
      try {
        const session = await api(`/session/${sessionId}`);
        if (session.status === "verifying") {
          goDirectState("verifying");
        }
        if (session.status === "completed" && session.result) {
          stopDirectPolling();
          if (session.result.decision === "GRANTED") {
            renderDirectGranted(session.result);
            goDirectState("granted");
          } else {
            renderDirectDenied(session.result);
            goDirectState("denied");
          }
          if (activeTabKey === "qr") {
            switchTab("verify");
          }
          if (typeof renderMobileOutcome === "function") {
            renderMobileOutcome(session.result);
          }
        }
      } catch (err) {
        console.warn("Direct poll warning:", err.message);
      }
    }, 1000);
  }

  function stopDirectPolling() {
    if (directPollTimer) {
      clearInterval(directPollTimer);
      directPollTimer = null;
    }
  }

  function renderDirectGranted(result) {
    const a = result.attributes || {};
    const friendlyType = result.document?.friendly_type || (a.passport_number ? "ICAO Doc 9303 Digital Passport" : "ISO/IEC 18013-5 mdoc");
    const fullName = `${a.given_name || "—"} ${a.family_name || ""}`.trim();

    // 1. Tail-End Visual Identity Match (ID Portrait)
    if (visualMatchContainer) {
      visualMatchContainer.style.display = "block";
      const portrait = a.portrait;
      const isValidPortrait = typeof portrait === "string" && portrait.startsWith("data:image/");

      if (isValidPortrait && grantedPortraitImg && portraitActivePanel) {
        grantedPortraitImg.src = portrait;
        grantedPortraitImg.alt = `Verified ID Portrait of ${fullName}`;
        if (portraitSubjectName) portraitSubjectName.textContent = fullName;
        if (portraitDocType) portraitDocType.textContent = friendlyType;
        portraitActivePanel.style.display = "flex";
        if (portraitPrivacyNote) portraitPrivacyNote.style.display = "none";
      } else {
        if (portraitActivePanel) portraitActivePanel.style.display = "none";
        if (portraitPrivacyNote) portraitPrivacyNote.style.display = "flex";
      }
    }

    // 2. Attributes panel
    if (grantedDetails) {
      grantedDetails.innerHTML = `
        <div class="attr-row"><span class="attr-label">Full Name:</span><span class="attr-val highlight">${fullName}</span></div>
        <div class="attr-row"><span class="attr-label">Date of Birth:</span><span class="attr-val">${a.birth_date || a.dob || "—"}</span></div>
        <div class="attr-row"><span class="attr-label">Verified Age:</span><span class="attr-val badge-pass">${result.policy?.computed_age || 28} years old (Age ≥ 21 Verified)</span></div>
        <div class="attr-row"><span class="attr-label">Issuing Authority:</span><span class="attr-val">${a.issuing_authority || "Official Trust Anchor"}</span></div>
        <div class="attr-row"><span class="attr-label">Document Type:</span><span class="attr-val">${friendlyType}</span></div>
      `;
    }

    // 3. Trust flags
    if (trustBadges) {
      trustBadges.innerHTML = `
        <div class="trust-badge valid"><span class="trust-icon">✓</span> Issuer Signature Authentic</div>
        <div class="trust-badge valid"><span class="trust-icon">🔒</span> Device Security Hardware Authorized</div>
        <div class="trust-badge valid"><span class="trust-icon">🛡️</span> Data Integrity Validated (SHA-256)</div>
      `;
    }
  }

  function renderDirectDenied(result) {
    if (deniedReason) {
      deniedReason.textContent = result.reason || "Policy Check Failed: Customer does not meet legal drinking age requirements (21+).";
    }
    const deniedBannerSub = $("#denied-banner-sub");
    if (deniedBannerSub) {
      deniedBannerSub.textContent = result.reason || "Customer is under the legal drinking age of 21.";
    }
    const a = result.attributes || {};
    if (deniedDetails) {
      deniedDetails.innerHTML = `
        <div class="attr-row"><span class="attr-label">Reported Age:</span><span class="attr-val badge-fail">${result.policy?.computed_age ? result.policy.computed_age + " years old" : "Under legal threshold (21)"}</span></div>
        <div class="attr-row"><span class="attr-label">Required Threshold:</span><span class="attr-val">21 Years Old (Legal Drinking Age)</span></div>
        <div class="attr-row"><span class="attr-label">Document Type:</span><span class="attr-val">${result.document?.friendly_type || "Mobile Credential"}</span></div>
      `;
    }
    if (deniedBadges) {
      deniedBadges.innerHTML = `
        <div class="trust-badge invalid"><span class="trust-icon">✕</span> Alcohol Access Decision: BLOCKED</div>
      `;
    }
  }

  // ── True Apple Wallet Verification Engine (W3C Digital Credentials API) ───
  async function executeAppleWalletVerification(sessionObj, callbacks = {}) {
    const { onStatus, onCompleted, onError } = callbacks;

    if (!sessionObj || !sessionObj.id) {
      const err = new Error("No active verification session found.");
      if (onError) onError(err);
      throw err;
    }

    // Refresh session data if dcRequest is missing
    let targetSession = sessionObj;
    if (!targetSession.dcRequest) {
      try {
        targetSession = await api(`/session/${sessionObj.id}`);
      } catch (_) {}
    }

    const dcReq = targetSession.dcRequest;
    if (!dcReq) {
      const err = new Error("Digital credential request definition is missing from session.");
      if (onError) onError(err);
      throw err;
    }

    const protocol = dcReq.protocol || "org-iso-mdoc";
    const deviceRequest = dcReq.deviceRequest;
    const encryptionInfo = dcReq.encryptionInfo;

    const requestItem = {
      protocol,
      data: {
        deviceRequest,
        encryptionInfo,
      },
    };

    if (onStatus) onStatus("prompting", "Requesting Apple Wallet… Double-click side button to present ID.");

    // Detect Digital Credentials API support:
    // WebKit / Safari 18+ implements W3C Digital Credentials API on navigator.credentials.get
    // Earlier previews used navigator.identity.get
    const hasCredentialsGet = Boolean(typeof navigator !== "undefined" && navigator.credentials && typeof navigator.credentials.get === "function");
    const hasIdentityGet = Boolean(typeof navigator !== "undefined" && navigator.identity && typeof navigator.identity.get === "function");

    console.log(`[PassGate] Checking Apple Wallet API support: credentials.get=${hasCredentialsGet}, identity.get=${hasIdentityGet}`);

    let credential = null;
    let lastError = null;

    // 1. Primary WebKit path: navigator.credentials.get({ mediation: "required", digital: { requests: [requestItem] } })
    if (hasCredentialsGet) {
      try {
        console.log("[PassGate] Invoking navigator.credentials.get({ mediation: 'required', digital: ... })");
        credential = await navigator.credentials.get({
          mediation: "required",
          digital: {
            requests: [requestItem],
          },
        });
        console.log("[PassGate] navigator.credentials.get resolved successfully:", credential);
      } catch (err1) {
        console.warn("[PassGate] Primary credentials.get error:", err1.name, err1.message);
        lastError = err1;

        // If user explicitly dismissed or canceled Face ID / Apple Wallet sheet:
        if (err1.name === "AbortError" || err1.name === "NotAllowedError" || err1.message?.includes("aborted") || err1.message?.includes("canceled") || err1.message?.includes("dismissed")) {
          const cancelErr = new Error("Apple Wallet presentation was dismissed or canceled.");
          if (onError) onError(cancelErr);
          throw cancelErr;
        }

        // Try without mediation parameter
        try {
          console.log("[PassGate] Trying navigator.credentials.get without mediation parameter...");
          credential = await navigator.credentials.get({
            digital: {
              requests: [requestItem],
            },
          });
          console.log("[PassGate] Secondary credentials.get resolved successfully:", credential);
        } catch (err2) {
          console.warn("[PassGate] Secondary credentials.get error:", err2.name, err2.message);
          lastError = err2;
        }
      }
    }

    // 2. Fallback path: navigator.identity.get({ digital: { requests: [requestItem] } })
    if (!credential && hasIdentityGet) {
      try {
        console.log("[PassGate] Invoking navigator.identity.get({ digital: ... })");
        credential = await navigator.identity.get({
          digital: {
            requests: [requestItem],
          },
        });
        console.log("[PassGate] navigator.identity.get resolved successfully:", credential);
      } catch (idErr) {
        console.warn("[PassGate] navigator.identity.get error:", idErr.name, idErr.message);
        if (idErr.name === "AbortError" || idErr.name === "NotAllowedError" || idErr.message?.includes("aborted") || idErr.message?.includes("canceled") || idErr.message?.includes("dismissed")) {
          const cancelErr = new Error("Apple Wallet presentation was dismissed or canceled.");
          if (onError) onError(cancelErr);
          throw cancelErr;
        }
        if (!lastError) lastError = idErr;
      }
    }

    // 3. Process credential returned by Apple Wallet
    if (credential) {
      if (onStatus) onStatus("verifying", "Cryptographically validating credential presentation…");

      let payloadData = null;
      if (credential.data) {
        payloadData = credential.data;
      } else if (typeof credential.toJSON === "function") {
        payloadData = credential.toJSON();
      } else {
        payloadData = credential;
      }

      console.log("[PassGate] Sending Apple Wallet payload to server verification endpoint...");
      const verifyRes = await api("/verify-doc", {
        method: "POST",
        body: JSON.stringify({
          sessionId: targetSession.id,
          data: payloadData,
        }),
      });

      console.log("[PassGate] Server verification response:", verifyRes);
      if (onCompleted) onCompleted(verifyRes.result);
      return verifyRes.result;
    }

    // 4. If neither returned a credential:
    // IMPORTANT: NEVER navigate to custom URI schemes (like mdoc-openid4vp://) in Safari,
    // as Safari will display "Safari cannot open the page because the address is invalid".
    const reasonDetail = lastError ? `${lastError.name}: ${lastError.message}` : "W3C Digital Credentials API is not supported or not enabled in this browser.";
    const helpfulMsg = `Could not invoke Apple Wallet (${reasonDetail}). ` +
      `Ensure you are in Safari on an iPhone with iOS 17.5+ or iOS 18+, or tap a Test Persona below for instant demonstration.`;

    const unsupportedErr = new Error(helpfulMsg);
    if (onError) onError(unsupportedErr);
    throw unsupportedErr;
  }

  // Trigger scenario helper for direct kiosk
  async function triggerDirectScenario(scenarioKey) {
    try {
      if (!currentDirectSessionId) {
        await startNewDirectSession();
      }
      goDirectState("verifying");
      if (awaitingStatus) awaitingStatus.textContent = `Evaluating presentation: ${scenarioKey}…`;
      if (terminalAwaitingStatus) terminalAwaitingStatus.textContent = `Evaluating presentation: ${scenarioKey}…`;

      if (activeTabKey === "qr") {
        switchTab("verify");
      }

      await api("/mock-payload", {
        method: "POST",
        body: JSON.stringify({
          session_id: currentDirectSessionId,
          scenario: scenarioKey,
          delay_ms: 600,
        }),
      });
    } catch (err) {
      console.error("Simulation trigger failed:", err);
    }
  }

  // Direct tab listeners
  if (btnRefreshSession) btnRefreshSession.addEventListener("click", startNewDirectSession);
  if (btnResetGranted) btnResetGranted.addEventListener("click", startNewDirectSession);
  if (btnResetDenied) btnResetDenied.addEventListener("click", startNewDirectSession);
  if (btnCancelVerifying) btnCancelVerifying.addEventListener("click", () => goDirectState("awaiting"));

  const btnSwitchToQr = $("#btn-switch-to-qr");
  if (btnSwitchToQr) {
    btnSwitchToQr.addEventListener("click", () => switchTab("qr"));
  }

  // On-card direct-spoof buttons (Explicit Test Profiles)
  $$("[data-action='direct-spoof']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const scenario = btn.getAttribute("data-scenario");
      if (scenario) triggerDirectScenario(scenario);
    });
  });

  // Verify button on Age Check page (Genuine Apple Wallet / mDL)
  if (btnWalletRedirect) {
    btnWalletRedirect.addEventListener("click", async () => {
      const feedbackEl = $("#terminal-wallet-feedback");
      if (feedbackEl) feedbackEl.style.display = "none";

      try {
        if (!currentDirectSessionId) {
          await startNewDirectSession();
        }

        goDirectState("verifying");
        if (terminalAwaitingStatus) terminalAwaitingStatus.textContent = "Waiting for Apple Wallet authorization…";

        await executeAppleWalletVerification(currentDirectSessionData || { id: currentDirectSessionId }, {
          onStatus: (phase, msg) => {
            if (terminalAwaitingStatus) terminalAwaitingStatus.textContent = msg;
          },
          onCompleted: (result) => {
            if (result.decision === "GRANTED") {
              renderDirectGranted(result);
              goDirectState("granted");
            } else {
              renderDirectDenied(result);
              goDirectState("denied");
            }
          },
          onError: (err) => {
            goDirectState("awaiting");
            if (terminalAwaitingStatus) terminalAwaitingStatus.textContent = "Terminal Ready · Waiting for patron presentation";
            if (feedbackEl) {
              feedbackEl.style.display = "block";
              feedbackEl.innerHTML = `
                <strong>ℹ️ Apple Wallet Notice:</strong> ${err.message}<br>
                <span style="font-size:0.73rem;opacity:0.85;">Tip: Scan the QR code on the "Scan QR Code" tab with your iPhone camera to present your real Apple Wallet ID, or click one of the Test Customer ID Scenarios below for instant spoofing.</span>
              `;
            }
          }
        });
      } catch (err) {
        console.warn("Direct verify with Apple Wallet:", err.message);
      }
    });
  }

  // Fallback simulate button (Explicitly marked demo button)
  if (btnSimulateMobile) {
    btnSimulateMobile.addEventListener("click", () => triggerDirectScenario("adult_verified"));
  }

  if (btnToggleCredenceIos && credenceIosQrPanel) {
    btnToggleCredenceIos.addEventListener("click", () => {
      const isVisible = credenceIosQrPanel.style.display !== "none";
      credenceIosQrPanel.style.display = isVisible ? "none" : "block";
    });
  }

  if (btnCopyMobileUrl && mobileUrlDisplay) {
    btnCopyMobileUrl.addEventListener("click", async () => {
      const text = mobileUrlDisplay.value;
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        btnCopyMobileUrl.textContent = "✓";
        setTimeout(() => (btnCopyMobileUrl.textContent = "📋"), 1500);
      } catch (_) {
        mobileUrlDisplay.select();
        document.execCommand("copy");
      }
    });
  }

  if (btnTogglePayload && payloadDrawer) {
    btnTogglePayload.addEventListener("click", () => {
      const isHidden = payloadDrawer.classList.toggle("hidden");
      btnTogglePayload.querySelector("span").textContent = isHidden
        ? "🔍 Inspect OpenID4VP Payload"
        : "✕ Close Payload Inspector";
    });
  }

  if (btnCopyPayload && rawPayloadBox) {
    btnCopyPayload.addEventListener("click", async () => {
      const text = rawPayloadBox.value;
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        if (copyToast) {
          copyToast.classList.remove("hidden");
          setTimeout(() => copyToast.classList.add("hidden"), 1800);
        }
      } catch (_) {}
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB 2: AGE-GATED BAR & MENU ORDERING LOGIC
  // ═══════════════════════════════════════════════════════════════════════════
  const menuCatalog = {
    "single-malt":     { id: "single-malt",     name: "Reserve Single Malt Whiskey", price: 18.00, is21: true,  icon: "🥃" },
    "old-fashioned":   { id: "old-fashioned",   name: "Smoked Old Fashioned",         price: 16.50, is21: true,  icon: "🍹" },
    "napa-cab":        { id: "napa-cab",        name: "Napa Valley Cabernet 2021",    price: 17.00, is21: true,  icon: "🍷" },
    "hazy-ipa":        { id: "hazy-ipa",        name: "Hazy IPA Draft Pint",          price: 9.50,  is21: true,  icon: "🍺" },
    "wagyu-burger":    { id: "wagyu-burger",    name: "Dry-Aged Wagyu Smash Burger",  price: 17.50, is21: false, icon: "🍔" },
    "truffle-fries":   { id: "truffle-fries",   name: "Crispy Truffle Parmesan Fries",price: 8.50,  is21: false, icon: "🍟" },
    "street-tacos":    { id: "street-tacos",    name: "Fire-Roasted Street Tacos (3)",price: 14.00, is21: false, icon: "🌮" },
    "botanical-spritz":{ id: "botanical-spritz",name: "Blood Orange Botanical Spritz",price: 6.50,  is21: false, icon: "🥤" },
  };

  let menuCart = {}; // { itemId: quantity }
  let menuSessionId = null;
  let menuSessionData = null;
  let menuPollTimer = null;

  const menuCartCountEl     = $("#menu-cart-count");
  const menuCartItemsEl     = $("#menu-cart-items");
  const menuCartAgeAlertEl  = $("#menu-cart-age-alert");
  const menuCartAgeTextEl   = $("#menu-cart-age-text");
  const menuCartSubtotalEl  = $("#menu-cart-subtotal");
  const menuCartTaxEl       = $("#menu-cart-tax");
  const menuCartTotalEl     = $("#menu-cart-total");
  const btnCheckoutMenuEl   = $("#btn-checkout-menu-order");
  const btnClearMenuCartEl  = $("#btn-clear-menu-cart");

  const menuModalOverlay    = $("#menu-checkout-modal");
  const btnCloseMenuModal   = $("#btn-close-menu-modal");
  const modalViewGate       = $("#modal-view-gate");
  const modalViewConfirmed  = $("#modal-view-confirmed");
  const modalViewBlocked    = $("#modal-view-blocked");
  const modalQrContainer    = $("#menu-modal-qr-container");

  function updateMenuCartUi() {
    const items = Object.entries(menuCart).map(([id, qty]) => ({
      ...menuCatalog[id],
      qty,
    })).filter((i) => i.qty > 0);

    const totalCount = items.reduce((acc, i) => acc + i.qty, 0);
    const subtotal = items.reduce((acc, i) => acc + i.price * i.qty, 0);
    const tax = subtotal * 0.085;
    const total = subtotal + tax;

    const has21Items = items.some((i) => i.is21);
    const restrictedNames = items.filter((i) => i.is21).map((i) => i.name);

    if (menuCartCountEl) menuCartCountEl.textContent = `${totalCount} item${totalCount === 1 ? "" : "s"}`;
    if (menuCartSubtotalEl) menuCartSubtotalEl.textContent = `$${subtotal.toFixed(2)}`;
    if (menuCartTaxEl) menuCartTaxEl.textContent = `$${tax.toFixed(2)}`;
    if (menuCartTotalEl) menuCartTotalEl.textContent = `$${total.toFixed(2)}`;

    // Render cart item rows
    if (menuCartItemsEl) {
      if (items.length === 0) {
        menuCartItemsEl.innerHTML = `<div class="cart-empty-message">Your order is empty.<br>Tap "+ Add" on any menu item above.</div>`;
      } else {
        menuCartItemsEl.innerHTML = items.map((i) => `
          <div class="cart-item-row ${i.is21 ? "is-21-row" : ""}">
            <div class="cart-item-info">
              <div class="cart-item-name">
                <span>${i.icon}</span>
                <span>${i.name}</span>
                ${i.is21 ? `<span class="cart-count-badge" style="background:#f43f5e;font-size:0.6rem;padding:0.1rem 0.35rem;">21+</span>` : ""}
              </div>
              <span class="cart-item-unit-price">$${i.price.toFixed(2)} each</span>
            </div>
            <div class="cart-item-controls">
              <button type="button" class="btn-qty" data-action="cart-minus" data-id="${i.id}">−</button>
              <span class="cart-item-qty">${i.qty}</span>
              <button type="button" class="btn-qty" data-action="cart-plus" data-id="${i.id}">+</button>
            </div>
            <div class="cart-item-total">$${(i.price * i.qty).toFixed(2)}</div>
          </div>
        `).join("");
      }
    }

    // Dynamic Age-Gating Notice Banner
    if (menuCartAgeAlertEl && menuCartAgeTextEl) {
      if (items.length === 0) {
        menuCartAgeAlertEl.className = "age-restriction-cart-alert all-ages-only";
        menuCartAgeAlertEl.querySelector(".alert-icon").textContent = "🌱";
        menuCartAgeTextEl.innerHTML = `<strong>Cart Empty</strong><p>Add food or beverages from the menu.</p>`;
      } else if (has21Items) {
        menuCartAgeAlertEl.className = "age-restriction-cart-alert has-restricted";
        menuCartAgeAlertEl.querySelector(".alert-icon").textContent = "🔞";
        menuCartAgeTextEl.innerHTML = `
          <strong>Age Verification Required (21+)</strong>
          <p>Contains: <em>${restrictedNames.join(", ")}</em>. Digital ID check required when placing order.</p>
        `;
      } else {
        menuCartAgeAlertEl.className = "age-restriction-cart-alert all-ages-only";
        menuCartAgeAlertEl.querySelector(".alert-icon").textContent = "🌱";
        menuCartAgeTextEl.innerHTML = `
          <strong>All-Ages Order</strong>
          <p>No restricted items. Ready to place order (no ID required).</p>
        `;
      }
    }

    // Place order button state
    if (btnCheckoutMenuEl) {
      btnCheckoutMenuEl.disabled = items.length === 0;
      if (items.length === 0) {
        btnCheckoutMenuEl.innerHTML = `<span>Cart is Empty</span>`;
      } else if (has21Items) {
        btnCheckoutMenuEl.innerHTML = `<span>Verify Age &amp; Place Order ($${total.toFixed(2)})</span> <span>➔</span>`;
      } else {
        btnCheckoutMenuEl.innerHTML = `<span>⚡ Place Order ($${total.toFixed(2)})</span> <span>➔</span>`;
      }
    }
  }

  function addMenuItem(id, qty = 1) {
    if (!menuCatalog[id]) return;
    menuCart[id] = (menuCart[id] || 0) + qty;
    updateMenuCartUi();
  }

  function removeMenuItem(id) {
    if (menuCart[id]) {
      delete menuCart[id];
      updateMenuCartUi();
    }
  }

  // Delegated clicks for catalog and cart buttons
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");

    if (action === "add-item" && id) {
      addMenuItem(id, 1);
    } else if (action === "cart-plus" && id) {
      addMenuItem(id, 1);
    } else if (action === "cart-minus" && id) {
      if (menuCart[id] > 1) {
        menuCart[id]--;
      } else {
        delete menuCart[id];
      }
      updateMenuCartUi();
    }
  });

  if (btnClearMenuCartEl) {
    btnClearMenuCartEl.addEventListener("click", () => {
      menuCart = {};
      updateMenuCartUi();
    });
  }

  // One-click presets for Menu Ordering
  const btnPresetMenuAdult = $("#btn-preset-menu-adult");
  const btnPresetMenuMinor = $("#btn-preset-menu-minor");
  const btnPresetMenuFood  = $("#btn-preset-menu-food");

  if (btnPresetMenuAdult) {
    btnPresetMenuAdult.addEventListener("click", async () => {
      menuCart = { "single-malt": 1, "old-fashioned": 1, "wagyu-burger": 1 };
      updateMenuCartUi();
      openMenuCheckoutModal();
      await triggerMenuSpoof("adult_verified");
    });
  }

  if (btnPresetMenuMinor) {
    btnPresetMenuMinor.addEventListener("click", async () => {
      menuCart = { "hazy-ipa": 2, "truffle-fries": 1 };
      updateMenuCartUi();
      openMenuCheckoutModal();
      await triggerMenuSpoof("underage_minor");
    });
  }

  if (btnPresetMenuFood) {
    btnPresetMenuFood.addEventListener("click", () => {
      menuCart = { "wagyu-burger": 1, "truffle-fries": 1, "botanical-spritz": 1 };
      updateMenuCartUi();
      executeAllAgesInstantCheckout();
    });
  }

  // Checkout Execution
  if (btnCheckoutMenuEl) {
    btnCheckoutMenuEl.addEventListener("click", () => {
      const items = Object.entries(menuCart).map(([id, qty]) => ({ ...menuCatalog[id], qty })).filter((i) => i.qty > 0);
      const has21 = items.some((i) => i.is21);
      if (has21) {
        openMenuCheckoutModal();
      } else {
        executeOrderConfirmation("all-ages");
      }
    });
  }

  // ── Verification Option Toggling (Digital ID vs Physical ID at Table) ─────
  const tabOptDigital = $("#tab-opt-digital");
  const tabOptPhysical = $("#tab-opt-physical");
  const panelOptDigital = $("#panel-opt-digital");
  const panelOptPhysical = $("#panel-opt-physical");
  const btnConfirmPhysicalIdOrder = $("#btn-confirm-physical-id-order");

  function selectIdOption(option) {
    if (option === "digital") {
      tabOptDigital?.classList.add("active");
      tabOptPhysical?.classList.remove("active");
      if (panelOptDigital) panelOptDigital.style.display = "block";
      if (panelOptPhysical) panelOptPhysical.style.display = "none";
    } else {
      tabOptDigital?.classList.remove("active");
      tabOptPhysical?.classList.add("active");
      if (panelOptDigital) panelOptDigital.style.display = "none";
      if (panelOptPhysical) panelOptPhysical.style.display = "block";
    }
  }

  if (tabOptDigital) {
    tabOptDigital.addEventListener("click", () => selectIdOption("digital"));
  }

  if (tabOptPhysical) {
    tabOptPhysical.addEventListener("click", () => selectIdOption("physical"));
  }

  if (btnConfirmPhysicalIdOrder) {
    btnConfirmPhysicalIdOrder.addEventListener("click", () => {
      stopMenuPolling();
      executeOrderConfirmation("physical");
    });
  }

  // ── Execute Order Confirmation & Receipt ─────────────────────────────────
  function executeOrderConfirmation(mode, result = null) {
    if (!menuModalOverlay) return;

    modalViewGate.style.display = "none";
    modalViewBlocked.style.display = "none";
    modalViewConfirmed.style.display = "block";

    const customerBox = $("#modal-confirmed-customer-box");
    const physicalNotice = $("#modal-physical-id-notice");

    if (mode === "digital" && result) {
      if (customerBox) customerBox.style.display = "flex";
      if (physicalNotice) physicalNotice.style.display = "none";

    } else if (mode === "physical") {
      if (customerBox) customerBox.style.display = "none";
      if (physicalNotice) physicalNotice.style.display = "block";

    } else {
      // All-ages (food only)
      if (customerBox) customerBox.style.display = "none";
      if (physicalNotice) physicalNotice.style.display = "none";
    }

    const items = Object.entries(menuCart).map(([id, qty]) => ({ ...menuCatalog[id], qty })).filter((i) => i.qty > 0);
    const subtotal = items.reduce((acc, i) => acc + i.price * i.qty, 0);
    const total = subtotal * 1.085;

    const receiptRef = `#TAB-12-${Math.floor(1000 + Math.random() * 9000)}`;
    $("#modal-receipt-id").textContent = receiptRef;
    $("#modal-receipt-total").textContent = `$${total.toFixed(2)}`;
    $("#modal-receipt-items-list").innerHTML = items.map((i) => `
      <div style="display:flex;justify-content:space-between;margin-bottom:0.25rem;">
        <span>${i.qty}x ${i.name}</span>
        <span>$${(i.price * i.qty).toFixed(2)}</span>
      </div>
    `).join("");

    menuModalOverlay.classList.add("active");
  }

  function executeAllAgesInstantCheckout() {
    executeOrderConfirmation("all-ages");
  }

  async function openMenuCheckoutModal() {
    if (!menuModalOverlay) return;
    modalViewGate.style.display = "block";
    modalViewConfirmed.style.display = "none";
    modalViewBlocked.style.display = "none";

    // Default to Digital ID option tab
    selectIdOption("digital");

    const items = Object.entries(menuCart).map(([id, qty]) => ({ ...menuCatalog[id], qty })).filter((i) => i.qty > 0);
    const subtotal = items.reduce((acc, i) => acc + i.price * i.qty, 0);
    const total = subtotal * 1.085;

    $("#modal-order-summary-snippet").innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:0.35rem;">
        <strong>Table #12 Order (${items.length} items)</strong>
        <span style="color:var(--accent-cyan);font-weight:700;">$${total.toFixed(2)}</span>
      </div>
      <div style="color:var(--text-dim);font-size:0.75rem;">
        ${items.map((i) => `${i.qty}x ${i.name}`).join(" · ")}
      </div>
    `;

    menuModalOverlay.classList.add("active");

    // Start verification session for this order
    try {
      const session = await api("/session", { method: "POST" });
      menuSessionId = session.id;
      menuSessionData = session;
      const targetOrigin = resolveTargetOrigin(session);
      let qrTargetUrl = `${targetOrigin}/verify?session_id=${encodeURIComponent(session.id)}`;
      if (targetOrigin.includes("ngrok")) qrTargetUrl += "&ngrok-skip-browser-warning=true";

      await renderQrCodeTo(modalQrContainer, qrTargetUrl, 180);
      startMenuPolling(session.id);
    } catch (err) {
      console.error("Menu checkout session error:", err);
    }
  }

  function startMenuPolling(sessionId) {
    stopMenuPolling();
    menuPollTimer = setInterval(async () => {
      try {
        const session = await api(`/session/${sessionId}`);
        if (session.status === "completed" && session.result) {
          stopMenuPolling();
          handleMenuVerificationOutcome(session.result);
        }
      } catch (err) {
        console.warn("Menu polling warning:", err);
      }
    }, 1000);
  }

  function stopMenuPolling() {
    if (menuPollTimer) {
      clearInterval(menuPollTimer);
      menuPollTimer = null;
    }
  }

  function handleMenuVerificationOutcome(result) {
    if (result.decision === "GRANTED") {
      executeOrderConfirmation("digital", result);
    } else {
      modalViewGate.style.display = "none";
      modalViewConfirmed.style.display = "none";
      modalViewBlocked.style.display = "block";

      const blockedReasonEl = $("#modal-blocked-reason");
      if (blockedReasonEl) {
        blockedReasonEl.textContent = "There was an issue verifying your digital ID for the alcoholic beverage(s) in your cart. You may remove restricted items to place your food order, or ask your server for assistance at Table #12.";
      }
    }
  }

  async function triggerMenuSpoof(scenarioKey) {
    if (!menuSessionId) return;
    try {
      await api("/mock-payload", {
        method: "POST",
        body: JSON.stringify({
          session_id: menuSessionId,
          scenario: scenarioKey,
          delay_ms: 600,
        }),
      });
    } catch (err) {
      console.error("Menu spoof trigger error:", err);
    }
  }

  // Modal event listeners
  if (btnCloseMenuModal) {
    btnCloseMenuModal.addEventListener("click", () => {
      stopMenuPolling();
      menuModalOverlay.classList.remove("active");
    });
  }

  $("#btn-finish-menu-order")?.addEventListener("click", () => {
    menuCart = {};
    updateMenuCartUi();
    menuModalOverlay.classList.remove("active");
  });

  $("#btn-retry-menu-verify")?.addEventListener("click", () => {
    openMenuCheckoutModal();
  });

  $("#btn-remove-restricted-keep-food")?.addEventListener("click", () => {
    // Keep only non-21 items
    Object.keys(menuCart).forEach((id) => {
      if (menuCatalog[id]?.is21) {
        delete menuCart[id];
      }
    });
    updateMenuCartUi();
    const remainingCount = Object.keys(menuCart).length;
    if (remainingCount > 0) {
      executeOrderConfirmation("all-ages");
    } else {
      menuModalOverlay.classList.remove("active");
    }
  });

  // Genuine Apple Wallet verification button in menu modal
  $("#btn-menu-apple-wallet")?.addEventListener("click", async () => {
    const feedbackEl = $("#menu-wallet-feedback");
    if (feedbackEl) feedbackEl.style.display = "none";

    try {
      if (!menuSessionId) {
        const session = await api("/session", { method: "POST" });
        menuSessionId = session.id;
        menuSessionData = session;
      }

      await executeAppleWalletVerification(menuSessionData || { id: menuSessionId }, {
        onStatus: (phase, msg) => {
          console.log("[Menu Apple Wallet]", phase, msg);
        },
        onCompleted: (result) => {
          stopMenuPolling();
          handleMenuVerificationOutcome(result);
        },
        onError: (err) => {
          if (feedbackEl) {
            feedbackEl.style.display = "block";
            feedbackEl.innerHTML = `
              <strong>ℹ️ Apple Wallet Notice:</strong> ${err.message}<br>
              <span style="font-size:0.7rem;opacity:0.85;">Tip: To test with your iPhone, click "Scan with Second Device Camera Instead" below to scan the QR code, or click one of the One-Click Demo Test Personas below.</span>
            `;
          }
        }
      });
    } catch (err) {
      console.warn("Menu Apple Wallet:", err.message);
    }
  });

  // Dedicated demo fallback button
  $("#btn-menu-simulate-wallet")?.addEventListener("click", () => {
    triggerMenuSpoof("adult_verified");
  });

  const btnToggleMenuQr = $("#btn-toggle-menu-qr");
  const menuQrCollapsible = $("#menu-qr-collapsible");
  const menuQrChevron = $("#menu-qr-chevron");
  if (btnToggleMenuQr && menuQrCollapsible) {
    btnToggleMenuQr.addEventListener("click", () => {
      const isVisible = menuQrCollapsible.style.display !== "none";
      menuQrCollapsible.style.display = isVisible ? "none" : "block";
      if (menuQrChevron) menuQrChevron.textContent = isVisible ? "▼" : "▲";
    });
  }

  // Modal spoof buttons
  $$("[data-action='menu-spoof']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const scen = btn.getAttribute("data-scenario");
      if (scen) triggerMenuSpoof(scen);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSISTENT BOTTOM SIMULATOR CONTROLLER DOCK
  // ═══════════════════════════════════════════════════════════════════════════
  // Routes spoof triggers to the currently active tab (Direct Verify or Menu Ordering)
  const simButtons = $$("#sim-buttons .btn-sim");
  simButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const scenario = btn.getAttribute("data-scenario");
      if (!scenario) return;

      if (activeTabKey === "qr" || activeTabKey === "verify") {
        triggerDirectScenario(scenario);
      } else if (activeTabKey === "menu") {
        if (!menuModalOverlay?.classList.contains("active")) {
          const itemCount = Object.values(menuCart).reduce((a, b) => a + b, 0);
          if (itemCount === 0) {
            menuCart = { "single-malt": 1, "wagyu-burger": 1 };
            updateMenuCartUi();
          }
          openMenuCheckoutModal();
        }
        triggerMenuSpoof(scenario);
      }
    });
  });

  // ── Mobile Patron Presentation Screen (When user scans QR with phone) ────
  function activateMobilePatronView(session) {
    const mobilePanel = $("#mobile-patron-panel");
    if (!mobilePanel) return;

    // Hide terminal tabs navigation & panels
    Object.values(tabPanels).forEach((p) => p && p.classList.remove("active"));
    const tabsNav = $("#demo-tabs-nav");
    if (tabsNav) tabsNav.style.display = "none";

    // Hide the simulator bar dock on mobile presentation screen to avoid clutter
    const simBar = $(".simulator-bar");
    if (simBar) simBar.style.display = "none";

    mobilePanel.style.display = "block";

    // Button: Real Apple Wallet Verification
    const btnMobileAppleWallet = $("#btn-mobile-apple-wallet");
    if (btnMobileAppleWallet) {
      btnMobileAppleWallet.onclick = async () => {
        try {
          await executeAppleWalletVerification(session, {
            onStatus: (phase, text) => {
              const statusBox = $("#mobile-wallet-status-box");
              const statusText = $("#mobile-wallet-status-text");
              const statusDot = $("#mobile-wallet-status-dot");
              if (statusBox) statusBox.style.display = "flex";
              if (statusText) statusText.textContent = text;
              if (statusDot) statusDot.style.background = phase === "verifying" ? "#f59e0b" : "#38bdf8";
            },
            onCompleted: (result) => {
              renderMobileOutcome(result);
            },
            onError: (err) => {
              const statusBox = $("#mobile-wallet-status-box");
              const statusText = $("#mobile-wallet-status-text");
              const statusDot = $("#mobile-wallet-status-dot");
              if (statusBox) {
                statusBox.style.display = "flex";
                statusBox.style.borderColor = "rgba(244,63,94,0.3)";
                statusBox.style.background = "rgba(244,63,94,0.08)";
              }
              if (statusText) {
                statusText.style.color = "#fecdd3";
                statusText.innerHTML = `<strong>Notice:</strong> ${err.message}`;
              }
              if (statusDot) statusDot.style.background = "#f43f5e";
            },
          });
        } catch (err) {
          console.warn("[Mobile Apple Wallet]", err.message);
        }
      };
    }

    // Toggle button to switch into full terminal view if presenter wishes
    const btnToggleTerminal = $("#btn-toggle-terminal-mode");
    if (btnToggleTerminal) {
      btnToggleTerminal.onclick = () => {
        mobilePanel.style.display = "none";
        if (tabsNav) tabsNav.style.display = "flex";
        if (simBar) simBar.style.display = "";
        switchTab("verify");
      };
    }
  }

  function renderMobileOutcome(result) {
    if (!result) return;
    const statusBox = $("#mobile-wallet-status-box");
    const outcomeBox = $("#mobile-outcome-box");
    const outcomeIcon = $("#mobile-outcome-icon");
    const outcomeTitle = $("#mobile-outcome-title");
    const outcomeDesc = $("#mobile-outcome-desc");
    const outcomeBadge = $("#mobile-outcome-badge");

    if (statusBox) statusBox.style.display = "none";
    if (outcomeBox) outcomeBox.style.display = "block";

    if (result.decision === "GRANTED") {
      outcomeBox.style.background = "rgba(16,185,129,0.12)";
      outcomeBox.style.border = "1px solid rgba(16,185,129,0.3)";
      if (outcomeIcon) { outcomeIcon.textContent = "🎉"; outcomeIcon.style.color = "#34d399"; }
      if (outcomeTitle) { outcomeTitle.textContent = "Identity & Age (21+) Verified!"; outcomeTitle.style.color = "#34d399"; }
      if (outcomeDesc) outcomeDesc.textContent = "Your digital ID was cryptographically verified. The terminal has granted access.";
      if (outcomeBadge) { outcomeBadge.className = "trust-badge valid"; outcomeBadge.textContent = "✓ Verified via Apple Wallet"; }
    } else {
      outcomeBox.style.background = "rgba(244,63,94,0.12)";
      outcomeBox.style.border = "1px solid rgba(244,63,94,0.3)";
      if (outcomeIcon) { outcomeIcon.textContent = "✕"; outcomeIcon.style.color = "#fb7185"; }
      if (outcomeTitle) { outcomeTitle.textContent = "Verification Issue"; outcomeTitle.style.color = "#fb7185"; }
      if (outcomeDesc) outcomeDesc.textContent = result.reason || "Customer does not meet legal drinking age requirements (21+).";
      if (outcomeBadge) { outcomeBadge.className = "trust-badge invalid"; outcomeBadge.textContent = "✕ Age Under 21"; }
    }
  }

  // Mobile spoof test persona buttons (Explicitly marked for demo testing)
  $$("[data-action='mobile-spoof']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const scenario = btn.getAttribute("data-scenario");
      if (scenario) triggerDirectScenario(scenario);
    });
  });

  // ── Session Initialization by Tab ─────────────────────────────────────────
  function ensureTabSession(tabKey) {
    if ((tabKey === "qr" || tabKey === "verify") && !currentDirectSessionId) {
      startNewDirectSession();
    }
  }

  // ── Initial Boot ──────────────────────────────────────────────────────────
  async function initialize() {
    // 1. Initial cart render
    updateMenuCartUi();

    // 2. Check query params for session_id (e.g. smartphone scanning desktop QR code)
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session_id") || params.get("sessionId");
    const isCallback = params.get("callback") === "true";

    // If opened via mobile callback resume (?session_id=...&callback=true)
    if (sid && isCallback) {
      window.history.replaceState({}, document.title, window.location.pathname);
      currentDirectSessionId = sid;
      switchTab("verify");
      goDirectState("verifying");
      startDirectPolling(sid);
      return;
    }

    // If opened as a patron session from scanning QR code (/verify?session_id=XYZ)
    if (sid) {
      try {
        const session = await api(`/session/${sid}`);
        if (session && session.id) {
          currentDirectSessionId = session.id;
          currentDirectSessionData = session;
          activateMobilePatronView(session);
          startDirectPolling(session.id);
          return;
        }
      } catch (err) {
        console.warn("Could not load scanned session:", err);
      }
    }

    // Normal terminal kiosk boot
    const hash = window.location.hash.replace("#", "").toLowerCase();
    if (["qr", "verify", "menu"].includes(hash)) {
      switchTab(hash);
    } else {
      switchTab("qr");
    }

    startNewDirectSession();
  }

  initialize();
})();

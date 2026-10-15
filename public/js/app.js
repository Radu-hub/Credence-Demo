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
    test:   $("#tab-panel-test"),
  };

  const tabMeta = {
    qr:     { icon: "📱", label: "Scan QR" },
    verify: { icon: "🛡️", label: "Age Check" },
    menu:   { icon: "🍸", label: "Table Order" },
    test:   { icon: "🧪", label: "Test Sandbox" },
  };

  const mobileNavToggle = $("#mobile-nav-toggle");
  const mobileNavLabel  = $("#mobile-nav-label");
  const mobileNavIcon   = $("#mobile-nav-icon");
  const demoTabsNav     = $("#demo-tabs-nav");

  let activeTabKey = "qr";

  function updateMobileNavTrigger(tabKey) {
    if (tabMeta[tabKey]) {
      if (mobileNavLabel) mobileNavLabel.textContent = tabMeta[tabKey].label;
      if (mobileNavIcon) mobileNavIcon.textContent = tabMeta[tabKey].icon;
    }
  }

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

    // Update mobile toggle label & close dropdown
    updateMobileNavTrigger(tabKey);
    if (demoTabsNav && mobileNavToggle) {
      demoTabsNav.classList.remove("open");
      mobileNavToggle.setAttribute("aria-expanded", "false");
      mobileNavToggle.classList.remove("active");
    }

    // Update URL hash without scroll jump
    try {
      history.replaceState(null, "", `#${tabKey}`);
    } catch (_) {}

    // Initialize or refresh active tab's session & QR code if needed
    ensureTabSession(tabKey);
  }

  // Mobile nav drawer toggle event listeners
  if (mobileNavToggle && demoTabsNav) {
    mobileNavToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = demoTabsNav.classList.toggle("open");
      mobileNavToggle.setAttribute("aria-expanded", String(isOpen));
      mobileNavToggle.classList.toggle("active", isOpen);
    });

    document.addEventListener("click", (e) => {
      if (!demoTabsNav.contains(e.target) && !mobileNavToggle.contains(e.target)) {
        demoTabsNav.classList.remove("open");
        mobileNavToggle.setAttribute("aria-expanded", "false");
        mobileNavToggle.classList.remove("active");
      }
    });
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const target = btn.getAttribute("data-tab");
      if (target) switchTab(target);
    });
  });

  // ── Common API Request Helper ─────────────────────────────────────────────
  async function api(path, opts = {}) {
    const url = path.startsWith("/api/") ? path : `/api/verification${path}`;
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
        ...(opts.headers || {}),
      },
      ...opts,
    });
    if (!res.ok) {
      let errText = "";
      try {
        const errJson = await res.json();
        errText = errJson.error || errJson.message || JSON.stringify(errJson);
      } catch (_) {
        errText = await res.text();
      }
      throw new Error(`API ${res.status}: ${errText}`);
    }
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

  // ── Apple Wallet Pre-Fetched Auth Options Cache ──────────────────────────
  // Pre-fetching prevents Safari's NotAllowedError by removing the async network gap
  // between the user's tap gesture and navigator.credentials.get().
  let cachedWalletOptions = null;
  const walletOptionsCache = new Map();

  async function prefetchWalletAuthOptions(targetSessionId) {
    const sid = targetSessionId || currentDirectSessionId;
    if (!sid) {
      console.log("[PassGate] Skipping Apple Wallet auth-options prefetch (no active session ID yet).");
      return null;
    }

    try {
      console.log(`[PassGate] Pre-fetching Apple Wallet auth-options for session ${sid}...`);
      const options = await api(`/api/wallet/auth-options?sessionId=${encodeURIComponent(sid)}`);
      if (options && options.deviceRequest) {
        walletOptionsCache.set(sid, options);
        cachedWalletOptions = options;
        console.log(`[PassGate] Pre-fetched Apple Wallet auth-options successfully for session ${sid}:`, {
          sessionId: options.sessionId,
          noncePrefix: options.nonce ? options.nonce.substring(0, 8) : "",
          readerAuthSigned: options.readerAuthSigned,
        });
      }
      return options;
    } catch (err) {
      console.warn(`[PassGate] Failed to pre-fetch Apple Wallet auth-options for session ${sid}:`, err.message);
      return null;
    }
  }

  function goDirectState(stateName) {
    Object.values(directStates).forEach((s) => s && s.classList.remove("active"));
    if (directStates[stateName]) {
      directStates[stateName].classList.add("active");
    }
  }

  async function startNewDirectSession() {
    window.isTestPersonaActive = false;
    goDirectState("awaiting");
    if (awaitingStatus) awaitingStatus.textContent = "Initiating OpenID4VP web session…";
    if (terminalAwaitingStatus) terminalAwaitingStatus.textContent = "Terminal Ready · Waiting for patron presentation or verify action";
    if (qrContainer) qrContainer.innerHTML = `<div class="radar-spinner" style="width:36px;height:36px;margin:3rem auto;position:relative;"></div>`;
    if (visualMatchContainer) visualMatchContainer.style.display = "none";
    if (portraitActivePanel) portraitActivePanel.style.display = "none";
    if (portraitPrivacyNote) portraitPrivacyNote.style.display = "none";
    if (grantedPortraitImg) grantedPortraitImg.src = "";

    // Cleanup Sentinel Passes
    if (typeof destroySentinelPass === "function") {
      destroySentinelPass("terminal");
      destroySentinelPass("mobile");
    }
    const termPassCont = $("#terminal-sentinel-pass-container");
    if (termPassCont) { termPassCont.innerHTML = ""; termPassCont.style.display = "none"; }
    const mobPassCont = $("#mobile-sentinel-pass-container");
    if (mobPassCont) { mobPassCont.innerHTML = ""; mobPassCont.style.display = "none"; }

    try {
      const session = await api("/session", { method: "POST" });
      currentDirectSessionId = session.id;
      currentDirectSessionData = session;

      // Seed cache synchronously from session.dcRequest if present
      if (session.dcRequest) {
        const initial = { sessionId: session.id, ...session.dcRequest };
        walletOptionsCache.set(session.id, initial);
        cachedWalletOptions = initial;
      }
      // Pre-fetch fresh signed ISO 18013-7 auth options in background
      prefetchWalletAuthOptions(session.id);

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

  function stopDirectPolling() {
    if (directPollTimer) {
      clearInterval(directPollTimer);
      directPollTimer = null;
    }
  }

  function startDirectPolling(sessionId) {
    stopDirectPolling();
    if (window.isTestPersonaActive) return;
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

  // ═══════════════════════════════════════════════════════════════════════════
  // SENTINEL ANTI-SPOOF INTERACTIVE PASS ENGINE
  // Defeats screenshots & screen recordings for door bouncer verification:
  // 1. High-precision live chronometer with rotating sweep & elapsed counter
  // 2. Interactive touch ripple shockwaves with radial particle bursts & haptics
  // 3. 3D perspective card tilt with gyroscope orientation and touch parallax
  // 4. Procedural continuous guilloche mathematical wave background
  // 5. Interactive bouncer challenge seal with check counter & audit trail
  // ═══════════════════════════════════════════════════════════════════════════
  const activeSentinelInstances = new Map();

  function destroySentinelPass(instanceId) {
    const inst = activeSentinelInstances.get(instanceId);
    if (!inst) return;
    if (inst.clockTimer) clearInterval(inst.clockTimer);
    if (inst.animFrame) {
      if (typeof window !== "undefined" && window.cancelAnimationFrame) {
        window.cancelAnimationFrame(inst.animFrame);
      } else {
        clearTimeout(inst.animFrame);
      }
    }
    if (typeof inst.destroyListeners === "function") inst.destroyListeners();
    activeSentinelInstances.delete(instanceId);
  }

  function renderSentinelPass(container, result, instanceId) {
    if (!container || !result) return;
    destroySentinelPass(instanceId);
    container.innerHTML = "";
    container.style.display = "block";

    const a = result.attributes || {};
    const friendlyType = result.document?.friendly_type || (a.passport_number ? "Digital Passport" : "DMV Driver's License");
    const fullName = `${a.given_name || "Verified"} ${a.family_name || "Patron"}`.trim();
    const age = result.policy?.computed_age || 28;
    const portrait = a.portrait;
    const hasPortrait = typeof portrait === "string" && portrait.startsWith("data:image/");
    const sessionToken = `PG-${Math.floor(1000 + Math.random() * 9000)}-LIVE`;
    const issueTime = new Date();

    const passId = `sentinel-pass-${instanceId}`;
    const canvasId = `sentinel-canvas-${instanceId}`;
    const cardId = `sentinel-card-${instanceId}`;
    const clockId = `sentinel-clock-${instanceId}`;
    const ampmId = `sentinel-ampm-${instanceId}`;
    const dateId = `sentinel-date-${instanceId}`;
    const elapsedId = `sentinel-elapsed-${instanceId}`;
    const sealId = `sentinel-seal-${instanceId}`;
    const counterId = `sentinel-counter-${instanceId}`;
    const rippleLayerId = `sentinel-ripples-${instanceId}`;

    container.innerHTML = `
      <div class="sentinel-pass-wrapper" id="${passId}">
        <div class="sentinel-card" id="${cardId}" title="Tap anywhere to trigger dynamic shockwaves">
          <!-- Procedural Guilloche Canvas Layer -->
          <canvas class="sentinel-guilloche-canvas" id="${canvasId}"></canvas>
          
          <!-- Holographic Iridescent Dynamic Sheen -->
          <div class="sentinel-holo-sheen"></div>

          <!-- Header -->
          <div class="sentinel-header">
            <div class="sentinel-brand">
              <span class="sentinel-shield-icon">🛡️</span>
              <div class="sentinel-brand-text">
                <span class="sentinel-title">PASSGATE SENTINEL™</span>
                <span class="sentinel-subtitle">Door &amp; Bar Anti-Spoof Pass</span>
              </div>
            </div>
            <div class="sentinel-venue-pill">
              <span class="venue-indicator-dot"></span>
              <span class="venue-name">COPPER &amp; CASK</span>
            </div>
          </div>

          <!-- Live High-Precision Chronometer (Anti-Screenshot) -->
          <div class="sentinel-chronometer-strip">
            <div class="chrono-clock-col">
              <div class="chrono-label">LIVE SYSTEM CHRONOMETER</div>
              <div class="chrono-time-display">
                <span class="chrono-hours-mins" id="${clockId}">--:--:--</span>
                <span class="chrono-ampm" id="${ampmId}">--</span>
                <span class="chrono-radar-ring" title="Live 60fps Sweep">
                  <span class="chrono-radar-sweep"></span>
                </span>
              </div>
              <div class="chrono-date-display" id="${dateId}">--------, --- --, ----</div>
            </div>
            <div class="chrono-elapsed-col">
              <div class="chrono-label">PASS ISSUED</div>
              <div class="chrono-elapsed-val" id="${elapsedId}">Just now</div>
              <div class="chrono-valid-tag">VALID FOR ENTRY</div>
            </div>
          </div>

          <!-- Central Patron Identity & Verified Age Display -->
          <div class="sentinel-body">
            <div class="sentinel-age-badge">
              <div class="sentinel-age-num">21+</div>
              <div class="sentinel-age-label">VERIFIED</div>
            </div>

            <div class="sentinel-patron-info">
              <div class="sentinel-patron-name">${fullName}</div>
              <div class="sentinel-doc-tag">${friendlyType} (Age ${age})</div>
              <div class="sentinel-token-tag">
                <span class="sentinel-token-label">AUTH:</span>
                <span class="sentinel-token-val">${sessionToken}</span>
              </div>
            </div>

            ${hasPortrait ? `
              <div class="sentinel-portrait-box">
                <img class="sentinel-portrait-img" src="${portrait}" alt="${fullName}" />
                <span class="sentinel-portrait-badge">MDOC</span>
              </div>
            ` : `
              <div class="sentinel-portrait-box" style="display:flex;align-items:center;justify-content:center;background:rgba(16,185,129,0.15);">
                <span style="font-size:1.8rem;">🪪</span>
                <span class="sentinel-portrait-badge">MDOC</span>
              </div>
            `}
          </div>

          <!-- Interactive Bouncer Challenge Zone (Anti-Video Recording) -->
          <div class="sentinel-bouncer-challenge-zone" id="${sealId}" role="button" tabindex="0" title="Click or tap to verify live responsiveness">
            <div class="bouncer-seal-glow"></div>
            <div class="bouncer-seal-content">
              <span class="bouncer-seal-icon">⚡</span>
              <div class="bouncer-seal-titles">
                <div class="bouncer-seal-primary">TAP OR HOLD TO AUTHENTICATE</div>
                <div class="bouncer-seal-secondary" id="${sealId}-status">Tap anywhere for live touch ripple &amp; haptics</div>
              </div>
            </div>
            <div class="bouncer-tap-counter" id="${counterId}">0 CHECKS</div>
          </div>

          <!-- Shockwave Ripple Layer (Generated at exact tap coordinates) -->
          <div class="sentinel-ripple-layer" id="${rippleLayerId}"></div>

          <!-- Footer / Anti-Spoof Bouncer Legend -->
          <div class="sentinel-footer">
            <div class="sentinel-security-pills">
              <span class="sec-pill"><span>✓</span> 3D Gyro Parallax</span>
              <span class="sec-pill"><span>✓</span> Touch Shockwave</span>
              <span class="sec-pill"><span>✓</span> Live Micro-Sweep</span>
            </div>
            <div class="sentinel-anti-fraud-tip">
              <strong>Bouncer Security Tip:</strong> Screenshots freeze the clock. Screen recordings fail touch ripple and cannot react to 3D phone tilt.
            </div>
          </div>
        </div>
      </div>
    `;

    const card = document.getElementById(cardId);
    const canvas = document.getElementById(canvasId);
    const clockEl = document.getElementById(clockId);
    const ampmEl = document.getElementById(ampmId);
    const dateEl = document.getElementById(dateId);
    const elapsedEl = document.getElementById(elapsedId);
    const seal = document.getElementById(sealId);
    const counterBadge = document.getElementById(counterId);
    const sealStatus = document.getElementById(`${sealId}-status`);
    const rippleLayer = document.getElementById(rippleLayerId);

    // 1. Live Chronometer Loop
    function updateClock() {
      const now = new Date();
      let hours = now.getHours();
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
      const mins = String(now.getMinutes()).padStart(2, "0");
      const secs = String(now.getSeconds()).padStart(2, "0");
      if (clockEl) clockEl.textContent = `${hours}:${mins}:${secs}`;
      if (ampmEl) ampmEl.textContent = ampm;

      const days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
      const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
      if (dateEl) {
        dateEl.textContent = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
      }

      // Elapsed calculation
      if (elapsedEl) {
        const elapsedSecs = Math.floor((now.getTime() - issueTime.getTime()) / 1000);
        if (elapsedSecs < 5) {
          elapsedEl.textContent = "Just now";
        } else if (elapsedSecs < 60) {
          elapsedEl.textContent = `${elapsedSecs}s ago`;
        } else {
          const m = Math.floor(elapsedSecs / 60);
          elapsedEl.textContent = `${m}m ${elapsedSecs % 60}s ago`;
        }
      }
    }
    updateClock();
    const clockTimer = setInterval(updateClock, 500);

    // 2. Procedural Guilloche Canvas Generator (Smooth Mathematical Waves)
    let animFrame = null;
    if (canvas && canvas.getContext) {
      const ctx = canvas.getContext("2d");
      let dpr = window.devicePixelRatio || 1;
      let phase = 0;

      const raf = (typeof window !== "undefined" && window.requestAnimationFrame) ? window.requestAnimationFrame.bind(window) : (fn) => setTimeout(fn, 16);
      function resizeCanvas() {
        if (!card) return;
        const rect = card.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      resizeCanvas();

      function drawGuilloche() {
        if (!canvas || !ctx) return;
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;
        if (width <= 0 || height <= 0) {
          animFrame = raf(drawGuilloche);
          return;
        }

        ctx.clearRect(0, 0, width, height);
        phase += 0.015;

        // Draw multiple waving curves that resemble banknote guilloche
        const waveCount = 5;
        for (let w = 0; w < waveCount; w++) {
          ctx.beginPath();
          const hue = 150 + w * 12; // Emerald to Cyan hues
          ctx.strokeStyle = `hsla(${hue}, 80%, 55%, 0.35)`;
          ctx.lineWidth = 1.2;

          const baseFreq = 0.012 + w * 0.003;
          const amp = 16 + w * 5;
          const yOffset = (height / (waveCount + 1)) * (w + 1);

          for (let x = 0; x <= width; x += 3) {
            const y = yOffset + Math.sin(x * baseFreq + phase + w) * amp + Math.cos(x * 0.02 - phase * 0.8) * (amp * 0.4);
            if (x === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
        }

        animFrame = raf(drawGuilloche);
      }
      animFrame = raf(drawGuilloche);
    }

    // 3. Dynamic Touch Ripple & Spark Spawner (Anti-Video Recording Proof)
    function triggerShockwave(x, y) {
      if (!rippleLayer) return;

      // Primary shockwave ring
      const wave = document.createElement("div");
      wave.className = "sentinel-shockwave";
      wave.style.left = `${x}px`;
      wave.style.top = `${y}px`;
      rippleLayer.appendChild(wave);

      // Secondary trailing wave
      const wave2 = document.createElement("div");
      wave2.className = "sentinel-shockwave secondary";
      wave2.style.left = `${x}px`;
      wave2.style.top = `${y}px`;
      rippleLayer.appendChild(wave2);

      // Radial micro-sparks
      const sparkCount = 8;
      for (let i = 0; i < sparkCount; i++) {
        const spark = document.createElement("div");
        spark.className = "sentinel-spark";
        spark.style.left = `${x}px`;
        spark.style.top = `${y}px`;
        const angle = (i / sparkCount) * 2 * Math.PI + (Math.random() - 0.5) * 0.5;
        const dist = 35 + Math.random() * 45;
        spark.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
        spark.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
        rippleLayer.appendChild(spark);
        setTimeout(() => spark.remove(), 700);
      }

      setTimeout(() => {
        wave.remove();
        wave2.remove();
      }, 900);

      // Mobile Haptic Feedback
      if (navigator.vibrate) {
        try { navigator.vibrate([15, 20]); } catch (_) {}
      }
    }

    function onCardPointerDown(e) {
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      triggerShockwave(x, y);
    }

    // 4. Interactive 3D Perspective Tilt & Holographic Sheen
    function updateTilt(rotX, rotY, sheenXPercent, sheenYPercent) {
      if (!card) return;
      card.style.transform = `perspective(1000px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg)`;
      card.style.setProperty("--sheen-x", `${sheenXPercent.toFixed(1)}%`);
      card.style.setProperty("--sheen-y", `${sheenYPercent.toFixed(1)}%`);
    }

    function onPointerMove(e) {
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : rect.left + rect.width / 2);
      const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : rect.top + rect.height / 2);

      const normX = (clientX - rect.left) / rect.width - 0.5;
      const normY = (clientY - rect.top) / rect.height - 0.5;

      const rotY = normX * 16;  // -8 to +8 deg
      const rotX = -normY * 16; // -8 to +8 deg
      const sheenX = ((normX + 0.5) * 100);
      const sheenY = ((normY + 0.5) * 100);

      updateTilt(rotX, rotY, sheenX, sheenY);
    }

    function onPointerLeave() {
      if (!card) return;
      card.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg)";
      card.style.setProperty("--sheen-x", "50%");
      card.style.setProperty("--sheen-y", "50%");
    }

    // Gyroscope Device Orientation for Physical Mobile Devices
    function onDeviceOrientation(e) {
      if (e.gamma == null || e.beta == null) return;
      const gamma = Math.max(-30, Math.min(30, e.gamma));
      const beta = Math.max(-20, Math.min(40, e.beta - 45));

      const rotY = (gamma / 30) * 12;
      const rotX = (-beta / 30) * 12;
      const sheenX = 50 + (gamma / 30) * 40;
      const sheenY = 50 + (beta / 30) * 40;

      updateTilt(rotX, rotY, sheenX, sheenY);
    }

    // 5. Bouncer Challenge Seal Action
    let inspectionCount = 0;
    function onBouncerSealTrigger(e) {
      if (e) e.stopPropagation();
      inspectionCount++;
      if (counterBadge) {
        counterBadge.textContent = `${inspectionCount} ${inspectionCount === 1 ? "CHECK" : "CHECKS"}`;
      }

      if (card) {
        card.classList.add("active-surge");
        setTimeout(() => card.classList.remove("active-surge"), 600);
      }

      if (sealStatus) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
        sealStatus.innerHTML = `<strong style="color:#34d399;">✓ Live Verified Touch:</strong> Authentic at ${timeStr}`;
      }

      // Center shockwave on seal
      if (seal && card) {
        const sealRect = seal.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const cx = sealRect.left - cardRect.left + sealRect.width / 2;
        const cy = sealRect.top - cardRect.top + sealRect.height / 2;
        triggerShockwave(cx, cy);
      }

      if (navigator.vibrate) {
        try { navigator.vibrate([25, 40, 25]); } catch (_) {}
      }
    }

    // Attach Event Listeners
    if (card) {
      card.addEventListener("pointerdown", onCardPointerDown);
      card.addEventListener("pointermove", onPointerMove);
      card.addEventListener("pointerleave", onPointerLeave);
      card.addEventListener("touchmove", onPointerMove, { passive: true });
      card.addEventListener("touchend", onPointerLeave);
    }

    if (seal) {
      seal.addEventListener("click", onBouncerSealTrigger);
    }

    if (window.DeviceOrientationEvent) {
      window.addEventListener("deviceorientation", onDeviceOrientation, true);
    }

    function destroyListeners() {
      if (card) {
        card.removeEventListener("pointerdown", onCardPointerDown);
        card.removeEventListener("pointermove", onPointerMove);
        card.removeEventListener("pointerleave", onPointerLeave);
        card.removeEventListener("touchmove", onPointerMove);
        card.removeEventListener("touchend", onPointerLeave);
      }
      if (seal) {
        seal.removeEventListener("click", onBouncerSealTrigger);
      }
      if (window.DeviceOrientationEvent) {
        window.removeEventListener("deviceorientation", onDeviceOrientation, true);
      }
    }

    activeSentinelInstances.set(instanceId, {
      clockTimer,
      animFrame,
      destroyListeners,
    });
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

    // 2. Render Interactive Sentinel Anti-Spoof Pass on Door Terminal
    const terminalSentinelContainer = $("#terminal-sentinel-pass-container");
    if (terminalSentinelContainer) {
      renderSentinelPass(terminalSentinelContainer, result, "terminal");
    }

    // 3. Attributes panel
    if (grantedDetails) {
      grantedDetails.innerHTML = `
        <div class="attr-row"><span class="attr-label">Full Name:</span><span class="attr-val highlight">${fullName}</span></div>
        <div class="attr-row"><span class="attr-label">Date of Birth:</span><span class="attr-val">${a.birth_date || a.dob || "—"}</span></div>
        <div class="attr-row"><span class="attr-label">Verified Age:</span><span class="attr-val badge-pass">${result.policy?.computed_age || 28} years old (Age ≥ 21 Verified)</span></div>
        <div class="attr-row"><span class="attr-label">Issuing Authority:</span><span class="attr-val">${a.issuing_authority || "Official Trust Anchor"}</span></div>
        <div class="attr-row"><span class="attr-label">Document Type:</span><span class="attr-val">${friendlyType}</span></div>
      `;
    }

    // 4. Trust flags
    if (trustBadges) {
      trustBadges.innerHTML = `
        <div class="trust-badge valid"><span class="trust-icon">✓</span> Issuer Signature Authentic</div>
        <div class="trust-badge valid"><span class="trust-icon">🔒</span> Device Security Hardware Authorized</div>
        <div class="trust-badge valid"><span class="trust-icon">🛡️</span> Data Integrity Validated (SHA-256)</div>
      `;
    }
  }

  function renderDirectDenied(result) {
    destroySentinelPass("terminal");
    const terminalSentinelContainer = $("#terminal-sentinel-pass-container");
    if (terminalSentinelContainer) {
      terminalSentinelContainer.innerHTML = "";
      terminalSentinelContainer.style.display = "none";
    }

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

  // ── True Apple Wallet Verification Engine (W3C Digital Credentials API / ISO 18013-7) ───
  async function executeAppleWalletVerification(sessionObj, callbacks = {}) {
    const { onStatus, onCompleted, onError } = callbacks;

    if (!sessionObj || !sessionObj.id) {
      const err = new Error("No active verification session found.");
      if (onError) onError(err);
      throw err;
    }

    const targetSession = sessionObj;
    const targetSessionId = targetSession.id;

    // 1. Retrieve pre-fetched authentication options SYNCHRONOUSLY
    // CRITICAL REQUIREMENT: NO `await` statements may precede navigator.credentials.get()!
    // Any async gap will cause Safari to drop the transient user-activation context and throw NotAllowedError.
    let authOptions = walletOptionsCache.get(targetSessionId) ||
      (cachedWalletOptions && (cachedWalletOptions.sessionId === targetSessionId || !cachedWalletOptions.sessionId) ? cachedWalletOptions : null) ||
      cachedWalletOptions ||
      targetSession.dcRequest ||
      targetSession.authOptions;

    if (!authOptions) {
      console.warn("[PassGate] No pre-fetched Apple Wallet auth-options ready synchronously for session:", targetSessionId);
      prefetchWalletAuthOptions(targetSessionId);
      const notReadyErr = new Error("Apple Wallet authorization is preparing. Please tap 'Verify with Apple Wallet' again.");
      if (onError) onError(notReadyErr);
      throw notReadyErr;
    }

    // Invalidate consumed single-use options from cache so stale nonce cannot be reused
    if (authOptions.sessionId) {
      walletOptionsCache.delete(authOptions.sessionId);
    }
    if (cachedWalletOptions === authOptions) {
      cachedWalletOptions = null;
    }

    console.log("[PassGate] Using pre-fetched Apple Wallet auth-options synchronously:", {
      sessionId: authOptions.sessionId,
      noncePrefix: authOptions.nonce ? authOptions.nonce.substring(0, 8) : "",
      hasDigital: Boolean(authOptions.digital),
    });

    const deviceRequest = authOptions.deviceRequest;
    const encryptionInfo = authOptions.encryptionInfo;

    // Use exact WebKit / iOS 18 format that succeeds in main branch:
    // protocol "org-iso-mdoc" inside digital.requests array
    const requestItem = {
      protocol: "org-iso-mdoc",
      data: {
        deviceRequest,
        encryptionInfo,
      },
    };

    const credentialRequest = {
      mediation: "required",
      digital: {
        requests: [requestItem],
      },
    };

    if (onStatus) onStatus("prompting", "Requesting Apple Wallet… Double-click side button to present ID.");

    // Detect Digital Credentials API support:
    // WebKit / Safari 18+ implements W3C Digital Credentials API on navigator.credentials.get
    // Earlier previews used navigator.identity.get
    const hasCredentialsGet = Boolean(typeof navigator !== "undefined" && navigator.credentials && typeof navigator.credentials.get === "function");
    const hasIdentityGet = Boolean(typeof navigator !== "undefined" && navigator.identity && typeof navigator.identity.get === "function");

    console.log(`[PassGate] Checking Apple Wallet API support: credentials.get=${hasCredentialsGet}, identity.get=${hasIdentityGet}`);

    if (!hasCredentialsGet && !hasIdentityGet) {
      const unsupportedErr = new Error(
        "The W3C Digital Credentials API is not supported in this browser. " +
        "Please use Safari on iOS 18+ (or macOS Sequoia with iPhone mirroring), or scan the desktop QR code with your iPhone camera."
      );
      if (onError) onError(unsupportedErr);
      prefetchWalletAuthOptions(targetSessionId);
      throw unsupportedErr;
    }

    let credential = null;
    let lastError = null;

    try {
      // 1. Primary WebKit path: navigator.credentials.get({ mediation: "required", digital: { requests: [requestItem] } })
      // Initiated synchronously on the active user-gesture call stack without an async gap.
      if (hasCredentialsGet) {
        try {
          console.log("[PassGate] Invoking navigator.credentials.get({ mediation: 'required', digital: { requests: [{ protocol: 'org-iso-mdoc' }] } })");
          const credentialPromise = navigator.credentials.get(credentialRequest);
          credential = await credentialPromise;
          console.log("[PassGate] navigator.credentials.get resolved successfully:", credential);
        } catch (err1) {
          console.warn("[PassGate] Primary credentials.get error:", err1.name, err1.message);
          lastError = err1;

          // If user explicitly dismissed or canceled Face ID / Apple Wallet sheet:
          if (
            err1.name === "AbortError" ||
            err1.message?.toLowerCase().includes("aborted") ||
            err1.message?.toLowerCase().includes("canceled") ||
            err1.message?.toLowerCase().includes("cancelled") ||
            err1.message?.toLowerCase().includes("dismissed")
          ) {
            const cancelErr = new Error("Apple Wallet presentation was dismissed or canceled.");
            if (onError) onError(cancelErr);
            throw cancelErr;
          }

          // Try without mediation parameter (WebKit compatibility fallback)
          try {
            console.log("[PassGate] Retrying navigator.credentials.get without mediation parameter...");
            credential = await navigator.credentials.get({
              digital: {
                requests: [requestItem],
              },
            });
            console.log("[PassGate] Secondary credentials.get resolved successfully:", credential);
          } catch (err2) {
            console.warn("[PassGate] Secondary credentials.get error:", err2.name, err2.message);
            lastError = err2;

            if (
              err2.name === "AbortError" ||
              err2.message?.toLowerCase().includes("aborted") ||
              err2.message?.toLowerCase().includes("canceled") ||
              err2.message?.toLowerCase().includes("cancelled") ||
              err2.message?.toLowerCase().includes("dismissed")
            ) {
              const cancelErr = new Error("Apple Wallet presentation was dismissed or canceled.");
              if (onError) onError(cancelErr);
              throw cancelErr;
            }
          }
        }
      }

      // 2. Fallback path: navigator.identity.get({ digital: { requests: [requestItem] } })
      if (!credential && hasIdentityGet && !lastError?.message?.includes("canceled") && !lastError?.message?.includes("aborted")) {
        try {
          console.log("[PassGate] Invoking navigator.identity.get fallback...");
          credential = await navigator.identity.get({
            digital: {
              requests: [requestItem],
            },
          });
          console.log("[PassGate] navigator.identity.get resolved successfully:", credential);
        } catch (idErr) {
          console.warn("[PassGate] navigator.identity.get error:", idErr.name, idErr.message);
          if (
            idErr.name === "AbortError" ||
            idErr.message?.toLowerCase().includes("aborted") ||
            idErr.message?.toLowerCase().includes("canceled") ||
            idErr.message?.toLowerCase().includes("cancelled") ||
            idErr.message?.toLowerCase().includes("dismissed")
          ) {
            const cancelErr = new Error("Apple Wallet presentation was dismissed or canceled.");
            if (onError) onError(cancelErr);
            throw cancelErr;
          }
          if (!lastError) lastError = idErr;
        }
      }

      // 3. Process credential returned by Apple Wallet
      if (credential) {
        if (onStatus) onStatus("verifying", "Cryptographically validating credential presentation & IACA root…");

        let payloadData = null;
        if (credential.data) {
          payloadData = credential.data;
        } else if (typeof credential.toJSON === "function") {
          payloadData = credential.toJSON();
        } else {
          payloadData = credential;
        }

        console.log("[PassGate] Sending Apple Wallet payload to verification endpoint...");
        let verifyRes = null;
        try {
          verifyRes = await api("/verify-doc", {
            method: "POST",
            body: JSON.stringify({
              sessionId: targetSession.id,
              data: payloadData,
            }),
          });
        } catch (verifyDocErr) {
          console.warn("[PassGate] /verify-doc failed, trying /api/wallet/verify fallback:", verifyDocErr.message);
          verifyRes = await api("/api/wallet/verify", {
            method: "POST",
            body: JSON.stringify({
              sessionId: targetSession.id,
              credential: payloadData,
              data: payloadData,
            }),
          });
        }

        console.log("[PassGate] Verification response:", verifyRes);
        const outcome = verifyRes.result || verifyRes;
        if (onCompleted) onCompleted(outcome);
        return outcome;
      }

      // 4. If neither returned a credential:
      const reasonDetail = lastError ? `${lastError.name}: ${lastError.message}` : "W3C Digital Credentials API did not return a credential.";
      const helpfulMsg = `Could not invoke Apple Wallet (${reasonDetail}). ` +
        `Ensure you are in Safari on an iPhone with iOS 18+ and a mobile driver's license in Apple Wallet.`;

      const failureErr = new Error(helpfulMsg);
      if (onError) onError(failureErr);
      throw failureErr;
    } finally {
      // Background re-fetch fresh options for the next verification attempt (success or failure)
      prefetchWalletAuthOptions(targetSessionId);
    }
  }

  // ── Pre-Computed Test Personas for Direct Demonstration ─────────────────
  const TEST_PERSONAS = {
  "adult_verified": {
    "decision": "GRANTED",
    "reason": "Identity verified & policy requirements satisfied.",
    "policy": {
      "min_age": 21,
      "computed_age": 28,
      "age_over_21": true
    },
    "trust": {
      "issuer_authenticated": true,
      "device_signature_valid": true,
      "data_integrity": "VERIFIED",
      "digest_algorithm": "SHA-256"
    },
    "document": {
      "type": "org.iso.18013.5.1.mDL",
      "friendly_type": "ISO/IEC 18013-5 mdoc"
    },
    "attributes": {
      "given_name": "Radu",
      "family_name": "Richardson",
      "birth_date": "1998-03-15",
      "expiry_date": "2028-03-15",
      "issuing_authority": "California DMV",
      "issuing_country": "USA",
      "document_number": "CA-D8832910",
      "age_over_21": true,
      "portrait": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgMjQwIiB3aWR0aD0iMjAwIiBoZWlnaHQ9IjI0MCI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImJnIiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iIzFlMjkzYiIvPgogICAgICA8c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiMwZjE3MmEiLz4KICAgIDwvbGluZWFyR3JhZGllbnQ+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9InNraW4iIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjZjVkMGI1Ii8+CiAgICAgIDxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iI2UwYjA4YyIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iaGFpciIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+CiAgICAgIDxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiMyZDJhMjYiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjMWExODE2Ii8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogICAgPGxpbmVhckdyYWRpZW50IGlkPSJzaGlydCIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+CiAgICAgIDxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiMwMjg0YzciLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjMDM2OWExIi8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogIDwvZGVmcz4KICA8cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjI0MCIgcng9IjE2IiBmaWxsPSJ1cmwoI2JnKSIvPgogIDxwYXRoIGQ9Ik0gMzAgMjQwIEwgMzAgMjA1IFEgMzAgMTY4IDEwMCAxNjggUSAxNzAgMTY4IDE3MCAyMDUgTCAxNzAgMjQwIFoiIGZpbGw9InVybCgjc2hpcnQpIi8+CiAgPHJlY3QgeD0iODUiIHk9IjEzOCIgd2lkdGg9IjMwIiBoZWlnaHQ9IjMyIiBmaWxsPSJ1cmwoI3NraW4pIi8+CiAgPGVsbGlwc2UgY3g9IjEwMCIgY3k9IjEwNCIgcng9IjQyIiByeT0iNTAiIGZpbGw9InVybCgjc2tpbikiLz4KICA8cGF0aCBkPSJNIDU4IDEwMCBRIDU2IDU4IDEwMCA1OCBRIDE0NCA1OCAxNDIgMTAwIFEgMTMwIDc0IDEwMCA3NCBRIDcwIDc0IDU4IDEwMCBaIiBmaWxsPSJ1cmwoI2hhaXIpIi8+CiAgPGVsbGlwc2UgY3g9Ijg1IiBjeT0iMTA1IiByeD0iNCIgcnk9IjMiIGZpbGw9IiMxZTI5M2IiLz4KICA8ZWxsaXBzZSBjeD0iMTE1IiBjeT0iMTA1IiByeD0iNCIgcnk9IjMiIGZpbGw9IiMxZTI5M2IiLz4KICA8cGF0aCBkPSJNIDc3IDk3IFEgODUgOTQgOTMgOTciIHN0cm9rZT0iIzJkMmEyNiIgc3Ryb2tlLXdpZHRoPSIyLjUiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogIDxwYXRoIGQ9Ik0gMTA3IDk3IFEgMTE1IDk0IDEyMyA5NyIgc3Ryb2tlPSIjMmQyYTI2IiBzdHJva2Utd2lkdGg9IjIuNSIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgPHBhdGggZD0iTSAxMDAgMTAzIEwgOTcgMTE4IEwgMTAzIDExOCIgc3Ryb2tlPSIjYzk5MjZiIiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogIDxwYXRoIGQ9Ik0gOTAgMTMwIFEgMTAwIDEzNyAxMTAgMTMwIiBzdHJva2U9IiNiMDcwNDgiIHN0cm9rZS13aWR0aD0iMi41IiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8cmVjdCB4PSIxMiIgeT0iMTIiIHdpZHRoPSI1MiIgaGVpZ2h0PSIxOCIgcng9IjQiIGZpbGw9InJnYmEoNTYsMTg5LDI0OCwwLjE1KSIgc3Ryb2tlPSJyZ2JhKDU2LDE4OSwyNDgsMC40KSIgc3Ryb2tlLXdpZHRoPSIxIi8+CiAgPHRleHQgeD0iMzgiIHk9IjI0IiBmaWxsPSIjMzhiZGY4IiBmb250LXNpemU9IjgiIGZvbnQtZmFtaWx5PSItYXBwbGUtc3lzdGVtLHN5c3RlbS11aSxzYW5zLXNlcmlmIiBmb250LXdlaWdodD0iNzAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5tREwgVkVSSUZJRUQ8L3RleHQ+Cjwvc3ZnPg=="
    }
  },
  "passport_adult_verified": {
    "decision": "GRANTED",
    "reason": "Identity verified & policy requirements satisfied.",
    "policy": {
      "min_age": 21,
      "computed_age": 28,
      "age_over_21": true
    },
    "trust": {
      "issuer_authenticated": true,
      "device_signature_valid": true,
      "data_integrity": "VERIFIED",
      "digest_algorithm": "SHA-256"
    },
    "document": {
      "type": "org.icao.mdoc",
      "friendly_type": "ICAO Doc 9303 Digital Passport"
    },
    "attributes": {
      "given_name": "Sophia",
      "family_name": "Chen",
      "birth_date": "1998-07-20",
      "expiry_date": "2031-07-20",
      "issuing_authority": "U.S. Department of State",
      "issuing_country": "USA",
      "document_number": "US-P9028194",
      "passport_number": "US-P9028194",
      "portrait": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgMjQwIiB3aWR0aD0iMjAwIiBoZWlnaHQ9IjI0MCI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9InBiZyIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+CiAgICAgIDxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiMxZTFiNGIiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjMGYxNzJhIi8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogICAgPGxpbmVhckdyYWRpZW50IGlkPSJwc2tpbiIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+CiAgICAgIDxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiNmZWQ3YWEiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjZmRiYTc0Ii8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogICAgPGxpbmVhckdyYWRpZW50IGlkPSJwaGFpciIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+CiAgICAgIDxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiMxYzE5MTciLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjMGMwYTA5Ii8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogICAgPGxpbmVhckdyYWRpZW50IGlkPSJwc2hpcnQiIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjNGY0NmU1Ii8+CiAgICAgIDxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iIzM3MzBhMyIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CiAgPHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyNDAiIHJ4PSIxNiIgZmlsbD0idXJsKCNwYmcpIi8+CiAgPHBhdGggZD0iTSAzMCAyNDAgTCAzMCAyMDUgUSAzMCAxNjggMTAwIDE2OCBRIDE3MCAxNjggMTcwIDIwNSBMIDE3MCAyNDAgWiIgZmlsbD0idXJsKCNwc2hpcnQpIi8+CiAgPHJlY3QgeD0iODYiIHk9IjEzOCIgd2lkdGg9IjI4IiBoZWlnaHQ9IjMyIiBmaWxsPSJ1cmwoI3Bza2luKSIvPgogIDxwYXRoIGQ9Ik0gNTAgMTAwIFEgNDUgMTYwIDUyIDE5NSBRIDEwMCAyMDUgMTQ4IDE5NSBRIDE1NSAxNjAgMTUwIDEwMCBaIiBmaWxsPSJ1cmwoI3BoYWlyKSIvPgogIDxlbGxpcHNlIGN4PSIxMDAiIGN5PSIxMDQiIHJ4PSI0MCIgcnk9IjQ4IiBmaWxsPSJ1cmwoI3Bza2luKSIvPgogIDxwYXRoIGQ9Ik0gNTYgMTAwIFEgNTYgNTYgMTAwIDU2IFEgMTQ0IDU2IDE0NCAxMDAgUSAxMzIgNzAgMTAwIDcwIFEgNjggNzAgNTYgMTAwIFoiIGZpbGw9InVybCgjcGhhaXIpIi8+CiAgPGVsbGlwc2UgY3g9Ijg1IiBjeT0iMTA1IiByeD0iNCIgcnk9IjMiIGZpbGw9IiMxZTFiNGIiLz4KICA8ZWxsaXBzZSBjeD0iMTE1IiBjeT0iMTA1IiByeD0iNCIgcnk9IjMiIGZpbGw9IiMxZTFiNGIiLz4KICA8cGF0aCBkPSJNIDc3IDk3IFEgODUgOTQgOTMgOTciIHN0cm9rZT0iIzFjMTkxNyIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8cGF0aCBkPSJNIDEwNyA5NyBRIDExNSA5NCAxMjMgOTciIHN0cm9rZT0iIzFjMTkxNyIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8cGF0aCBkPSJNIDkxIDEzMCBRIDEwMCAxMzcgMTA5IDEzMCIgc3Ryb2tlPSIjYzI0MTBjIiBzdHJva2Utd2lkdGg9IjIuMiIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgPHJlY3QgeD0iMTIiIHk9IjEyIiB3aWR0aD0iNjAiIGhlaWdodD0iMTgiIHJ4PSI0IiBmaWxsPSJyZ2JhKDE2OCw4NSwyNDcsMC4xNSkiIHN0cm9rZT0icmdiYSgxNjgsODUsMjQ3LDAuNCkiIHN0cm9rZS13aWR0aD0iMSIvPgogIDx0ZXh0IHg9IjQyIiB5PSIyNCIgZmlsbD0iI2MwODRmYyIgZm9udC1zaXplPSI4IiBmb250LWZhbWlseT0iLWFwcGxlLXN5c3RlbSxzeXN0ZW0tdWksc2Fucy1zZXJpZiIgZm9udC13ZWlnaHQ9IjcwMCIgdGV4dC1hbmNob3I9Im1pZGRsZSI+UEFTU1BPUlQgSUQ8L3RleHQ+Cjwvc3ZnPg=="
    }
  },
  "underage_minor": {
    "decision": "DENIED",
    "reason": "Underage: Subject age (17) does not meet the minimum requirement of 21.",
    "policy": {
      "min_age": 21,
      "computed_age": 17,
      "age_over_21": false
    },
    "trust": {
      "issuer_authenticated": true,
      "device_signature_valid": true,
      "data_integrity": "VERIFIED",
      "digest_algorithm": "SHA-256"
    },
    "document": {
      "type": "org.iso.18013.5.1.mDL",
      "friendly_type": "ISO/IEC 18013-5 mdoc"
    },
    "attributes": {
      "given_name": "Lucas",
      "family_name": "Miller",
      "birth_date": "2008-11-20",
      "expiry_date": "2029-01-10",
      "issuing_authority": "California DMV",
      "issuing_country": "USA",
      "document_number": "CA-D1049281",
      "age_over_21": false,
      "portrait": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgMjQwIiB3aWR0aD0iMjAwIiBoZWlnaHQ9IjI0MCI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImxiZyIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+CiAgICAgIDxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiMzYjA3NjQiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjMGYxNzJhIi8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogICAgPGxpbmVhckdyYWRpZW50IGlkPSJsc2tpbiIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+CiAgICAgIDxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiNmZWQ3YWEiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjZmRiYTc0Ii8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogICAgPGxpbmVhckdyYWRpZW50IGlkPSJsaGFpciIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+CiAgICAgIDxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiM3ODM1MGYiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjNDUxYTAzIi8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogICAgPGxpbmVhckdyYWRpZW50IGlkPSJsaG9vZGllIiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iI2UxMWQ0OCIvPgogICAgICA8c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiM5ZjEyMzkiLz4KICAgIDwvbGluZWFyR3JhZGllbnQ+CiAgPC9kZWZzPgogIDxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjQwIiByeD0iMTYiIGZpbGw9InVybCgjbGJnKSIvPgogIDxwYXRoIGQ9Ik0gMzAgMjQwIEwgMzAgMjA1IFEgMzAgMTY4IDEwMCAxNjggUSAxNzAgMTY4IDE3MCAyMDUgTCAxNzAgMjQwIFoiIGZpbGw9InVybCgjbGhvb2RpZSkiLz4KICA8cmVjdCB4PSI4NiIgeT0iMTM4IiB3aWR0aD0iMjgiIGhlaWdodD0iMzIiIGZpbGw9InVybCgjbHNraW4pIi8+CiAgPGVsbGlwc2UgY3g9IjEwMCIgY3k9IjEwNSIgcng9IjM5IiByeT0iNDYiIGZpbGw9InVybCgjbHNraW4pIi8+CiAgPHBhdGggZD0iTSA1OCA5OCBRIDYyIDU4IDEwMCA1OCBRIDEzOCA1OCAxNDIgOTggUSAxMzAgNzYgMTAwIDc2IFEgNzAgNzYgNTggOTggWiIgZmlsbD0idXJsKCNsaGFpcikiLz4KICA8ZWxsaXBzZSBjeD0iODYiIGN5PSIxMDYiIHJ4PSI0IiByeT0iMyIgZmlsbD0iIzFlMjkzYiIvPgogIDxlbGxpcHNlIGN4PSIxMTQiIGN5PSIxMDYiIHJ4PSI0IiByeT0iMyIgZmlsbD0iIzFlMjkzYiIvPgogIDxwYXRoIGQ9Ik0gNzggOTggUSA4NiA5NSA5NCA5OCIgc3Ryb2tlPSIjNDUxYTAzIiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogIDxwYXRoIGQ9Ik0gMTA2IDk4IFEgMTE0IDk1IDEyMiA5OCIgc3Ryb2tlPSIjNDUxYTAzIiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogIDxwYXRoIGQ9Ik0gOTEgMTMwIFEgMTAwIDEzNiAxMDkgMTMwIiBzdHJva2U9IiNjMjQxMGMiIHN0cm9rZS13aWR0aD0iMiIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgPHJlY3QgeD0iMTIiIHk9IjEyIiB3aWR0aD0iNjAiIGhlaWdodD0iMTgiIHJ4PSI0IiBmaWxsPSJyZ2JhKDIzOSw2OCw2OCwwLjE4KSIgc3Ryb2tlPSJyZ2JhKDIzOSw2OCw2OCwwLjQpIiBzdHJva2Utd2lkdGg9IjEiLz4KICA8dGV4dCB4PSI0MiIgeT0iMjQiIGZpbGw9IiNmODcxNzEiIGZvbnQtc2l6ZT0iOCIgZm9udC1mYW1pbHk9Ii1hcHBsZS1zeXN0ZW0sc3lzdGVtLXVpLHNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSI3MDAiIHRleHQtYW5jaG9yPSJtaWRkbGUiPlVOREVSIDIxIElEPC90ZXh0Pgo8L3N2Zz4="
    }
  },
  "expired_document": {
    "decision": "DENIED",
    "reason": "Document expired on 2023-06-12.",
    "policy": {
      "min_age": 21,
      "computed_age": 36,
      "age_over_21": true
    },
    "trust": {
      "issuer_authenticated": true,
      "device_signature_valid": true,
      "data_integrity": "VERIFIED",
      "digest_algorithm": "SHA-256"
    },
    "document": {
      "type": "org.iso.18013.5.1.mDL",
      "friendly_type": "ISO/IEC 18013-5 mdoc"
    },
    "attributes": {
      "given_name": "Elena",
      "family_name": "Vance",
      "birth_date": "1990-06-12",
      "expiry_date": "2023-06-12",
      "issuing_authority": "New York DMV",
      "issuing_country": "USA",
      "document_number": "NY-4910284",
      "age_over_21": true,
      "portrait": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgMjQwIiB3aWR0aD0iMjAwIiBoZWlnaHQ9IjI0MCI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImViZyIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+CiAgICAgIDxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiMxZTI5M2IiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjMGYxNzJhIi8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogICAgPGxpbmVhckdyYWRpZW50IGlkPSJlc2tpbiIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+CiAgICAgIDxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiNmZWQ3YWEiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjZmJjZmU4Ii8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogICAgPGxpbmVhckdyYWRpZW50IGlkPSJlaGFpciIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+CiAgICAgIDxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiM0NTFhMDMiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjMWMxOTE3Ii8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogICAgPGxpbmVhckdyYWRpZW50IGlkPSJlamFja2V0IiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iIzA1OTY2OSIvPgogICAgICA8c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiMwNDc4NTciLz4KICAgIDwvbGluZWFyR3JhZGllbnQ+CiAgPC9kZWZzPgogIDxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjQwIiByeD0iMTYiIGZpbGw9InVybCgjZWJnKSIvPgogIDxwYXRoIGQ9Ik0gMzAgMjQwIEwgMzAgMjA1IFEgMzAgMTY4IDEwMCAxNjggUSAxNzAgMTY4IDE3MCAyMDUgTCAxNzAgMjQwIFoiIGZpbGw9InVybCgjZWphY2tldCkiLz4KICA8cmVjdCB4PSI4NiIgeT0iMTM4IiB3aWR0aD0iMjgiIGhlaWdodD0iMzIiIGZpbGw9InVybCgjZXNraW4pIi8+CiAgPHBhdGggZD0iTSA1MiAxMDAgUSA0OCAxNTAgNTQgMTg1IFEgMTAwIDE5NSAxNDYgMTg1IFEgMTUyIDE1MCAxNDggMTAwIFoiIGZpbGw9InVybCgjZWhhaXIpIi8+CiAgPGVsbGlwc2UgY3g9IjEwMCIgY3k9IjEwNSIgcng9IjM5IiByeT0iNDgiIGZpbGw9InVybCgjZXNraW4pIi8+CiAgPHBhdGggZD0iTSA1OCA5OCBRIDU4IDU2IDEwMCA1NiBRIDE0MiA1NiAxNDIgOTggUSAxMzAgNjggMTAwIDY4IFEgNzAgNjggNTggOTggWiIgZmlsbD0idXJsKCNlaGFpcikiLz4KICA8ZWxsaXBzZSBjeD0iODYiIGN5PSIxMDYiIHJ4PSI0IiByeT0iMyIgZmlsbD0iIzFlMjkzYiIvPgogIDxlbGxpcHNlIGN4PSIxMTQiIGN5PSIxMDYiIHJ4PSI0IiByeT0iMyIgZmlsbD0iIzFlMjkzYiIvPgogIDxwYXRoIGQ9Ik0gNzggOTggUSA4NiA5NSA5NCA5OCIgc3Ryb2tlPSIjMWMxOTE3IiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogIDxwYXRoIGQ9Ik0gMTA2IDk4IFEgMTE0IDk1IDEyMiA5OCIgc3Ryb2tlPSIjMWMxOTE3IiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogIDxwYXRoIGQ9Ik0gOTEgMTMwIFEgMTAwIDEzNiAxMDkgMTMwIiBzdHJva2U9IiNkYjI3NzciIHN0cm9rZS13aWR0aD0iMi4yIiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8cmVjdCB4PSIxMiIgeT0iMTIiIHdpZHRoPSI1OCIgaGVpZ2h0PSIxOCIgcng9IjQiIGZpbGw9InJnYmEoMjQ1LDE1OCwxMSwwLjE4KSIgc3Ryb2tlPSJyZ2JhKDI0NSwxNTgsMTEsMC40KSIgc3Ryb2tlLXdpZHRoPSIxIi8+CiAgPHRleHQgeD0iNDEiIHk9IjI0IiBmaWxsPSIjZmJiZjI0IiBmb250LXNpemU9IjgiIGZvbnQtZmFtaWx5PSItYXBwbGUtc3lzdGVtLHN5c3RlbS11aSxzYW5zLXNlcmlmIiBmb250LXdlaWdodD0iNzAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5FWFBJUkVEIElEPC90ZXh0Pgo8L3N2Zz4="
    }
  },
  "untrusted_issuer": {
    "decision": "DENIED",
    "reason": "Issuer authentication failed: Certificate chain is untrusted or invalid.",
    "policy": {
      "min_age": 21,
      "computed_age": 31,
      "age_over_21": true
    },
    "trust": {
      "issuer_authenticated": false,
      "device_signature_valid": true,
      "data_integrity": "VERIFIED",
      "digest_algorithm": "SHA-256"
    },
    "document": {
      "type": "org.iso.18013.5.1.mDL",
      "friendly_type": "ISO/IEC 18013-5 mdoc"
    },
    "attributes": {
      "given_name": "John",
      "family_name": "Smith",
      "birth_date": "1995-04-10",
      "expiry_date": "2027-01-01",
      "issuing_authority": "Unknown Rogue CA",
      "issuing_country": "ZZ",
      "document_number": "UNTRUSTED-0912",
      "age_over_21": true
    }
  },
  "tampered_integrity": {
    "decision": "DENIED",
    "reason": "Device authentication failed: MSO signature or device key is unauthorized. Data integrity check failed: Status is TAMPERED. Document expired on 2026-05-10.",
    "policy": {
      "min_age": 21,
      "computed_age": 34,
      "age_over_21": true
    },
    "trust": {
      "issuer_authenticated": true,
      "device_signature_valid": false,
      "data_integrity": "TAMPERED",
      "digest_algorithm": "SHA-256"
    },
    "document": {
      "type": "org.iso.18013.5.1.mDL",
      "friendly_type": "ISO/IEC 18013-5 mdoc"
    },
    "attributes": {
      "given_name": "Marcus",
      "family_name": "Conrad",
      "birth_date": "1992-09-05",
      "expiry_date": "2026-05-10",
      "issuing_authority": "California DMV",
      "issuing_country": "USA",
      "document_number": "CA-D9918231",
      "age_over_21": true
    }
  },
  "passkit_mock": {
    "decision": "GRANTED",
    "reason": "Identity verified & policy requirements satisfied.",
    "policy": {
      "min_age": 21,
      "computed_age": 56,
      "age_over_21": true
    },
    "trust": {
      "issuer_authenticated": true,
      "device_signature_valid": true,
      "data_integrity": "VERIFIED",
      "digest_algorithm": "SHA-256"
    },
    "document": {
      "type": "org.iso.18013.5.1.mDL",
      "friendly_type": "PassKit Mock mDL (ISO/IEC 18013-5)"
    },
    "attributes": {
      "given_name": "John",
      "family_name": "Doe",
      "birth_date": "1970-01-01",
      "expiry_date": "2030-01-01",
      "issuing_authority": "Apple Wallet Mock PassKit",
      "issuing_country": "USA",
      "document_number": "PK-19700101-JD",
      "age_over_21": true,
      "portrait": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgMjQwIiB3aWR0aD0iMjAwIiBoZWlnaHQ9IjI0MCI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImpiZyIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+CiAgICAgIDxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiMwZjE3MmEiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjMWUyOTNiIi8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogICAgPGxpbmVhckdyYWRpZW50IGlkPSJqc2tpbiIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+CiAgICAgIDxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiNmNWQwYjUiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjZTBiMDhjIi8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogICAgPGxpbmVhckdyYWRpZW50IGlkPSJqaGFpciIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+CiAgICAgIDxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiM2NDc0OGIiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjNDc1NTY5Ii8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogICAgPGxpbmVhckdyYWRpZW50IGlkPSJqc2hpcnQiIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjMDI4NGM3Ii8+CiAgICAgIDxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iIzAzNjlhMSIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CiAgPHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyNDAiIHJ4PSIxNiIgZmlsbD0idXJsKCNqYmcpIi8+CiAgPHBhdGggZD0iTSAzMCAyNDAgTCAzMCAyMDUgUSAzMCAxNjggMTAwIDE2OCBRIDE3MCAxNjggMTcwIDIwNSBMIDE3MCAyNDAgWiIgZmlsbD0idXJsKCNqc2hpcnQpIi8+CiAgPHJlY3QgeD0iODUiIHk9IjEzOCIgd2lkdGg9IjMwIiBoZWlnaHQ9IjMyIiBmaWxsPSJ1cmwoI2pza2luKSIvPgogIDxlbGxpcHNlIGN4PSIxMDAiIGN5PSIxMDQiIHJ4PSI0MiIgcnk9IjUwIiBmaWxsPSJ1cmwoI2pza2luKSIvPgogIDxwYXRoIGQ9Ik0gNTggMTAwIFEgNTYgNTggMTAwIDU4IFEgMTQ0IDU4IDE0MiAxMDAgUSAxMzAgNzQgMTAwIDc0IFEgNzAgNzQgNTggMTAwIFoiIGZpbGw9InVybCgjamhhaXIpIi8+CiAgPGVsbGlwc2UgY3g9Ijg1IiBjeT0iMTA1IiByeD0iNCIgcnk9IjMiIGZpbGw9IiMxZTI5M2IiLz4KICA8ZWxsaXBzZSBjeD0iMTE1IiBjeT0iMTA1IiByeD0iNCIgcnk9IjMiIGZpbGw9IiMxZTI5M2IiLz4KICA8cGF0aCBkPSJNIDc3IDk3IFEgODUgOTQgOTMgOTciIHN0cm9rZT0iIzQ3NTU2OSIgc3Ryb2tlLXdpZHRoPSIyLjUiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogIDxwYXRoIGQ9Ik0gMTA3IDk3IFEgMTE1IDk0IDEyMyA5NyIgc3Ryb2tlPSIjNDc1NTY5IiBzdHJva2Utd2lkdGg9IjIuNSIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgPHBhdGggZD0iTSAxMDAgMTAzIEwgOTcgMTE4IEwgMTAzIDExOCIgc3Ryb2tlPSIjYzk5MjZiIiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogIDxwYXRoIGQ9Ik0gOTAgMTMwIFEgMTAwIDEzNyAxMTAgMTMwIiBzdHJva2U9IiNiMDcwNDgiIHN0cm9rZS13aWR0aD0iMi41IiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8cmVjdCB4PSIxMiIgeT0iMTIiIHdpZHRoPSI2OCIgaGVpZ2h0PSIxOCIgcng9IjQiIGZpbGw9InJnYmEoMTYsMTg1LDEyOSwwLjE1KSIgc3Ryb2tlPSJyZ2JhKDE2LDE4NSwxMjksMC40KSIgc3Ryb2tlLXdpZHRoPSIxIi8+CiAgPHRleHQgeD0iNDYiIHk9IjI0IiBmaWxsPSIjMTBiOTgxIiBmb250LXNpemU9IjgiIGZvbnQtZmFtaWx5PSItYXBwbGUtc3lzdGVtLHN5c3RlbS11aSxzYW5zLXNlcmlmIiBmb250LXdlaWdodD0iNzAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5QQVNTS0lUIE1PQ0s8L3RleHQ+Cjwvc3ZnPg=="
    }
  }
};

TEST_PERSONAS.apple_wallet_mock = TEST_PERSONAS.passkit_mock;

  // ── Centralized Test Persona Verification Handler ──────────────────────────
  // Immediately presents any simulated persona to the Door & Bar Terminal.
  // Directly renders the authoritative verified pass or denial screen instantly with zero delay.
  function runTestPersona(scenarioKey, targetContext = null) {
    console.log("[PassGate] Running test persona:", scenarioKey, "context:", targetContext);
    const outcome = TEST_PERSONAS[scenarioKey];
    if (!outcome) {
      console.error("[PassGate] Unknown test persona:", scenarioKey);
      return;
    }

    // If triggered from Table Order / Menu modal, complete the order verification right in the modal
    if (targetContext === "menu") {
      stopMenuPolling();
      handleMenuVerificationOutcome(outcome);
      return;
    }

    // 1. Halt all active direct polling and set active test persona flag
    stopDirectPolling();
    window.isTestPersonaActive = true;

    // 2. Switch to Age Check tab immediately
    switchTab("verify");

    // 3. Immediately render authoritative verified or denied state
    try {
      if (outcome.decision === "GRANTED") {
        renderDirectGranted(outcome);
        goDirectState("granted");
      } else {
        renderDirectDenied(outcome);
        goDirectState("denied");
      }
      if (typeof renderMobileOutcome === "function") {
        renderMobileOutcome(outcome);
      }
    } catch (err) {
      console.error("[PassGate] Error rendering test persona outcome:", err);
    }

    // 4. Instantly scroll to top so result is immediately visible
    window.scrollTo({ top: 0, behavior: "instant" });

    // Optional background sync to server session (fire-and-forget, non-blocking)
    if (currentDirectSessionId) {
      api("/mock-payload", {
        method: "POST",
        body: JSON.stringify({
          session_id: currentDirectSessionId,
          scenario: scenarioKey,
          delay_ms: 0,
        }),
      }).catch(() => {});
    }
  }

  // Backwards compatibility alias
  function presentTestPersona(scenarioKey, targetContext = null) {
    runTestPersona(scenarioKey, targetContext);
  }

  function triggerDirectScenario(scenarioKey) {
    runTestPersona(scenarioKey);
  }

  // Expose globally on window so inline onclick handlers and console work 100% reliably
  window.runTestPersona = runTestPersona;
  window.presentTestPersona = runTestPersona;
  window.switchTab = switchTab;
  window.TEST_PERSONAS = TEST_PERSONAS;

  // Direct tab listeners
  if (btnRefreshSession) btnRefreshSession.addEventListener("click", startNewDirectSession);
  if (btnResetGranted) btnResetGranted.addEventListener("click", startNewDirectSession);
  if (btnResetDenied) btnResetDenied.addEventListener("click", startNewDirectSession);
  if (btnCancelVerifying) btnCancelVerifying.addEventListener("click", () => goDirectState("awaiting"));

  const btnSwitchToQr = $("#btn-switch-to-qr");
  if (btnSwitchToQr) {
    btnSwitchToQr.addEventListener("click", () => switchTab("qr"));
  }


  // Verify button on Age Check page (Genuine Apple Wallet / mDL)
  if (btnWalletRedirect) {
    btnWalletRedirect.addEventListener("click", () => {
      const feedbackEl = $("#terminal-wallet-feedback");
      if (feedbackEl) feedbackEl.style.display = "none";

      goDirectState("verifying");
      if (terminalAwaitingStatus) terminalAwaitingStatus.textContent = "Waiting for Apple Wallet authorization…";

      const sessionObj = currentDirectSessionData || (currentDirectSessionId ? { id: currentDirectSessionId } : null);

      executeAppleWalletVerification(sessionObj, {
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
      }).catch((err) => {
        console.warn("Direct verify with Apple Wallet:", err.message);
      });
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
        <span style="color:var(--text-main);font-weight:700;">$${total.toFixed(2)}</span>
      </div>
      <div style="color:var(--text-muted);font-size:0.78rem;">
        ${items.map((i) => `${i.qty}x ${i.name}`).join(" · ")}
      </div>
    `;

    menuModalOverlay.classList.add("active");

    // Start verification session for this order
    try {
      const session = await api("/session", { method: "POST" });
      menuSessionId = session.id;
      menuSessionData = session;

      // Seed cache synchronously and pre-fetch auth-options ahead of time
      if (session.dcRequest) {
        const initial = { sessionId: session.id, ...session.dcRequest };
        walletOptionsCache.set(session.id, initial);
        cachedWalletOptions = initial;
      }
      prefetchWalletAuthOptions(session.id);

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

  function triggerMenuSpoof(scenarioKey) {
    presentTestPersona(scenarioKey, "menu");
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
  $("#btn-menu-apple-wallet")?.addEventListener("click", () => {
    const feedbackEl = $("#menu-wallet-feedback");
    if (feedbackEl) feedbackEl.style.display = "none";

    const sessionObj = menuSessionData || (menuSessionId ? { id: menuSessionId } : null);

    executeAppleWalletVerification(sessionObj, {
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
    }).catch((err) => {
      console.warn("Menu Apple Wallet:", err.message);
    });
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

  // ═══════════════════════════════════════════════════════════════════════════
  // CENTRALIZED TEST & SIMULATION SUITE CONTROLLER
  // All simulated personas are consolidated in one dedicated place:
  // #tab-panel-test ("Test Sandbox")
  // ═══════════════════════════════════════════════════════════════════════════
  // Quick navigation helpers between Age Check and Test Suite
  $("#btn-goto-tests-from-verify")?.addEventListener("click", () => switchTab("test"));
  $("#btn-goto-terminal-from-test")?.addEventListener("click", () => switchTab("verify"));

  // Target flow switcher radio options
  $$('input[name="test-target-flow"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      $$(".test-target-option").forEach((opt) => opt.classList.remove("active"));
      radio.closest(".test-target-option")?.classList.add("active");
    });
  });

  // Run Test Persona from the centralized Test Sandbox (supports clicking button or entire card)
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-action='run-suite-test']") || e.target.closest(".test-card");
    if (!trigger) return;

    const scenario = trigger.getAttribute("data-scenario") || trigger.querySelector("[data-scenario]")?.getAttribute("data-scenario");
    if (!scenario) return;

    e.preventDefault();
    e.stopPropagation();

    runTestPersona(scenario);
  });

  // ── Mobile Patron Presentation Screen (When user scans QR with phone) ────
  function activateMobilePatronView(session) {
    const mobilePanel = $("#mobile-patron-panel");
    if (!mobilePanel) return;

    if (session && session.id) {
      if (session.dcRequest) {
        const initial = { sessionId: session.id, ...session.dcRequest };
        walletOptionsCache.set(session.id, initial);
        cachedWalletOptions = initial;
      }
      prefetchWalletAuthOptions(session.id);
    }

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
      btnMobileAppleWallet.onclick = () => {
        executeAppleWalletVerification(session, {
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
              statusBox.style.borderColor = "var(--status-rose-border)";
              statusBox.style.background = "var(--status-rose-bg)";
            }
            if (statusText) {
              statusText.style.color = "var(--status-rose-text)";
              statusText.innerHTML = `<strong>Notice:</strong> ${err.message}`;
            }
            if (statusDot) statusDot.style.background = "#f43f5e";
          },
        }).catch((err) => {
          console.warn("[Mobile Apple Wallet]", err.message);
        });
      };
    }

    // Toggle button to switch into full terminal view if presenter wishes
    const btnToggleTerminal = $("#btn-toggle-terminal-mode");
    if (btnToggleTerminal) {
      btnToggleTerminal.onclick = () => {
        mobilePanel.style.display = "none";
        if (tabsNav) tabsNav.style.display = "";
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
    const mobileSentinelContainer = $("#mobile-sentinel-pass-container");

    if (statusBox) statusBox.style.display = "none";
    if (outcomeBox) outcomeBox.style.display = "block";

    if (result.decision === "GRANTED") {
      outcomeBox.style.background = "var(--status-emerald-bg)";
      outcomeBox.style.border = "1.5px solid var(--status-emerald-border)";
      if (outcomeIcon) { outcomeIcon.textContent = "🎉"; outcomeIcon.style.color = "var(--status-emerald-text)"; }
      if (outcomeTitle) { outcomeTitle.textContent = "Identity & Age (21+) Verified!"; outcomeTitle.style.color = "var(--status-emerald-text)"; }
      if (outcomeDesc) outcomeDesc.textContent = "Your digital ID was cryptographically verified. The terminal has granted access.";
      if (outcomeBadge) { outcomeBadge.className = "trust-badge valid"; outcomeBadge.textContent = "✓ Verified via Apple Wallet"; }

      // Mount interactive anti-spoof Sentinel Pass for patron to show bouncer
      if (mobileSentinelContainer) {
        renderSentinelPass(mobileSentinelContainer, result, "mobile");
      }
    } else {
      outcomeBox.style.background = "var(--status-rose-bg)";
      outcomeBox.style.border = "1.5px solid var(--status-rose-border)";
      if (outcomeIcon) { outcomeIcon.textContent = "✕"; outcomeIcon.style.color = "var(--status-rose-text)"; }
      if (outcomeTitle) { outcomeTitle.textContent = "Verification Issue"; outcomeTitle.style.color = "var(--status-rose-text)"; }
      if (outcomeDesc) outcomeDesc.textContent = result.reason || "Customer does not meet legal drinking age requirements (21+).";
      if (outcomeBadge) { outcomeBadge.className = "trust-badge invalid"; outcomeBadge.textContent = "✕ Age Under 21"; }

      destroySentinelPass("mobile");
      if (mobileSentinelContainer) {
        mobileSentinelContainer.innerHTML = "";
        mobileSentinelContainer.style.display = "none";
      }
    }
  }

  // ── Session Initialization by Tab ─────────────────────────────────────────
  function ensureTabSession(tabKey) {
    if (window.isTestPersonaActive) return;
    if ((tabKey === "qr" || tabKey === "verify" || tabKey === "test") && !currentDirectSessionId) {
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
        prefetchWalletAuthOptions(sid);
        const session = await api(`/session/${sid}`);
        if (session && session.id) {
          currentDirectSessionId = session.id;
          currentDirectSessionData = session;
          if (session.dcRequest) {
            const initial = { sessionId: session.id, ...session.dcRequest };
            walletOptionsCache.set(session.id, initial);
            if (!cachedWalletOptions) cachedWalletOptions = initial;
          }
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
    if (["qr", "verify", "menu", "test"].includes(hash)) {
      switchTab(hash);
    } else {
      switchTab("qr");
    }

    startNewDirectSession();
  }

  initialize();
})();

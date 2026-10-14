require("dotenv").config();
const assert = require("assert");
const verificationRoutes = require("../server/routes/verification");
const credenceClient = require("../server/services/credenceClient");

console.log("=== TESTING NGROK QR RESOLUTION & URL REBASING ===");

// 1. Test when request originates from localhost:3000
const localReq = {
  protocol: "http",
  headers: {
    host: "localhost:3000",
  },
  get(header) {
    if (header.toLowerCase() === "host") return "localhost:3000";
    return this.headers[header.toLowerCase()];
  },
};

const resolvedLocal = verificationRoutes.resolveRequestOrigin(localReq);
console.log("1. Request from localhost:3000 -> resolved to:", resolvedLocal);
assert.strictEqual(
  resolvedLocal,
  "https://peso-moonbeam-nacho.ngrok-free.dev",
  "Localhost request MUST resolve to configured ngrok domain"
);

// 2. Test when request originates through ngrok tunnel
const ngrokReq = {
  protocol: "https",
  headers: {
    "x-forwarded-proto": "https",
    "x-forwarded-host": "peso-moonbeam-nacho.ngrok-free.dev",
    host: "peso-moonbeam-nacho.ngrok-free.dev",
  },
  get(header) {
    if (header.toLowerCase() === "host") return "peso-moonbeam-nacho.ngrok-free.dev";
    return this.headers[header.toLowerCase()];
  },
};

const resolvedNgrok = verificationRoutes.resolveRequestOrigin(ngrokReq);
console.log("2. Request from ngrok tunnel -> resolved to:", resolvedNgrok);
assert.strictEqual(
  resolvedNgrok,
  "https://peso-moonbeam-nacho.ngrok-free.dev",
  "Ngrok tunnel request MUST resolve to active ngrok domain"
);

// 3. Test credenceClient.extractOrigin for localhost
const extractedLocal = credenceClient.extractOrigin(localReq);
console.log("3. credenceClient extractOrigin for localhost -> resolved to:", extractedLocal);
assert.strictEqual(
  extractedLocal,
  "https://peso-moonbeam-nacho.ngrok-free.dev",
  "credenceClient MUST extract ngrok domain for local requests"
);

// 4. Test client-side QR resolution logic simulation
function simulateClientResolveTargetOrigin(locOrigin, session) {
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

const mockSessionFromBackend = {
  id: "test-sid-9999",
  publicOrigin: resolvedLocal,
  mobileVerifyUrl: `${resolvedLocal}/verify?session_id=test-sid-9999&ngrok-skip-browser-warning=true`,
};

// Desktop browser opened to http://localhost:3000
const clientTargetOrigin = simulateClientResolveTargetOrigin("http://localhost:3000", mockSessionFromBackend);
console.log("4. Client target origin when viewing on http://localhost:3000:", clientTargetOrigin);
assert.strictEqual(clientTargetOrigin, "https://peso-moonbeam-nacho.ngrok-free.dev");

// Construct final QR code payload string
let qrTargetUrl = `${clientTargetOrigin}/verify?session_id=${mockSessionFromBackend.id}`;
if (clientTargetOrigin.includes("ngrok") && !qrTargetUrl.includes("ngrok-skip-browser-warning")) {
  qrTargetUrl += "&ngrok-skip-browser-warning=true";
}
console.log("5. Generated QR code payload URL:", qrTargetUrl);
assert.strictEqual(
  qrTargetUrl,
  "https://peso-moonbeam-nacho.ngrok-free.dev/verify?session_id=test-sid-9999&ngrok-skip-browser-warning=true"
);

// 6. Test deep link rebasing (both plain and URL-encoded localhost occurrences)
const rawCloudWalletUri = "openid4vp://authorize?client_id=passgate&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback%3Fsession_id%3Dtest-sid-9999";
let rebased = rawCloudWalletUri.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/g, clientTargetOrigin);
const encodedLocalhost = /https?%3A%2F%2F(localhost|127\.0\.0\.1)(%3A\d+)?/gi;
if (encodedLocalhost.test(rebased)) {
  rebased = rebased.replace(encodedLocalhost, encodeURIComponent(clientTargetOrigin));
}
console.log("6. Rebased cloud walletUri:", rebased);
assert(
  !rebased.includes("localhost"),
  "Rebased walletUri must have zero occurrences of localhost"
);
assert(
  rebased.includes("peso-moonbeam-nacho.ngrok-free.dev"),
  "Rebased walletUri must include active ngrok domain"
);

console.log("\n🎉 ALL QR RESOLUTION & REBASING TESTS PASSED PERFECTLY!\n");

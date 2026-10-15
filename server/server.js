// ─── PassGate  ·  Express Backend ────────────────────────────────────────────
// Handles CredenceID Cloud SDK session management, webhook callbacks, and
// age-verification policy evaluation for the mDL kiosk demo.
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config();

const os = require("os");
const express = require("express");
const cors = require("cors");
const path = require("path");
const verificationRoutes = require("./routes/verification");

const app = express();
const PORT = process.env.PORT || 3000;

// Enable trust proxy for reverse proxies & secure tunnels (ngrok, cloudflared, localtunnel)
// Allows Express to correctly resolve req.protocol (https) and req.get("host")
app.set("trust proxy", true);

// Normalize host headers behind reverse proxies / ngrok tunnels
app.use((req, _res, next) => {
  const forwardedHost =
    req.headers["x-forwarded-host"] ||
    req.headers["x-original-host"];
  if (forwardedHost && !forwardedHost.includes("localhost")) {
    req.headers.host = forwardedHost;
  }
  next();
});

// Helper to discover the machine's local network IPv4 address for same-Wi-Fi mobile testing
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

// ── Dynamic Public Origin Resolver ───────────────────────────────────────────
function getPublicOrigin(req) {
  return verificationRoutes.resolveRequestOrigin(req);
}

// ── CORS Middleware ───────────────────────────────────────────────────────────
// Allows requests from dynamic ngrok domains (*.ngrok-free.app), localhost, and LAN IPs
const corsOptions = {
  origin: (origin, callback) => {
    // 1. Allow non-browser requests (e.g. mobile apps, curl, webhooks, server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    // 2. Allow any ngrok subdomain (*.ngrok-free.app, *.ngrok.app, *.ngrok.io)
    if (
      /\.ngrok(-free)?\.(app|io)$/i.test(origin) ||
      origin.includes("ngrok")
    ) {
      return callback(null, true);
    }

    // 3. Allow localhost and 127.0.0.1 (any port)
    if (
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
    ) {
      return callback(null, true);
    }

    // 4. Allow any private LAN IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    if (
      /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/i.test(origin)
    ) {
      return callback(null, true);
    }

    // 5. Allow matching active configured origin
    const configuredOrigin = process.env.CREDENCE_ORIGIN || process.env.PUBLIC_URL;
    if (configuredOrigin && origin.startsWith(configuredOrigin)) {
      return callback(null, true);
    }

    // Permissive fallback for tunnel testing
    return callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Origin",
    "Accept",
    "ngrok-skip-browser-warning",
    "x-forwarded-proto",
    "x-forwarded-host",
  ],
  exposedHeaders: ["Content-Range", "X-Content-Range"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

// Serve the frontend from /public with no-cache headers for demo testing
app.use(
  express.static(path.join(__dirname, "..", "public"), {
    setHeaders: (res) => {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
    },
  })
);

const walletRoutes = require("./routes/wallet");

// ── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/verification", verificationRoutes);
app.use("/api/wallet", walletRoutes);

// ── Health Check ─────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    origin: getPublicOrigin(req),
    timestamp: new Date().toISOString(),
  });
});

// ── Wallet Return Redirect Callback ──────────────────────────────────────────
// Digital wallets redirect here after same-device user approval.
// Dispatches directly into verification router to avoid chained 302 redirects on mobile WebKit.
app.get("/callback", (req, res, next) => {
  const query = new URLSearchParams(req.query).toString();
  req.url = `/callback${query ? `?${query}` : ""}`;
  return verificationRoutes(req, res, next);
});

// ── Mobile Verification Route ────────────────────────────────────────────────
app.get("/verify", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// ── SPA Fallback ─────────────────────────────────────────────────────────────
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// ── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("[PassGate]", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const localIp = getLocalIpAddress();
  console.log(`\n🛂  PassGate Server Started`);
  console.log(`    Local:   http://localhost:${PORT}`);
  if (localIp) {
    console.log(`    Network: http://${localIp}:${PORT}  (Same-Wi-Fi Mobile Testing)`);
  }
  console.log(
    `    Mode:    ${process.env.USE_MOCK === "true" ? "MOCK (simulated)" : "LIVE (CredenceID Cloud)"}\n`
  );
});

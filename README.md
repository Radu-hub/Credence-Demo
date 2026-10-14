# 🛡️ PassGate — Online Web-to-Mobile Digital Wallet Verification Flow

A modern, mobile-optimized proof-of-concept for **online age-verified checkout** using mobile driver's licenses (mDLs) and Apple Wallet, powered by the **CredenceID Cloud SDK**, **W3C Digital Credentials API**, and **ISO/IEC 18013-5 / 18013-7**.

PassGate demonstrates:
- **Native Apple Wallet Verification:** One-tap **"Verify with Apple Wallet"** launching the native iOS Apple Wallet Face ID sheet.
- **Cross-Device Desktop-to-Mobile Handoff:** Desktop QR code that encodes a **standard mobile web URL** (`/verify?session_id=...`) so iPhone cameras natively open the checkout flow in Safari.
- **CredenceID iOS Verifier (Tap2iD Mobile):** Instant ISO 18013-5 mdoc QR code engagement for scanning with the CredenceID iOS Verifier app or NFC.
- **Cryptographic Trust Verification:** Issuer authentication (State DMV root certificates), device hardware signature validation, and data integrity verification (SHA-256 digests).
- **Real-Time Age Policy Enforcement:** Automatic age computation and verification ($\ge 21$) with zero photo ID uploads.
- **Synchronized State Machine:** Real-time polling and seamless state transitions across both mobile and desktop screens.

---

## Quick Start

```bash
# 1. Clone & enter the project
cd Credence-Demo

# 2. Install dependencies
npm install

# 3. Copy the environment template
cp .env.example .env

# 4. Start the server
npm run dev        # development with auto-reload
```

Open **http://localhost:3000** in your browser.

---

## Testing Workflows

### 1. Same-Device Apple Wallet Verification (iPhone Safari)
1. Open `https://peso-moonbeam-nacho.ngrok-free.dev` directly on your iPhone in Safari.
2. Tap the prominent **"Verify with Apple Wallet"** button.
3. Safari prompts the native Apple Wallet Face ID sheet requesting Age 21+ from your mobile driver's license.
4. Approve with Face ID: the credential is validated cryptographically against state DMV certificates and confirms your order in real time!

### 2. Desktop-to-Mobile Camera Scan Handoff
1. Open `http://localhost:3000` on your desktop/laptop.
2. Point your smartphone camera at the on-screen QR code.
3. Your phone camera detects the standard mobile web URL (`/verify?session_id=...`) and offers "Open in Safari" or "Open in Chrome".
4. Tap the link to open the checkout session on your phone, then tap **"Verify with Digital Wallet"**.
5. Once verified on your phone, **both the phone and your desktop screen** automatically transition in real time to the confirmed state!

### 3. Testing on a Physical Mobile Device (via Ngrok / Secure Tunnel)
To test on a physical iPhone or Android device with native digital wallet support:
```bash
# Terminal 1: Run PassGate
npm run dev

# Terminal 2: Start an HTTPS tunnel
ngrok http 3000
```
- **Automatic Dynamic Origin:** PassGate automatically inspects reverse-proxy headers (`X-Forwarded-Proto` and `X-Forwarded-Host`) from ngrok. You do **not** even need to restart or edit `.env`.
- **Optional Static Configuration:** You can set `PUBLIC_URL=https://<your-subdomain>.ngrok-free.app` in `.env` if using a reserved domain.
- **Camera Scan:** The desktop QR code encodes the live HTTPS ngrok URL. Point your iPhone or Android camera at the desktop screen, tap the Safari/Chrome prompt, and verify on your physical phone!
- **CORS & Tunnel Redirection:** The server reflects tunnel origins and formats `/callback` returns as absolute HTTPS URLs so digital wallets can cleanly redirect back to the phone's browser.

### 4. Presentation Simulator Dock
Click any persona in the bottom dock to test edge cases instantly:
- `🟢 Valid Adult (28)`: Pass (Radu R., CA DMV, Age 28)
- `👶 Underage (17)`: Policy Denial (Lucas M., CA DMV, Age 17)
- `📅 Expired ID`: Expiration Denial (Elena V., NY DMV, expired 2023)
- `🛡️ Untrusted Root`: Trust Denial (Untrusted Root CA)
- `⚠️ Tampered`: Security Denial (Digest hash mismatch / MSO invalid)

---

## Architecture & Data Flow

```
   ┌─────────────────────────────────────────────────────────────┐
   │                     DESKTOP CHECKOUT                        │
   │  Renders Order Summary + Companion QR (Mobile Web URL)      │
   │  Continuously polls GET /api/verification/session/:id       │
   └──────────────────────────────┬──────────────────────────────┘
                                  │ Camera Scan (/verify?session_id=...)
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                     MOBILE BROWSER                          │
   │  User taps "Verify with Digital Wallet (Apple / Google)"     │
   └──────────────────────────────┬──────────────────────────────┘
                                  │ Redirect to OpenID4VP Authorization URL
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │             NATIVE DIGITAL WALLET (iOS / Android)           │
   │  Biometric Consent (FaceID/Fingerprint) → mdoc Presentation │
   └──────────────────────────────┬──────────────────────────────┘
                                  │ Redirects back to /callback?response_code=...
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                   PASSGATE BACKEND & CLOUD                  │
   │  1. Exchanges code via GET /openid4vp/v1/mdoc/resume        │
   │  2. Evaluates cryptographic trust + Policy (Age >= 21)      │
   │  3. Marks session COMPLETED (GRANTED / DENIED)              │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
          ┌───────────────────────┴───────────────────────┐
          ▼                                               ▼
   [Mobile Screen Updates]                         [Desktop Screen Updates]
   "Order Confirmed · 21+ Verified"               "Order Confirmed · 21+ Verified"
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server listen port |
| `NODE_ENV` | `development` | Environment mode |
| `USE_MOCK` | `false` | `false` = Live Credence Cloud SDK; `true` = pure offline mock |
| `MIN_AGE` | `21` | Policy engine minimum age threshold |
| `CREDENCE_API_BASE_URL` | `https://credenceid.com/cloudsdkdev` | Credence Cloud SDK endpoint |
| `CREDENCE_API_KEY` | `CS_...` | Credence Cloud license key |
| `CREDENCE_PROFILE_ID` | `...` | Credence verification profile UUID |
| `CREDENCE_ORIGIN` | `http://localhost:3000` | Registered origin header |
| `PUBLIC_URL` | `http://localhost:3000` | Public tunnel URL (e.g. ngrok) encoded into mobile QR codes |

---

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/verification/session` | Create new checkout verification session (returns mobileVerifyUrl & redirectUrl) |
| `GET` | `/api/verification/session/:id` | Poll session status and verified decision |
| `GET` | `/api/verification/callback` | Catch wallet return redirect, resume session, and run policy check |
| `GET` | `/verify` | Mobile verification landing route |
| `POST` | `/api/verification/mock-payload` | Trigger simulated scenario for presentation testing |
| `GET` | `/api/verification/mock-scenarios` | List available test personas |
| `GET` | `/api/health` | Service health check |

---

## License

MIT — Built as a mobile driver's license (mDL) digital wallet verification demonstration.

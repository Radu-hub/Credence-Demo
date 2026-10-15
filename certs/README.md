# 🪪 Apple Developer "Verify with Wallet on the Web" Certificates & Keys

This directory holds the cryptographic credentials required for remote mDL verification using Apple Wallet on the Web and the W3C Digital Credentials API (`protocol: "iso18013-7"`).

---

## 1. Directory Structure

```
certs/
├── README.md                  # This guide
├── apple-reader-cert.pem      # Apple Identity Access Certificate (or .cer / .crt)
├── apple-reader-key.pem       # Reader Private Key (PKCS#8 or SEC1 EC P-256)
└── iaca/                      # State DMV IACA root certificates
    ├── ca-dmv-iaca.cer        # California DMV IACA Root (optional)
    ├── ny-dmv-iaca.cer        # New York DMV IACA Root (optional)
    └── ...
```

---

## 2. Where to Get Your Apple Developer Files

### A. Apple Identity Access Certificate (`apple-reader-cert.pem`)
1. Log in to your **[Apple Developer Account](https://developer.apple.com/account/)**.
2. Navigate to **Certificates, Identifiers & Profiles** → **Identifiers** → **Merchant IDs**.
3. Select your Merchant ID (or create one, e.g. `merchant.com.yourcompany.passgate`).
4. Under **Identity Access Certificates**, create a certificate using a Certificate Signing Request (CSR) generated with an **EC P-256 (prime256v1)** private key.
5. Download the `.cer` file from Apple Developer portal.
6. Convert to PEM (if needed) or place directly in this folder:
   ```bash
   openssl x509 -inform DER -in apple_identity.cer -out certs/apple-reader-cert.pem
   ```

### B. Apple Reader Private Key (`apple-reader-key.pem`)
This is the private key matching the CSR you submitted to Apple.
- Ensure it is an **EC P-256** private key in PKCS#8 or SEC1 PEM format:
  ```
  -----BEGIN PRIVATE KEY-----
  ...
  -----END PRIVATE KEY-----
  ```
  or:
  ```
  -----BEGIN EC PRIVATE KEY-----
  ...
  -----END EC PRIVATE KEY-----
  ```
- Save it to `certs/apple-reader-key.pem` and protect permissions:
  ```bash
  chmod 600 certs/apple-reader-key.pem
  ```

### C. State DMV IACA Root Certificates (`certs/iaca/`)
The **Issuing Authority Certificate Authority (IACA)** certificates belong to the government entities (State DMVs) issuing the mobile driver's licenses.
- Download State DMV IACA roots from the **AAMVA VICAL** (Verified Issuer Certificate Authority List) or official state DMV portals.
- Place any `.cer`, `.crt`, `.pem`, or `.der` files into `certs/iaca/`.
- PassGate automatically loads and validates incoming presentation chains against all certificates inside `certs/iaca/`.
- *(Note: In local development, if `certs/iaca/` is empty, PassGate operates in development trust mode, verifying the cryptographic integrity, HPKE decryption, and MSO digests while flagging the environment as dev mode).*

---

## 3. Environment Variables Reference

You can configure paths or raw PEM strings in `.env`:

```env
APPLE_MERCHANT_ID=merchant.com.yourcompany.passgate
APPLE_READER_CERT_PATH=certs/apple-reader-cert.pem
APPLE_READER_KEY_PATH=certs/apple-reader-key.pem
APPLE_IACA_ROOTS_PATH=certs/iaca
```

// ─── ISO/IEC 18013-5 Mock Personas & Payloads ────────────────────────────────
// Realistic mobile Driver's License (mDL) payloads representing standard
// data elements in the "org.iso.18013.5.1" namespace along with Mobile Security
// Object (MSO) trust and device authentication metadata.
// ─────────────────────────────────────────────────────────────────────────────

// Sample verified mdoc biometric portraits (base64 SVG data URIs)
const PORTRAIT_RADU =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="200" height="240">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="skin" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f5d0b5"/>
      <stop offset="100%" stop-color="#e0b08c"/>
    </linearGradient>
    <linearGradient id="hair" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2d2a26"/>
      <stop offset="100%" stop-color="#1a1816"/>
    </linearGradient>
    <linearGradient id="shirt" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0284c7"/>
      <stop offset="100%" stop-color="#0369a1"/>
    </linearGradient>
  </defs>
  <rect width="200" height="240" rx="16" fill="url(#bg)"/>
  <path d="M 30 240 L 30 205 Q 30 168 100 168 Q 170 168 170 205 L 170 240 Z" fill="url(#shirt)"/>
  <rect x="85" y="138" width="30" height="32" fill="url(#skin)"/>
  <ellipse cx="100" cy="104" rx="42" ry="50" fill="url(#skin)"/>
  <path d="M 58 100 Q 56 58 100 58 Q 144 58 142 100 Q 130 74 100 74 Q 70 74 58 100 Z" fill="url(#hair)"/>
  <ellipse cx="85" cy="105" rx="4" ry="3" fill="#1e293b"/>
  <ellipse cx="115" cy="105" rx="4" ry="3" fill="#1e293b"/>
  <path d="M 77 97 Q 85 94 93 97" stroke="#2d2a26" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M 107 97 Q 115 94 123 97" stroke="#2d2a26" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M 100 103 L 97 118 L 103 118" stroke="#c9926b" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M 90 130 Q 100 137 110 130" stroke="#b07048" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <rect x="12" y="12" width="52" height="18" rx="4" fill="rgba(56,189,248,0.15)" stroke="rgba(56,189,248,0.4)" stroke-width="1"/>
  <text x="38" y="24" fill="#38bdf8" font-size="8" font-family="-apple-system,system-ui,sans-serif" font-weight="700" text-anchor="middle">mDL VERIFIED</text>
</svg>`
  ).toString("base64");

const PORTRAIT_SOPHIA =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="200" height="240">
  <defs>
    <linearGradient id="pbg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="pskin" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fed7aa"/>
      <stop offset="100%" stop-color="#fdba74"/>
    </linearGradient>
    <linearGradient id="phair" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1c1917"/>
      <stop offset="100%" stop-color="#0c0a09"/>
    </linearGradient>
    <linearGradient id="pshirt" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4f46e5"/>
      <stop offset="100%" stop-color="#3730a3"/>
    </linearGradient>
  </defs>
  <rect width="200" height="240" rx="16" fill="url(#pbg)"/>
  <path d="M 30 240 L 30 205 Q 30 168 100 168 Q 170 168 170 205 L 170 240 Z" fill="url(#pshirt)"/>
  <rect x="86" y="138" width="28" height="32" fill="url(#pskin)"/>
  <path d="M 50 100 Q 45 160 52 195 Q 100 205 148 195 Q 155 160 150 100 Z" fill="url(#phair)"/>
  <ellipse cx="100" cy="104" rx="40" ry="48" fill="url(#pskin)"/>
  <path d="M 56 100 Q 56 56 100 56 Q 144 56 144 100 Q 132 70 100 70 Q 68 70 56 100 Z" fill="url(#phair)"/>
  <ellipse cx="85" cy="105" rx="4" ry="3" fill="#1e1b4b"/>
  <ellipse cx="115" cy="105" rx="4" ry="3" fill="#1e1b4b"/>
  <path d="M 77 97 Q 85 94 93 97" stroke="#1c1917" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M 107 97 Q 115 94 123 97" stroke="#1c1917" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M 91 130 Q 100 137 109 130" stroke="#c2410c" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <rect x="12" y="12" width="60" height="18" rx="4" fill="rgba(168,85,247,0.15)" stroke="rgba(168,85,247,0.4)" stroke-width="1"/>
  <text x="42" y="24" fill="#c084fc" font-size="8" font-family="-apple-system,system-ui,sans-serif" font-weight="700" text-anchor="middle">PASSPORT ID</text>
</svg>`
  ).toString("base64");

const PORTRAIT_LUCAS =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="200" height="240">
  <defs>
    <linearGradient id="lbg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b0764"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="lskin" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fed7aa"/>
      <stop offset="100%" stop-color="#fdba74"/>
    </linearGradient>
    <linearGradient id="lhair" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#78350f"/>
      <stop offset="100%" stop-color="#451a03"/>
    </linearGradient>
    <linearGradient id="lhoodie" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#e11d48"/>
      <stop offset="100%" stop-color="#9f1239"/>
    </linearGradient>
  </defs>
  <rect width="200" height="240" rx="16" fill="url(#lbg)"/>
  <path d="M 30 240 L 30 205 Q 30 168 100 168 Q 170 168 170 205 L 170 240 Z" fill="url(#lhoodie)"/>
  <rect x="86" y="138" width="28" height="32" fill="url(#lskin)"/>
  <ellipse cx="100" cy="105" rx="39" ry="46" fill="url(#lskin)"/>
  <path d="M 58 98 Q 62 58 100 58 Q 138 58 142 98 Q 130 76 100 76 Q 70 76 58 98 Z" fill="url(#lhair)"/>
  <ellipse cx="86" cy="106" rx="4" ry="3" fill="#1e293b"/>
  <ellipse cx="114" cy="106" rx="4" ry="3" fill="#1e293b"/>
  <path d="M 78 98 Q 86 95 94 98" stroke="#451a03" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M 106 98 Q 114 95 122 98" stroke="#451a03" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M 91 130 Q 100 136 109 130" stroke="#c2410c" stroke-width="2" fill="none" stroke-linecap="round"/>
  <rect x="12" y="12" width="60" height="18" rx="4" fill="rgba(239,68,68,0.18)" stroke="rgba(239,68,68,0.4)" stroke-width="1"/>
  <text x="42" y="24" fill="#f87171" font-size="8" font-family="-apple-system,system-ui,sans-serif" font-weight="700" text-anchor="middle">UNDER 21 ID</text>
</svg>`
  ).toString("base64");

const PORTRAIT_ELENA =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="200" height="240">
  <defs>
    <linearGradient id="ebg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="eskin" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fed7aa"/>
      <stop offset="100%" stop-color="#fbcfe8"/>
    </linearGradient>
    <linearGradient id="ehair" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#451a03"/>
      <stop offset="100%" stop-color="#1c1917"/>
    </linearGradient>
    <linearGradient id="ejacket" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#059669"/>
      <stop offset="100%" stop-color="#047857"/>
    </linearGradient>
  </defs>
  <rect width="200" height="240" rx="16" fill="url(#ebg)"/>
  <path d="M 30 240 L 30 205 Q 30 168 100 168 Q 170 168 170 205 L 170 240 Z" fill="url(#ejacket)"/>
  <rect x="86" y="138" width="28" height="32" fill="url(#eskin)"/>
  <path d="M 52 100 Q 48 150 54 185 Q 100 195 146 185 Q 152 150 148 100 Z" fill="url(#ehair)"/>
  <ellipse cx="100" cy="105" rx="39" ry="48" fill="url(#eskin)"/>
  <path d="M 58 98 Q 58 56 100 56 Q 142 56 142 98 Q 130 68 100 68 Q 70 68 58 98 Z" fill="url(#ehair)"/>
  <ellipse cx="86" cy="106" rx="4" ry="3" fill="#1e293b"/>
  <ellipse cx="114" cy="106" rx="4" ry="3" fill="#1e293b"/>
  <path d="M 78 98 Q 86 95 94 98" stroke="#1c1917" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M 106 98 Q 114 95 122 98" stroke="#1c1917" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M 91 130 Q 100 136 109 130" stroke="#db2777" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <rect x="12" y="12" width="58" height="18" rx="4" fill="rgba(245,158,11,0.18)" stroke="rgba(245,158,11,0.4)" stroke-width="1"/>
  <text x="41" y="24" fill="#fbbf24" font-size="8" font-family="-apple-system,system-ui,sans-serif" font-weight="700" text-anchor="middle">EXPIRED ID</text>
</svg>`
  ).toString("base64");

const PORTRAIT_JOHN =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="200" height="240">
  <defs>
    <linearGradient id="jbg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="jskin" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f5d0b5"/>
      <stop offset="100%" stop-color="#e0b08c"/>
    </linearGradient>
    <linearGradient id="jhair" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#64748b"/>
      <stop offset="100%" stop-color="#475569"/>
    </linearGradient>
    <linearGradient id="jshirt" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0284c7"/>
      <stop offset="100%" stop-color="#0369a1"/>
    </linearGradient>
  </defs>
  <rect width="200" height="240" rx="16" fill="url(#jbg)"/>
  <path d="M 30 240 L 30 205 Q 30 168 100 168 Q 170 168 170 205 L 170 240 Z" fill="url(#jshirt)"/>
  <rect x="85" y="138" width="30" height="32" fill="url(#jskin)"/>
  <ellipse cx="100" cy="104" rx="42" ry="50" fill="url(#jskin)"/>
  <path d="M 58 100 Q 56 58 100 58 Q 144 58 142 100 Q 130 74 100 74 Q 70 74 58 100 Z" fill="url(#jhair)"/>
  <ellipse cx="85" cy="105" rx="4" ry="3" fill="#1e293b"/>
  <ellipse cx="115" cy="105" rx="4" ry="3" fill="#1e293b"/>
  <path d="M 77 97 Q 85 94 93 97" stroke="#475569" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M 107 97 Q 115 94 123 97" stroke="#475569" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M 100 103 L 97 118 L 103 118" stroke="#c9926b" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M 90 130 Q 100 137 110 130" stroke="#b07048" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <rect x="12" y="12" width="68" height="18" rx="4" fill="rgba(16,185,129,0.15)" stroke="rgba(16,185,129,0.4)" stroke-width="1"/>
  <text x="46" y="24" fill="#10b981" font-size="8" font-family="-apple-system,system-ui,sans-serif" font-weight="700" text-anchor="middle">PASSKIT MOCK</text>
</svg>`
  ).toString("base64");

const MOCK_SCENARIOS = {
  adult_verified: {
    id: "adult_verified",
    name: "Valid Adult (Age 28)",
    description: "Authentic CA mDL holder, over 21, valid cryptographic trust chain.",
    payload: {
      docType: "org.iso.18013.5.1.mDL",
      issuerSigned: {
        nameSpaces: {
          "org.iso.18013.5.1": {
            family_name: "Richardson",
            given_name: "Radu",
            birth_date: "1998-03-15",
            issue_date: "2023-03-15",
            expiry_date: "2028-03-15",
            issuing_authority: "California DMV",
            issuing_country: "USA",
            document_number: "CA-D8832910",
            age_over_21: true,
            portrait: PORTRAIT_RADU,
            driving_privileges: [{ vehicle_category_code: "C" }],
          },
        },
        issuerAuth: {
          certificate_issuer: "C=US, O=State of California, OU=DMV, CN=CA mDL Issuing Authority Root",
          algorithm: "ES256",
          signature_valid: true,
        },
      },
      deviceSigned: {
        deviceAuth: {
          algorithm: "ES256",
          device_key_authorized: true,
          signature_valid: true,
        },
      },
      trust: {
        issuer_authenticated: true,
        device_signature_valid: true,
        data_integrity: "VERIFIED",
        digest_algorithm: "SHA-256",
      },
    },
  },

  passport_adult_verified: {
    id: "passport_adult_verified",
    name: "Digital Passport Adult (Age 28)",
    description: "Authentic ICAO Doc 9303 Digital Travel Credential, over 21, dynamic age calculated from dob without age_over_21 boolean.",
    payload: {
      docType: "org.icao.mdoc",
      issuerSigned: {
        nameSpaces: {
          "org.icao.mdoc": {
            surname: "Chen",
            given_names: "Sophia",
            dob: "1998-07-20",
            passport_number: "US-P9028194",
            issuing_country: "USA",
            issuing_authority: "U.S. Department of State",
            expiry_date: "2031-07-20",
            nationality: "USA",
            portrait: PORTRAIT_SOPHIA,
          },
        },
        issuerAuth: {
          certificate_issuer: "C=US, O=U.S. Department of State, CN=U.S. Passport Issuing Authority Root CA",
          algorithm: "ES256",
          signature_valid: true,
        },
      },
      deviceSigned: {
        deviceAuth: {
          algorithm: "ES256",
          device_key_authorized: true,
          signature_valid: true,
        },
      },
      trust: {
        issuer_authenticated: true,
        device_signature_valid: true,
        data_integrity: "VERIFIED",
        digest_algorithm: "SHA-256",
      },
    },
  },

  underage_minor: {
    id: "underage_minor",
    name: "Underage Minor (Age 17)",
    description: "Authentic CA provisional license, under 21 policy failure.",
    payload: {
      docType: "org.iso.18013.5.1.mDL",
      issuerSigned: {
        nameSpaces: {
          "org.iso.18013.5.1": {
            family_name: "Miller",
            given_name: "Lucas",
            birth_date: "2008-11-20",
            issue_date: "2024-01-10",
            expiry_date: "2029-01-10",
            issuing_authority: "California DMV",
            issuing_country: "USA",
            document_number: "CA-D1049281",
            age_over_21: false,
            portrait: PORTRAIT_LUCAS,
          },
        },
        issuerAuth: {
          certificate_issuer: "C=US, O=State of California, OU=DMV, CN=CA mDL Issuing Authority Root",
          algorithm: "ES256",
          signature_valid: true,
        },
      },
      deviceSigned: {
        deviceAuth: {
          algorithm: "ES256",
          device_key_authorized: true,
          signature_valid: true,
        },
      },
      trust: {
        issuer_authenticated: true,
        device_signature_valid: true,
        data_integrity: "VERIFIED",
        digest_algorithm: "SHA-256",
      },
    },
  },

  expired_document: {
    id: "expired_document",
    name: "Expired Credential (Age 34)",
    description: "Authentic license with an expiration date in the past.",
    payload: {
      docType: "org.iso.18013.5.1.mDL",
      issuerSigned: {
        nameSpaces: {
          "org.iso.18013.5.1": {
            family_name: "Vance",
            given_name: "Elena",
            birth_date: "1990-06-12",
            issue_date: "2018-06-12",
            expiry_date: "2023-06-12",
            issuing_authority: "New York DMV",
            issuing_country: "USA",
            document_number: "NY-4910284",
            age_over_21: true,
            portrait: PORTRAIT_ELENA,
          },
        },
        issuerAuth: {
          certificate_issuer: "C=US, O=State of New York, OU=DMV, CN=NY mDL Issuing Authority Root",
          algorithm: "ES256",
          signature_valid: true,
        },
      },
      deviceSigned: {
        deviceAuth: {
          algorithm: "ES256",
          device_key_authorized: true,
          signature_valid: true,
        },
      },
      trust: {
        issuer_authenticated: true,
        device_signature_valid: true,
        data_integrity: "VERIFIED",
        digest_algorithm: "SHA-256",
      },
    },
  },

  untrusted_issuer: {
    id: "untrusted_issuer",
    name: "Untrusted Root / Rogue Issuer",
    description: "Cryptographic failure: issuer signature not in known Vetted Trust Anchor list.",
    payload: {
      docType: "org.iso.18013.5.1.mDL",
      issuerSigned: {
        nameSpaces: {
          "org.iso.18013.5.1": {
            family_name: "Smith",
            given_name: "John",
            birth_date: "1995-04-10",
            issue_date: "2022-01-01",
            expiry_date: "2027-01-01",
            issuing_authority: "Unknown Rogue CA",
            issuing_country: "ZZ",
            document_number: "UNTRUSTED-0912",
            age_over_21: true,
          },
        },
        issuerAuth: {
          certificate_issuer: "CN=Self-Signed Rogue CA",
          algorithm: "ES256",
          signature_valid: false,
        },
      },
      deviceSigned: {
        deviceAuth: {
          algorithm: "ES256",
          device_key_authorized: false,
          signature_valid: true,
        },
      },
      trust: {
        issuer_authenticated: false,
        device_signature_valid: true,
        data_integrity: "VERIFIED",
        digest_algorithm: "SHA-256",
      },
    },
  },

  tampered_integrity: {
    id: "tampered_integrity",
    name: "Tampered Credential (Digest Mismatch)",
    description: "Security alert: element hash does not match Mobile Security Object (MSO).",
    payload: {
      docType: "org.iso.18013.5.1.mDL",
      issuerSigned: {
        nameSpaces: {
          "org.iso.18013.5.1": {
            family_name: "Conrad",
            given_name: "Marcus",
            birth_date: "1992-09-05",
            issue_date: "2021-05-10",
            expiry_date: "2026-05-10",
            issuing_authority: "California DMV",
            issuing_country: "USA",
            document_number: "CA-D9918231",
            age_over_21: true,
          },
        },
        issuerAuth: {
          certificate_issuer: "C=US, O=State of California, OU=DMV, CN=CA mDL Issuing Authority Root",
          algorithm: "ES256",
          signature_valid: true,
        },
      },
      deviceSigned: {
        deviceAuth: {
          algorithm: "ES256",
          device_key_authorized: true,
          signature_valid: false,
        },
      },
      trust: {
        issuer_authenticated: true,
        device_signature_valid: false,
        data_integrity: "TAMPERED",
        digest_algorithm: "SHA-256",
      },
    },
  },

  passkit_mock: {
    id: "passkit_mock",
    name: "Apple Wallet PassKit Mock (John Doe, Age 56)",
    description: "Industry-standard PassKit #if DEBUG mock payload replicating raw org.iso.18013.5.1 decrypted structure.",
    payload: {
      docType: "org.iso.18013.5.1.mDL",
      "org.iso.18013.5.1": {
        given_name: "John",
        family_name: "Doe",
        birth_date: "1970-01-01",
        age_over_21: true,
        document_number: "PK-19700101-JD",
        issuing_authority: "Apple Wallet / ISO 18013-5 Mock Provider",
        issuing_country: "USA",
        portrait: PORTRAIT_JOHN,
      },
      issuerSigned: {
        nameSpaces: {
          "org.iso.18013.5.1": {
            given_name: "John",
            family_name: "Doe",
            birth_date: "1970-01-01",
            issue_date: "2020-01-01",
            expiry_date: "2030-01-01",
            issuing_authority: "Apple Wallet / ISO 18013-5 Mock Provider",
            issuing_country: "USA",
            document_number: "PK-19700101-JD",
            age_over_21: true,
            portrait: PORTRAIT_JOHN,
          },
        },
        issuerAuth: {
          certificate_issuer: "C=US, O=Apple Inc., OU=Apple Wallet PassKit, CN=PassKit Mock Issuing Authority Root",
          algorithm: "ES256",
          signature_valid: true,
        },
      },
      deviceSigned: {
        deviceAuth: {
          algorithm: "ES256",
          device_key_authorized: true,
          signature_valid: true,
        },
      },
      trust: {
        issuer_authenticated: true,
        device_signature_valid: true,
        data_integrity: "VERIFIED",
        digest_algorithm: "SHA-256",
      },
    },
  },
};

// Convenient alias for Apple Wallet PassKit mock scenario
MOCK_SCENARIOS.apple_wallet_mock = MOCK_SCENARIOS.passkit_mock;

module.exports = {
  MOCK_SCENARIOS,
};

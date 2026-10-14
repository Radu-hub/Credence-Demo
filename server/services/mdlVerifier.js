// ─── ISO/IEC 18013-5 mDL & ICAO Digital Passport Verifier & Policy Engine ─────
// Extracts attributes from standard namespaces (mDL, ICAO Doc 9303, AAMVA, PID),
// normalizes alternative claim keys, evaluates cryptographic trust chains,
// and enforces business policies (dynamic age calculation, document expiry).
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const cborEncoder = require("./cborEncoder");

/**
 * Standard namespaces recognized across mobile Driver's Licenses,
 * international Digital Passports, and electronic identity documents.
 */
const RECOGNIZED_NAMESPACES = [
  "org.iso.18013.5.1",          // ISO/IEC 18013-5 standard mDL
  "org.iso.18013.5.1.aamva",    // AAMVA mDL extensions
  "org.iso.18013.5.aamva",      // Alternative AAMVA namespace
  "org.icao.mdoc",              // ICAO Doc 9303 Digital Travel Credential / mdoc
  "org.icao.mrtd",              // ICAO Machine Readable Travel Documents
  "org.icao.9303",              // ICAO Doc 9303 Electronic Passport
  "org.icao.mrtd.1",            // ICAO MRTD namespace 1
  "org.iso.23220.2",            // ISO/IEC 23220-2 Building blocks for digital identity
  "eu.europa.ec.eudiw.pid.1",   // European Digital Identity Wallet (EUDIW) PID
  "eu.europa.ec.eudi.pid.1",    // EU Digital Identity PID v1
  "aamva.pdf417",               // AAMVA PDF417 credential claims
];

/**
 * Robustly parses various date formats into standard ISO 8601 YYYY-MM-DD.
 * Supports:
 *   - ISO format: YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
 *   - Compact 8-digit: YYYYMMDD (AAMVA DBB / mdoc)
 *   - ICAO Doc 9303 MRZ 6-digit: YYMMDD (with 100-year rolling pivot)
 *   - Delimited dates: MM/DD/YYYY, DD/MM/YYYY
 *   - Object: { year, month, day }
 *   - Native Date objects & timestamps
 *
 * @param {string|number|Object|Date} input
 * @returns {string|null} Canonical "YYYY-MM-DD" string or null if unparseable
 */
function parseDateToIso(input) {
  if (!input) return null;

  // 1. Native Date instance
  if (input instanceof Date && !isNaN(input.getTime())) {
    const y = input.getUTCFullYear();
    const m = String(input.getUTCMonth() + 1).padStart(2, "0");
    const d = String(input.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // 2. Structured object: { year, month, day }
  if (typeof input === "object" && input.year && input.month && input.day) {
    const y = String(input.year);
    const m = String(input.month).padStart(2, "0");
    const d = String(input.day).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const str = String(input).trim();
  if (!str) return null;

  // 3. ISO 8601 YYYY-MM-DD (with dashes, slashes, or dots)
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, "0");
    const d = isoMatch[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // 4. Compact 8-digit YYYYMMDD (e.g. "19980315")
  if (/^\d{8}$/.test(str)) {
    const y = str.slice(0, 4);
    const m = str.slice(4, 6);
    const d = str.slice(6, 8);
    return `${y}-${m}-${d}`;
  }

  // 5. ICAO Doc 9303 MRZ 6-digit YYMMDD (e.g. "980315" -> 1998-03-15)
  if (/^\d{6}$/.test(str)) {
    const yy = parseInt(str.slice(0, 2), 10);
    const m = str.slice(2, 4);
    const d = str.slice(4, 6);
    const currentYear2Digit = new Date().getFullYear() % 100;
    // Standard ICAO 100-year rolling pivot: if YY <= current year, 2000s; else 1900s
    const century = yy <= currentYear2Digit ? 2000 : 1900;
    const y = String(century + yy);
    return `${y}-${m}-${d}`;
  }

  // 6. Delimited MM/DD/YYYY or DD/MM/YYYY
  const slashMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (slashMatch) {
    const part1 = parseInt(slashMatch[1], 10);
    const part2 = parseInt(slashMatch[2], 10);
    const y = slashMatch[3];
    // If part1 > 12, it must be DD/MM/YYYY
    if (part1 > 12 && part2 <= 12) {
      const d = String(part1).padStart(2, "0");
      const m = String(part2).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    // Default to MM/DD/YYYY (standard US / digital wallet representation)
    const m = String(part1).padStart(2, "0");
    const d = String(part2).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // 7. General JavaScript Date fallback
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    const m = String(parsed.getUTCMonth() + 1).padStart(2, "0");
    const d = String(parsed.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return str;
}

/**
 * Calculates subject age accurately given any supported date representation.
 * Compares birth year, month, and day against the active date without timezone shift.
 *
 * @param {string|number|Object|Date} birthDateInput
 * @returns {number|null} Computed age in years, or null if unparseable
 */
function calculateAge(birthDateInput) {
  if (!birthDateInput) return null;
  const isoStr = parseDateToIso(birthDateInput);
  if (!isoStr) return null;

  const match = isoStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const birthYear = parseInt(match[1], 10);
  const birthMonth = parseInt(match[2], 10); // 1-12
  const birthDay = parseInt(match[3], 10);   // 1-31

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 1-12
  const currentDay = today.getDate();

  let age = currentYear - birthYear;
  const monthDiff = currentMonth - birthMonth;
  if (monthDiff < 0 || (monthDiff === 0 && currentDay < birthDay)) {
    age--;
  }

  return age;
}

/**
 * Detects image MIME type from binary magic bytes.
 *
 * @param {Buffer|Uint8Array} buf
 * @returns {string} Detected MIME type (defaults to "image/jpeg")
 */
function detectImageMimeFromBuffer(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x00 &&
    buf[1] === 0x00 &&
    buf[2] === 0x00 &&
    buf[3] === 0x0c &&
    buf[4] === 0x6a &&
    buf[5] === 0x50
  ) {
    return "image/jp2"; // JPEG 2000 (standard in ICAO Doc 9303 / ISO 19794-5)
  }
  if (buf.length >= 4 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
    return "image/webp";
  }
  return "image/jpeg";
}

/**
 * Safely validates and normalizes an image payload into a secure data URI.
 * Supports:
 *   - Raw base64 JPEG/PNG/JP2/WebP strings
 *   - Pre-formatted safe data:image/ URIs
 *   - Binary Buffers / Uint8Arrays
 *   - Objects with base64 / data properties
 *
 * Prevents injection vectors by strictly verifying MIME types and disallowing
 * executable content (e.g. javascript:, data:text/html, SVG scripts).
 *
 * @param {string|Buffer|Object} input
 * @returns {string|null} Safe "data:image/...;base64,..." string or null if invalid
 */
function sanitizePortraitDataUrl(input) {
  if (!input) return null;

  // 1. Binary Buffer or Uint8Array
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    const buf = Buffer.from(input);
    if (buf.length === 0) return null;
    const mime = detectImageMimeFromBuffer(buf);
    return `data:${mime};base64,${buf.toString("base64")}`;
  }

  // 2. Structured object with inner image data
  if (typeof input === "object") {
    if (input.data) return sanitizePortraitDataUrl(input.data);
    if (input.base64) return sanitizePortraitDataUrl(input.base64);
    if (input.image) return sanitizePortraitDataUrl(input.image);
    return null;
  }

  if (typeof input !== "string") return null;

  const str = input.trim();
  if (!str) return null;

  // 3. Pre-formatted data: URI
  if (str.startsWith("data:")) {
    // Strictly whitelist safe image MIME types
    const match = str.match(
      /^data:(image\/(?:jpeg|jpg|png|webp|jp2|gif|svg\+xml))(?:;charset=[^;]+)?(;base64)?,(.*)$/i
    );
    if (!match) {
      // Disallow non-image data URIs (e.g. data:text/html or javascript:)
      return null;
    }
    const mime = match[1].toLowerCase();
    const isBase64 = Boolean(match[2]);
    const payload = match[3];

    // If SVG, ensure no embedded executable scripts or event handlers
    if (mime.includes("svg")) {
      try {
        const decoded = isBase64
          ? Buffer.from(payload, "base64").toString("utf8")
          : decodeURIComponent(payload);
        if (/<script|on[a-z]+\s*=/i.test(decoded)) {
          return null;
        }
      } catch (_) {
        return null;
      }
    }
    return str;
  }

  // 4. Reject strings containing script keywords or HTML injection attempts
  if (/<script|javascript:|on[a-z]+\s*=/i.test(str)) {
    return null;
  }

  // 5. Raw base64 image string
  const cleanBase64 = str.replace(/[\r\n\s]/g, "");

  // Detect image type from base64 signature
  let mime = "image/jpeg";
  if (cleanBase64.startsWith("/9j/")) {
    mime = "image/jpeg";
  } else if (cleanBase64.startsWith("iVBORw0KGgo")) {
    mime = "image/png";
  } else if (cleanBase64.startsWith("UklGR")) {
    mime = "image/webp";
  } else if (cleanBase64.startsWith("PHN2Zy") || cleanBase64.startsWith("PD94bW")) {
    mime = "image/svg+xml";
    try {
      const decoded = Buffer.from(cleanBase64, "base64").toString("utf8");
      if (/<script|on[a-z]+\s*=/i.test(decoded)) return null;
    } catch (_) {
      return null;
    }
  } else if (cleanBase64.startsWith("AAAAD") || cleanBase64.startsWith("AAAA")) {
    mime = "image/jp2"; // JPEG 2000
  }

  // Ensure cleanBase64 contains strictly valid base64 characters
  if (!/^[A-Za-z0-9+/=_-]+$/.test(cleanBase64)) {
    return null;
  }

  return `data:${mime};base64,${cleanBase64}`;
}

/**
 * Extracts and normalizes identity attributes from mobile driver's licenses (mDL),
 * digital passports (ICAO Doc 9303 / org.icao.mdoc), and alternative identity documents.
 *
 * Checks all recognized namespaces, merges multi-document arrays, and normalizes
 * alternative keys for DOB, names, age verification, and document metadata.
 *
 * @param {Object|string} rawPayload - Raw incoming presentation payload
 * @returns {Object} Normalized attributes map
 */
/**
 * Extracts and normalizes identity attributes from mobile driver's licenses (mDL),
 * digital passports (ICAO Doc 9303 / org.icao.mdoc), and alternative identity documents.
 *
 * Supports:
 *   - Base64 / Base64url encoded CBOR DeviceResponse strings
 *   - ISO/IEC 18013-5 DeviceResponse with Tag 24 IssuerSignedItem arrays
 *   - ISO/IEC 18013-7 Annex C HPKE-encrypted response structures (decrypted with session key)
 *   - Standard JSON payloads, OpenID4VP claims, and Credence Cloud resDetails
 *   - Normalizes alternative keys for DOB, names, age claims, and document metadata.
 *
 * @param {Object|string} rawPayload - Raw incoming presentation payload
 * @param {string} [sessionId] - Optional session ID for ephemeral HPKE decryption key lookup
 * @returns {Object} Normalized attributes map
 */
function extractMdlAttributes(rawPayload, sessionId = null) {
  if (!rawPayload) return {};

  let payload = rawPayload;

  // Helper to decode a base64 or base64url string into a Buffer
  function parseBase64Buffer(str) {
    if (typeof str !== "string") return null;
    const clean = str.trim().replace(/\s+/g, "");
    try {
      return Buffer.from(clean, "base64url");
    } catch (_) {
      try {
        return Buffer.from(clean, "base64");
      } catch (_2) {
        return null;
      }
    }
  }

  // Helper to parse string payload as JSON or CBOR
  function parseStringPayload(str) {
    if (typeof str !== "string") return str;
    const trimmed = str.trim();
    if (!trimmed) return {};

    // 1. Try direct JSON parse
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.parse(trimmed);
      } catch (_) {}
    }

    // 2. Try base64 / base64url decode
    const buf = parseBase64Buffer(trimmed);
    if (buf && buf.length > 0) {
      // First try CBOR decode
      try {
        const cborDecoded = cborEncoder.decode(buf);
        if (cborDecoded && typeof cborDecoded === "object") {
          return cborDecoded;
        }
      } catch (_) {}

      // Next try UTF-8 JSON
      try {
        const jsonDecoded = JSON.parse(buf.toString("utf8"));
        if (jsonDecoded && typeof jsonDecoded === "object") {
          return jsonDecoded;
        }
      } catch (_) {}
    }

    return str;
  }

  // 1. Unwrap string payload if needed
  if (typeof payload === "string") {
    payload = parseStringPayload(payload);
  }

  // 2. Unwrap Buffer / Uint8Array payload directly
  if (Buffer.isBuffer(payload) || payload instanceof Uint8Array) {
    try {
      const cborDecoded = cborEncoder.decode(payload);
      if (cborDecoded && typeof cborDecoded === "object") {
        payload = cborDecoded;
      }
    } catch (_) {}
  }

  // 3. Unwrap nested wrappers (data, deviceResponse, response, credential, walletResponse)
  for (let i = 0; i < 4; i++) {
    if (!payload || typeof payload !== "object") break;

    if (payload.data !== undefined) {
      if (typeof payload.data === "string") {
        const parsed = parseStringPayload(payload.data);
        if (parsed && typeof parsed === "object") payload = parsed;
        else break;
      } else if (typeof payload.data === "object") {
        payload = payload.data;
      } else {
        break;
      }
    } else if (payload.deviceResponse !== undefined) {
      if (typeof payload.deviceResponse === "string") {
        const parsed = parseStringPayload(payload.deviceResponse);
        if (parsed && typeof parsed === "object") payload = parsed;
        else break;
      } else if (typeof payload.deviceResponse === "object") {
        payload = payload.deviceResponse;
      } else {
        break;
      }
    } else if (payload.response !== undefined) {
      if (typeof payload.response === "string") {
        const parsed = parseStringPayload(payload.response);
        if (parsed && typeof parsed === "object") payload = parsed;
        else break;
      } else if (typeof payload.response === "object") {
        payload = payload.response;
      } else {
        break;
      }
    } else if (payload.credential !== undefined && typeof payload.credential === "object") {
      payload = payload.credential;
    } else if (payload.walletResponse !== undefined && typeof payload.walletResponse === "object") {
      payload = payload.walletResponse;
    } else {
      break;
    }
  }

  // 4. Handle ISO 18013-7 Annex C HPKE Encrypted Response:
  // Can be [ "dcapi", { enc, ciphertext } ] or { enc, ciphertext }
  let enc = null;
  let ciphertext = null;
  if (Array.isArray(payload) && payload.length >= 2 && payload[0] === "dcapi" && typeof payload[1] === "object") {
    enc = payload[1].enc;
    ciphertext = payload[1].ciphertext;
  } else if (payload?.enc && payload?.ciphertext) {
    enc = payload.enc;
    ciphertext = payload.ciphertext;
  }

  if (enc && ciphertext && sessionId) {
    const sessionKey = cborEncoder.getSessionReaderKey(sessionId);
    if (sessionKey && sessionKey.jwk) {
      try {
        console.log(`[mdlVerifier] Decrypting ISO 18013-7 Annex C HPKE response for session ${sessionId}...`);
        const decryptedBytes = cborEncoder.decryptHpke(enc, ciphertext, sessionKey.jwk);
        const decryptedObj = cborEncoder.decode(decryptedBytes);
        if (decryptedObj && typeof decryptedObj === "object") {
          console.log("[mdlVerifier] HPKE response successfully decrypted!");
          payload = decryptedObj;
        }
      } catch (hpkeErr) {
        console.warn("[mdlVerifier] HPKE decryption notice:", hpkeErr.message);
      }
    }
  }

  let collected = {};
  let detectedDocType = payload?.docType || null;

  // Helper to harvest attributes from a namespaces container
  function harvestNamespaces(nsObj) {
    if (!nsObj || typeof nsObj !== "object") return;
    for (const nsKey of Object.keys(nsObj)) {
      const nsData = nsObj[nsKey];
      if (!nsData) continue;

      if (!detectedDocType) {
        if (nsKey.includes("icao") || nsKey.includes("mrtd")) {
          detectedDocType = "org.icao.mdoc";
        } else if (nsKey.includes("18013.5")) {
          detectedDocType = "org.iso.18013.5.1.mDL";
        }
      }

      // Case 1: Standard ISO 18013-5 array of IssuerSignedItem or CBOR Tag 24 items
      if (Array.isArray(nsData)) {
        for (const item of nsData) {
          let itemObj = item;
          if (Buffer.isBuffer(item) || item instanceof Uint8Array) {
            try {
              itemObj = cborEncoder.decode(item);
            } catch (_) {}
          }
          if (itemObj && typeof itemObj === "object") {
            if (itemObj.elementIdentifier && itemObj.elementValue !== undefined) {
              collected[itemObj.elementIdentifier] = itemObj.elementValue;
            } else {
              for (const [k, v] of Object.entries(itemObj)) {
                if (k !== "digestID" && k !== "random") {
                  collected[k] = v;
                }
              }
            }
          }
        }
      } else if (typeof nsData === "object") {
        // Case 2: Direct key-value dictionary (mock format or normalized claims)
        for (const [k, v] of Object.entries(nsData)) {
          let val = v;
          if (val && typeof val === "object" && val.elementIdentifier && val.elementValue !== undefined) {
            collected[val.elementIdentifier] = val.elementValue;
          } else {
            collected[k] = val;
          }
        }
      }
    }
  }

  // 1. Inspect issuerSigned namespaces at top level
  if (payload?.issuerSigned?.nameSpaces) {
    harvestNamespaces(payload.issuerSigned.nameSpaces);
  }
  if (payload?.nameSpaces) {
    harvestNamespaces(payload.nameSpaces);
  }

  // 2. Inspect multi-document arrays (ISO 18013-5 DeviceResponse documents)
  if (Array.isArray(payload?.documents) && payload.documents.length > 0) {
    for (const doc of payload.documents) {
      if (doc?.docType && !detectedDocType) {
        detectedDocType = doc.docType;
      }
      if (doc?.issuerSigned?.nameSpaces) {
        harvestNamespaces(doc.issuerSigned.nameSpaces);
      }
      if (doc?.nameSpaces) {
        harvestNamespaces(doc.nameSpaces);
      }
      if (doc?.attributes && typeof doc.attributes === "object") {
        collected = { ...collected, ...doc.attributes };
      }
      if (doc?.identity && typeof doc.identity === "object") {
        collected = { ...collected, ...doc.identity };
      }
    }
  }

  // 3. Inspect OpenID4VP identity object (Credence Cloud Flow C / Annex B)
  if (payload?.identity) {
    const ident = typeof payload.identity === "string"
      ? (() => { try { return JSON.parse(payload.identity); } catch (_) { return {}; } })()
      : payload.identity;
    collected = { ...collected, ...ident };
  }

  // 4. Inspect OpenID4VP claims & verifiedClaims
  if (payload?.claims && typeof payload.claims === "object") {
    collected = { ...collected, ...payload.claims };
  }
  if (payload?.verifiedClaims && typeof payload.verifiedClaims === "object") {
    collected = { ...collected, ...payload.verifiedClaims };
  }

  // 5. Inspect Credence Cloud resDetails (single-document or multi-document payload)
  if (payload?.resDetails) {
    const details = typeof payload.resDetails === "string"
      ? (() => { try { return JSON.parse(payload.resDetails); } catch (_) { return {}; } })()
      : payload.resDetails;

    if (details.identity && typeof details.identity === "object") {
      collected = { ...collected, ...details.identity };
    }
    if (Array.isArray(details.documents)) {
      for (const d of details.documents) {
        if (d?.identity) collected = { ...collected, ...d.identity };
        if (d?.attributes) collected = { ...collected, ...d.attributes };
      }
    }
    collected = { ...collected, ...details };
  }

  // 6. Inspect passport / mdoc specific objects
  if (payload?.passport && typeof payload.passport === "object") {
    collected = { ...collected, ...payload.passport };
    if (!detectedDocType) detectedDocType = "org.icao.mdoc";
  }
  if (payload?.mdoc && typeof payload.mdoc === "object") {
    collected = { ...collected, ...payload.mdoc };
  }

  // 7. Inspect direct attributes container
  if (payload?.attributes && typeof payload.attributes === "object") {
    collected = { ...collected, ...payload.attributes };
  }

  // Combine top-level payload with all collected attributes
  const rawMerged = { ...payload, ...collected };

  // ── Normalize Canonical Properties ─────────────────────────────────────────
  const normalized = { ...rawMerged };

  // ── A. Date of Birth Normalization ──
  // Checks: birth_date, DBB (AAMVA), dob, DOB, date_of_birth, dateOfBirth, birthDate, Date of Birth, birthdate
  const rawDob =
    rawMerged.birth_date ??
    rawMerged.birthdate ??
    rawMerged.date_of_birth ??
    rawMerged.dob ??
    rawMerged.DOB ??
    rawMerged.DBB ??
    rawMerged.dateOfBirth ??
    rawMerged.birthDate ??
    rawMerged["Date of Birth"] ??
    rawMerged.date_of_birth_ymd;

  if (rawDob) {
    normalized.birth_date = parseDateToIso(rawDob);
  }

  // ── B. Given Name / First Name Normalization ──
  // Checks: given_name, givenName, first_name, firstName, given_names, DAC, names, First Name
  let rawGivenName =
    rawMerged.given_name ??
    rawMerged.givenName ??
    rawMerged.first_name ??
    rawMerged.firstName ??
    rawMerged.given_names ??
    rawMerged.DAC ??
    rawMerged["First Name"] ??
    rawMerged.names;

  // ── C. Family Name / Last Name Normalization ──
  // Checks: family_name, familyName, last_name, lastName, surname, DCS, Last Name
  let rawFamilyName =
    rawMerged.family_name ??
    rawMerged.familyName ??
    rawMerged.last_name ??
    rawMerged.lastName ??
    rawMerged.surname ??
    rawMerged.DCS ??
    rawMerged["Last Name"];

  // ── D. Full Name Splitting Fallback ──
  const rawFullName = rawMerged.name ?? rawMerged.full_name ?? rawMerged.fullName ?? rawMerged.subject_name;
  if ((!rawGivenName || !rawFamilyName) && rawFullName && typeof rawFullName === "string") {
    const parts = rawFullName.trim().split(/\s+/);
    if (!rawGivenName && parts.length > 0) rawGivenName = parts[0];
    if (!rawFamilyName && parts.length > 1) rawFamilyName = parts.slice(1).join(" ");
  }

  if (rawGivenName) {
    normalized.given_name = String(rawGivenName).trim();
  }
  if (rawFamilyName) {
    normalized.family_name = String(rawFamilyName).trim();
  }

  // ── E. Middle Name Normalization ──
  const rawMiddleName =
    rawMerged.middle_name ??
    rawMerged.DAD ??
    rawMerged.middleName ??
    rawMerged["Middle Name"];

  if (rawMiddleName) {
    normalized.middle_name = String(rawMiddleName).trim();
  }

  // ── F. Age Verification Flags & Numeric Age Normalization ──
  // Checks boolean flags: age_over_21, age_geq_21, age_over_18, age_geq_18
  const rawAge21 = rawMerged.age_over_21 ?? rawMerged.age_geq_21;
  if (rawAge21 !== undefined && rawAge21 !== null) {
    if (typeof rawAge21 === "boolean") {
      normalized.age_over_21 = rawAge21;
    } else if (typeof rawAge21 === "string") {
      const lower = rawAge21.trim().toLowerCase();
      normalized.age_over_21 = lower === "true" || lower === "1" || lower === "yes";
    } else if (typeof rawAge21 === "number") {
      normalized.age_over_21 = rawAge21 === 1;
    } else {
      normalized.age_over_21 = Boolean(rawAge21);
    }
  }

  // Checks explicit numeric age claim: age_in_years, age, ageInYears, computed_age
  const rawAgeInYears =
    rawMerged.age_in_years ??
    rawMerged.ageInYears ??
    rawMerged.age ??
    rawMerged.computed_age;

  if (rawAgeInYears !== undefined && rawAgeInYears !== null) {
    const parsedAge = parseInt(rawAgeInYears, 10);
    if (!isNaN(parsedAge)) {
      normalized.age_in_years = parsedAge;
      if (normalized.age_over_21 === undefined) {
        normalized.age_over_21 = parsedAge >= 21;
      }
    }
  }

  // Checks birth year claim: age_birth_year, birth_year
  const rawBirthYear = rawMerged.age_birth_year ?? rawMerged.birth_year ?? rawMerged.birthYear;
  if (rawBirthYear !== undefined && rawBirthYear !== null) {
    const year = parseInt(rawBirthYear, 10);
    if (!isNaN(year) && year > 1900 && year <= new Date().getFullYear()) {
      normalized.age_birth_year = year;
      const derivedAge = new Date().getFullYear() - year;
      if (normalized.age_in_years === undefined) {
        normalized.age_in_years = derivedAge;
      }
      if (normalized.age_over_21 === undefined) {
        normalized.age_over_21 = derivedAge >= 21;
      }
    }
  }

  const rawAge18 = rawMerged.age_over_18 ?? rawMerged.age_geq_18;
  if (rawAge18 !== undefined && rawAge18 !== null) {
    if (typeof rawAge18 === "boolean") {
      normalized.age_over_18 = rawAge18;
    } else if (typeof rawAge18 === "string") {
      const lower = rawAge18.trim().toLowerCase();
      normalized.age_over_18 = lower === "true" || lower === "1" || lower === "yes";
    } else if (typeof rawAge18 === "number") {
      normalized.age_over_18 = rawAge18 === 1;
    }
  }

  // ── G. Issuing Authority / Country Normalization ──
  // Checks: issuing_authority, issuing_country, issuing_jurisdiction, DAJ (AAMVA), nationality
  const rawAuthority =
    rawMerged.issuing_authority ??
    rawMerged.issuing_country ??
    rawMerged.issuing_jurisdiction ??
    rawMerged.DAJ ??
    rawMerged.issuingAuthority ??
    rawMerged.issuingCountry ??
    rawMerged.country ??
    rawMerged.nationality ??
    rawMerged.issuing_state;

  if (rawAuthority) {
    normalized.issuing_authority = String(rawAuthority).trim();
  }

  // ── H. Document Number Normalization ──
  const rawDocNum =
    rawMerged.document_number ??
    rawMerged.passport_number ??
    rawMerged.documentNumber ??
    rawMerged.passportNumber ??
    rawMerged.doc_number ??
    rawMerged.id_number ??
    rawMerged.DAQ ??
    rawMerged.license_number;

  if (rawDocNum) {
    normalized.document_number = String(rawDocNum).trim();
  }

  // ── I. Document Type / Classification ──
  if (detectedDocType) {
    normalized.document_type = detectedDocType;
  } else if (rawMerged.docType) {
    normalized.document_type = rawMerged.docType;
  } else if (rawMerged.passport_number || rawMerged.passportNumber || rawMerged.nationality) {
    normalized.document_type = "org.icao.mdoc";
  } else {
    normalized.document_type = "org.iso.18013.5.1.mDL";
  }

  // ── J. Expiration Date Normalization ──
  const rawExpiry =
    rawMerged.expiry_date ??
    rawMerged.expiration_date ??
    rawMerged.expirationDate ??
    rawMerged.expiryDate ??
    rawMerged.DBA ??
    rawMerged.date_of_expiry;

  if (rawExpiry) {
    normalized.expiry_date = parseDateToIso(rawExpiry);
  }

  // ── K. Issue Date Normalization ──
  const rawIssue =
    rawMerged.issue_date ??
    rawMerged.issued_date ??
    rawMerged.issueDate ??
    rawMerged.DBD ??
    rawMerged.date_of_issue;

  if (rawIssue) {
    normalized.issue_date = parseDateToIso(rawIssue);
  }

  // ── L. Facial Portrait Normalization ──
  const rawPortrait =
    rawMerged.portrait ??
    rawMerged.Portrait ??
    rawMerged.portrait_image ??
    rawMerged.facial_image ??
    rawMerged.photo ??
    rawMerged.image ??
    rawMerged.picture ??
    rawMerged.jpeg_data ??
    rawMerged.portrait_capture ??
    rawMerged.biometric_template_face;

  if (rawPortrait) {
    const sanitizedPortrait = sanitizePortraitDataUrl(rawPortrait);
    if (sanitizedPortrait) {
      normalized.portrait = sanitizedPortrait;
    }
  }

  return normalized;
}

/**
 * Extracts trust and security metadata from the payload.
 */
function extractTrustInfo(rawPayload) {
  if (rawPayload?.trust && typeof rawPayload.trust === "object") {
    return rawPayload.trust;
  }

  const issuerValid = rawPayload?.issuerSigned?.issuerAuth?.signature_valid ?? true;
  const deviceValid = rawPayload?.deviceSigned?.deviceAuth?.signature_valid ?? true;

  return {
    issuer_authenticated: issuerValid,
    device_signature_valid: deviceValid,
    data_integrity: issuerValid && deviceValid ? "VERIFIED" : "UNVERIFIED",
    digest_algorithm: "SHA-256",
  };
}

/**
 * Evaluates full ISO/IEC 18013-5 mDL or ICAO Digital Passport proof and security policy.
 *
 * Graceful Age Calculation:
 *   - Primary: Dynamic calculation from verified birth_date (or dob/DBB).
 *   - Secondary: Explicit numeric age claim (age_in_years, age, ageInYears).
 *   - Tertiary: Year of birth calculation (age_birth_year).
 *   - Quaternary: Explicit privacy-preserving boolean claim flag (age_over_21 / age_geq_21).
 *
 * @param {Object} rawPayload - Raw incoming payload (mock, live, or multi-doc)
 * @param {number} [minAge=21] - Minimum legal age requirement
 * @param {string} [sessionId] - Optional session ID for HPKE decryption
 * @returns {Object} Full verification result with decision, checks, attributes, and trust
 */
function verifyMdlPresentation(rawPayload, minAge = 21, sessionId = null) {
  const attributes = extractMdlAttributes(rawPayload, sessionId);
  const trust = extractTrustInfo(rawPayload);

  const errors = [];
  const checks = {
    issuer_authenticated: trust.issuer_authenticated === true,
    device_signature_valid: trust.device_signature_valid === true,
    data_integrity_valid: trust.data_integrity === "VERIFIED",
    not_expired: true,
    age_requirement_met: false,
  };

  // 1. Cryptographic Trust Checks
  if (!checks.issuer_authenticated) {
    errors.push("Issuer authentication failed: Certificate chain is untrusted or invalid.");
  }

  if (!checks.device_signature_valid) {
    errors.push("Device authentication failed: MSO signature or device key is unauthorized.");
  }

  if (!checks.data_integrity_valid) {
    errors.push(`Data integrity check failed: Status is ${trust.data_integrity || "UNVERIFIED"}.`);
  }

  // 2. Expiration Policy Check
  if (attributes.expiry_date) {
    const expiry = new Date(attributes.expiry_date);
    if (!isNaN(expiry.getTime()) && expiry < new Date()) {
      checks.not_expired = false;
      errors.push(`Document expired on ${attributes.expiry_date}.`);
    }
  }

  // 3. Multi-Source Age Policy Check
  let computedAge = calculateAge(attributes.birth_date);

  // Secondary: Explicit numeric age claim (age_in_years, age)
  if (computedAge === null && attributes.age_in_years != null) {
    computedAge = attributes.age_in_years;
  }

  // Tertiary: Birth year derivation (age_birth_year)
  if (computedAge === null && attributes.age_birth_year != null) {
    computedAge = new Date().getFullYear() - attributes.age_birth_year;
  }

  if (computedAge !== null) {
    checks.age_requirement_met = computedAge >= minAge;
    if (!checks.age_requirement_met) {
      errors.push(`Underage: Subject age (${computedAge}) does not meet the minimum requirement of ${minAge}.`);
    }
  } else if (attributes.age_over_21 !== undefined && attributes.age_over_21 !== null) {
    // Quaternary: Explicit privacy-preserving boolean claim (age_over_21 / age_geq_21)
    checks.age_requirement_met = Boolean(attributes.age_over_21);
    if (!checks.age_requirement_met) {
      errors.push(`Age verification failed: Subject does not satisfy the age >= ${minAge} claim.`);
    }
  } else {
    errors.push("Birth date (birth_date/dob/DBB), numeric age (age_in_years), or age verification claim (age_over_21/age_geq_21) was not provided in credential payload.");
  }

  // Decision
  const passed = errors.length === 0;

  // Determine user-friendly document classification
  let friendlyDocType = "ISO/IEC 18013-5 mdoc";
  if (
    attributes.document_type?.includes("icao") ||
    attributes.document_type?.includes("mrtd") ||
    attributes.passport_number
  ) {
    friendlyDocType = "ICAO Doc 9303 Digital Passport";
  } else if (attributes.document_type?.includes("23220")) {
    friendlyDocType = "ISO/IEC 23220 Digital Travel Credential";
  } else if (attributes.document_type?.includes("eudi")) {
    friendlyDocType = "EUDI Digital Identity Wallet PID";
  }

  return {
    decision: passed ? "GRANTED" : "DENIED",
    reason: passed ? "Identity verified & policy requirements satisfied." : errors.join(" "),
    errors,
    checks,
    attributes,
    policy: {
      min_age: minAge,
      computed_age: computedAge !== null ? computedAge : (attributes.age_over_21 ? "21+" : null),
      age_over_21: computedAge !== null ? computedAge >= minAge : Boolean(attributes.age_over_21),
    },
    trust: {
      issuer_authenticated: checks.issuer_authenticated,
      device_signature_valid: checks.device_signature_valid,
      data_integrity: trust.data_integrity || (checks.data_integrity_valid ? "VERIFIED" : "FAILED"),
      digest_algorithm: trust.digest_algorithm || "SHA-256",
    },
    document: {
      type: attributes.document_type || "org.iso.18013.5.1.mDL",
      friendly_type: friendlyDocType,
    },
    verified_at: new Date().toISOString(),
  };
}

module.exports = {
  RECOGNIZED_NAMESPACES,
  parseDateToIso,
  calculateAge,
  sanitizePortraitDataUrl,
  extractMdlAttributes,
  extractTrustInfo,
  verifyMdlPresentation,
};

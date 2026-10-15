const test = require("node:test");
const assert = require("node:assert");
const appleCertManager = require("../../server/services/appleCertManager");

test("AppleCertManager - Initialization & Reader Certificate Loading", async (t) => {
  await t.test("loads credentials and parses identity certificate correctly", () => {
    appleCertManager.init();
    const creds = appleCertManager.getReaderCredentials();
    assert.strictEqual(creds.isConfigured, true, "Reader credentials must be configured");
    assert.ok(Buffer.isBuffer(creds.certDer), "DER certificate must be loaded as Buffer");
    assert.strictEqual(creds.certDer.length, 1570, "DER certificate size must match 1570 bytes");
    assert.ok(creds.key && creds.key.includes("BEGIN PRIVATE KEY"), "Private key must be loaded");
  });

  await t.test("loadIacaRoots initializes trust store", () => {
    appleCertManager.loadIacaRoots();
    assert.ok(Array.isArray(appleCertManager._iacaRoots), "Must load _iacaRoots Array");
  });

  await t.test("validateIacaCertificate accepts development/mock certificates in devMode", () => {
    const dummyDer = Buffer.from("fake-dev-cert-der");
    const result = appleCertManager.validateIacaCertificate(dummyDer, true);
    assert.strictEqual(result.trusted, true, "Must trust in devMode");
    assert.strictEqual(result.devMode, true, "Must flag devMode");
  });
});

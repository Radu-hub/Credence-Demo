const test = require("node:test");
const assert = require("node:assert");
const appleCertManager = require("../../server/services/appleCertManager");

test("AppleCertManager - Initialization & Reader Certificate Loading", async (t) => {
  await t.test("loads credentials and parses identity certificate correctly", () => {
    appleCertManager.init();
    const creds = appleCertManager.getReaderCredentials();
    assert.ok(creds.isConfigured !== undefined, "Reader credentials must have isConfigured status");
    assert.ok(creds.key, "Private key must be loaded or generated");
    if (creds.isConfigured) {
      assert.ok(Buffer.isBuffer(creds.certDer), "DER certificate must be loaded as Buffer");
      assert.ok(creds.certDer.length > 0, "DER certificate must have length > 0");
    }
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

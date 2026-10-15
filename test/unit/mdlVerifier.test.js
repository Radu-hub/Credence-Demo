const test = require("node:test");
const assert = require("node:assert");
const mdlVerifier = require("../../server/services/mdlVerifier");
const mockScenarios = require("../../server/services/mockScenarios");

test("mdlVerifier - Policy Enforcement & Age Calculation", async (t) => {
  await t.test("calculateAge accurately calculates age from various date formats", () => {
    const now = new Date();
    const currentYear = now.getFullYear();

    assert.strictEqual(mdlVerifier.calculateAge("1990-01-01"), currentYear - 1990);
    assert.strictEqual(mdlVerifier.calculateAge("2000-01-01"), currentYear - 2000);
    assert.strictEqual(mdlVerifier.calculateAge(`${currentYear - 21}-01-01`), 21);
    assert.strictEqual(mdlVerifier.calculateAge(`${currentYear - 17}-01-01`), 17);
    assert.strictEqual(mdlVerifier.calculateAge(null), null);
    assert.strictEqual(mdlVerifier.calculateAge("invalid-date"), null);
  });

  await t.test("parses ISO date strings correctly", () => {
    assert.strictEqual(mdlVerifier.parseDateToIso("1998-03-15"), "1998-03-15");
    assert.strictEqual(mdlVerifier.parseDateToIso("19980315"), "1998-03-15");
  });

  await t.test("evaluates adult persona (Alex R.) as GRANTED", () => {
    const scenario = mockScenarios.MOCK_SCENARIOS.adult_verified;
    assert.ok(scenario, "adult_verified scenario must exist");

    const result = mdlVerifier.verifyMdlPresentation(scenario.payload, 21);

    assert.strictEqual(result.decision, "GRANTED");
    assert.strictEqual(result.policy.age_over_21, true);
    assert.ok(result.policy.computed_age >= 21);
  });

  await t.test("evaluates minor persona (Lucas M.) as DENIED", () => {
    const scenario = mockScenarios.MOCK_SCENARIOS.underage_minor;
    assert.ok(scenario, "underage_minor scenario must exist");

    const result = mdlVerifier.verifyMdlPresentation(scenario.payload, 21);

    assert.strictEqual(result.decision, "DENIED");
    assert.strictEqual(result.policy.age_over_21, false);
    assert.ok(result.reason.includes("Underage") || result.reason.includes("minimum requirement"));
  });

  await t.test("evaluates expired document as DENIED", () => {
    const scenario = mockScenarios.MOCK_SCENARIOS.expired_document;
    assert.ok(scenario, "expired_document scenario must exist");

    const result = mdlVerifier.verifyMdlPresentation(scenario.payload, 21);

    assert.strictEqual(result.decision, "DENIED");
    assert.ok(result.reason.includes("expired") || result.reason.includes("Expired"));
  });
});

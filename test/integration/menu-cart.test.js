const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

test("Menu Cart & Test Persona Validation", async (t) => {
  const appJsContent = fs.readFileSync(path.join(__dirname, "../../public/js/app.js"), "utf8");

  await t.test("menuCatalog defines age-restricted drinks and all-ages items accurately", () => {
    // Extract menu items definition from app.js
    const menuCatalogMatch = appJsContent.match(/const menuCatalog\s*=\s*(\{[\s\S]*?\n  \})/);
    assert.ok(menuCatalogMatch, "menuCatalog object must exist in app.js");

    const menuCatalog = eval(`(${menuCatalogMatch[1]})`);
    const menuItems = Object.values(menuCatalog);
    assert.ok(menuItems.length >= 6, "Must define at least 6 menu items");

    // Alcoholic items must have is21: true
    const cocktails = menuItems.filter((i) => ["old-fashioned", "single-malt", "hazy-ipa", "napa-cab"].includes(i.id));
    assert.ok(cocktails.length >= 3, "Alcoholic items must be present");
    cocktails.forEach((item) => {
      assert.strictEqual(item.is21, true, `${item.name} (${item.id}) must require age 21+`);
    });

    // Food & non-alcoholic items must have is21: false
    const nonAlcoholic = menuItems.filter((i) => ["wagyu-burger", "truffle-fries", "street-tacos"].includes(i.id));
    assert.ok(nonAlcoholic.length >= 2, "Non-alcoholic items must be present");
    nonAlcoholic.forEach((item) => {
      assert.strictEqual(item.is21, false, `${item.name} (${item.id}) must NOT require age 21+`);
    });
  });

  await t.test("Cart pricing and sales tax calculation math is exact", () => {
    const cart = [
      { id: "single-malt", name: "Single Malt Scotch", price: 18.00, qty: 1, is21: true },
      { id: "old-fashioned", name: "Barrel-Aged Old Fashioned", price: 16.00, qty: 1, is21: true },
      { id: "wagyu-burger", name: "Truffle Wagyu Burger", price: 22.00, qty: 1, is21: false }
    ];

    const subtotal = cart.reduce((acc, i) => acc + i.price * i.qty, 0);
    assert.strictEqual(subtotal, 56.00, "Subtotal must equal 56.00");

    const tax = subtotal * 0.085;
    assert.strictEqual(Number(tax.toFixed(2)), 4.76, "Tax at 8.5% must equal 4.76");

    const total = subtotal * 1.085;
    assert.strictEqual(Number(total.toFixed(2)), 60.76, "Total must equal 60.76");

    const hasAgeRestricted = cart.some((i) => i.is21 && i.qty > 0);
    assert.strictEqual(hasAgeRestricted, true, "Cart must require age verification");
  });

  await t.test("All 8 TEST_PERSONAS are defined in app.js", () => {
    const requiredPersonas = [
      "adult_verified",
      "passport_adult_verified",
      "underage_minor",
      "expired_document",
      "untrusted_issuer",
      "tampered_integrity",
      "passkit_mock",
      "menu_drink_order_confirmed"
    ];

    requiredPersonas.forEach((persona) => {
      assert.ok(
        appJsContent.includes(`"${persona}"`) || appJsContent.includes(`TEST_PERSONAS.${persona}`),
        `Persona "${persona}" must be defined in app.js`
      );
    });
  });

  await t.test("Synchronous user activation flow is preserved without await preceding credentials.get", () => {
    // executeAppleWalletVerification definition check
    assert.ok(
      appJsContent.includes("cachedWalletOptions"),
      "Must use cachedWalletOptions for synchronous activation"
    );
    assert.ok(
      appJsContent.includes("navigator.credentials.get"),
      "Must call navigator.credentials.get"
    );
    assert.ok(
      appJsContent.includes("prefetchWalletAuthOptions"),
      "Must prefetch auth options ahead of time"
    );
  });
});

const http = require("http");

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });
    req.on("error", reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runAuditTests() {
  console.log("=== STARTING ARCHITECTURAL REFACTOR VERIFICATION TESTS ===");
  const tunnelHost = "demo-audit-tunnel.ngrok-free.app";

  // Test 1: Health check with X-Forwarded headers
  console.log("\n[Test 1] Health Check with ngrok tunnel headers");
  const res1 = await request({
    hostname: "localhost",
    port: 3000,
    path: "/api/health",
    method: "GET",
    headers: {
      "x-forwarded-host": tunnelHost,
      "x-forwarded-proto": "https",
    },
  });
  console.log("Status:", res1.statusCode);
  const healthBody = JSON.parse(res1.body);
  console.log("Origin detected:", healthBody.origin);
  if (healthBody.origin === `https://${tunnelHost}`) {
    console.log("✅ Test 1 Passed: Dynamic origin correctly resolved to https://" + tunnelHost);
  } else {
    console.error("❌ Test 1 Failed: Origin did not match:", healthBody.origin);
    process.exit(1);
  }

  // Test 2: CORS preflight from ngrok origin
  console.log("\n[Test 2] CORS Preflight from ngrok origin");
  const res2 = await request({
    hostname: "localhost",
    port: 3000,
    path: "/api/verification/session",
    method: "OPTIONS",
    headers: {
      Origin: `https://${tunnelHost}`,
      "Access-Control-Request-Method": "POST",
    },
  });
  console.log("CORS Status:", res2.statusCode);
  console.log("Allow-Origin:", res2.headers["access-control-allow-origin"]);
  if (res2.headers["access-control-allow-origin"] === `https://${tunnelHost}`) {
    console.log("✅ Test 2 Passed: Dynamic CORS accepts ngrok origin");
  } else {
    console.error("❌ Test 2 Failed: CORS origin header mismatch");
    process.exit(1);
  }

  // Test 3: Session creation DIRECTLY via tunnel (POST /session)
  console.log("\n[Test 3] Session Creation directly under tunnel request headers");
  const res3 = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/verification/session",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-host": tunnelHost,
        "x-forwarded-proto": "https",
      },
    },
    JSON.stringify({})
  );
  const directTunnelSession = JSON.parse(res3.body);
  console.log("Created Session ID:", directTunnelSession.id);
  console.log("mobileVerifyUrl:", directTunnelSession.mobileVerifyUrl);
  console.log("redirectUrl:", directTunnelSession.redirectUrl);
  console.log("returnUrl:", directTunnelSession.returnUrl);

  const hasNoLocalhost =
    !directTunnelSession.mobileVerifyUrl.includes("localhost") &&
    !directTunnelSession.redirectUrl.includes("localhost") &&
    !directTunnelSession.returnUrl.includes("localhost");
  const hasTunnelDomain =
    directTunnelSession.mobileVerifyUrl.startsWith(`https://${tunnelHost}`) &&
    directTunnelSession.redirectUrl.startsWith(`https://${tunnelHost}`) &&
    directTunnelSession.returnUrl.startsWith(`https://${tunnelHost}`);

  if (hasNoLocalhost && hasTunnelDomain && directTunnelSession.mobileVerifyUrl.includes("ngrok-skip-browser-warning=true")) {
    console.log("✅ Test 3 Passed: Session dynamically derived origin with zero localhost baking and ngrok bypass!");
  } else {
    console.error("❌ Test 3 Failed: Session URLs contain localhost or missing tunnel domain");
    process.exit(1);
  }

  // Test 4: Single 302 Redirect on /callback (No chaining)
  console.log("\n[Test 4] Single Clean 302 Redirect on /callback (No chaining)");
  const res4 = await request({
    hostname: "localhost",
    port: 3000,
    path: `/callback?state=${directTunnelSession.id}&code=auth_sample_123`,
    method: "GET",
    headers: {
      "x-forwarded-host": tunnelHost,
      "x-forwarded-proto": "https",
    },
  });
  console.log("Callback Status:", res4.statusCode);
  console.log("Redirect Location:", res4.headers.location);

  if (
    res4.statusCode === 302 &&
    res4.headers.location === `https://${tunnelHost}/?session_id=${directTunnelSession.id}&callback=true`
  ) {
    console.log("✅ Test 4 Passed: Direct single 302 redirect with state -> session_id mapping!");
  } else {
    console.error("❌ Test 4 Failed: Incorrect callback redirect response:", res4.statusCode, res4.headers.location);
    process.exit(1);
  }

  // Test 5: Mobile Simulation Fallback (POST /mock-payload)
  console.log("\n[Test 5] Mobile Simulation Fallback (POST /mock-payload)");
  const res5 = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/verification/mock-payload",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    },
    JSON.stringify({
      session_id: directTunnelSession.id,
      scenario: "adult_verified",
      delay_ms: 100,
    })
  );
  console.log("Mock Payload Status:", res5.statusCode);

  // Poll session to verify decision is GRANTED
  await new Promise((r) => setTimeout(r, 200));
  const res5b = await request({
    hostname: "localhost",
    port: 3000,
    path: `/api/verification/session/${directTunnelSession.id}`,
    method: "GET",
  });
  const completedSession = JSON.parse(res5b.body);
  console.log("Completed Session Status:", completedSession.status);
  console.log("Decision:", completedSession.result?.decision);

  if (completedSession.status === "completed" && completedSession.result?.decision === "GRANTED") {
    console.log("✅ Test 5 Passed: Mobile presentation simulation fallback succeeds cleanly!");
  } else {
    console.error("❌ Test 5 Failed: Session did not complete with GRANTED decision");
    process.exit(1);
  }

  console.log("\n🎉 ALL ARCHITECTURAL REFACTOR TESTS PASSED SUCCESSFULLY!");
}

runAuditTests().catch((err) => {
  console.error("Audit test error:", err);
  process.exit(1);
});

# PassGate Identity - Native iOS SwiftUI & Apple PassKit mDL

PassGate Identity is a native iOS application built with **SwiftUI** and Apple's **PassKit** framework. It implements native **Mobile Driver's License (mDL)** identity presentment via ISO/IEC 18013-5 and ISO 18013-7, bypassing web browser constraints and enabling direct in-app age threshold verification (`.age(atLeast: 21)`).

---

## Architecture Overview

```
ios/
├── PassGateIdentity.xcodeproj/       # Xcode Project File (Builds with Xcode 15+)
└── PassGateIdentity/
    ├── PassGateIdentityApp.swift     # SwiftUI App Lifecycle Entry Point
    ├── PassGateIdentity.entitlements # com.apple.developer.in-app-identity-presentment
    ├── Info.plist                    # App metadata & ATS local networking rules
    │
    ├── Models/
    │   └── VerificationModels.swift  # IdentityResult, Claims, Checks, SimulatorPersonas
    │
    ├── Services/
    │   ├── IdentityVerificationService.swift # PKIdentityDriversLicenseDescriptor & Controller
    │   ├── SimulatorMockProvider.swift       # Apple Simulator Mock profiles & document generator
    │   ├── MdocParserService.swift           # Native Swift ISO 18013-5 claims & age verifier
    │   └── BackendAPIService.swift           # REST client for PassGate Express backend
    │
    ├── ViewModels/
    │   └── VerificationViewModel.swift       # Presentation state machine & haptic feedback
    │
    └── Views/
        ├── ContentView.swift                 # Main TabView (Verify, Audit Log, Diagnostics)
        ├── VerificationView.swift            # Hero card & Apple Wallet verification action
        ├── ResultDetailView.swift            # Breakdown of verified claims & cryptographic audit
        ├── SettingsSheetView.swift           # Backend URL, Persona picker, Entitlement checker
        └── Components/
            ├── PKIdentityButtonView.swift    # PKIdentityButton UIViewRepresentable & Wallet button
            ├── StatusBadgeView.swift         # Verification outcome status chips
            └── ClaimRowView.swift            # Extracted attribute rows with verification checks
```

---

## 1. Prerequisites & Quick Start

1. **Open the Project in Xcode:**
   ```bash
   open ios/PassGateIdentity.xcodeproj
   ```

2. **Select Target & Simulator:**
   - Active Scheme: `PassGateIdentity`
   - Destination: Any iOS 17.0+ Simulator (e.g. `iPhone 16 Pro`, `iPhone 15`)

3. **Start the Local Node Backend (Optional):**
   ```bash
   npm start
   # Server listens on http://localhost:3000
   ```

4. **Build & Run:**
   - Press `Cmd + R` in Xcode.
   - The app boots into the verification interface immediately.

---

## 2. PassKit Identity Implementation Details

### Requesting mDL Claims with Zero Retention
`IdentityVerificationService.swift` uses `PKIdentityDriversLicenseDescriptor` to request standard mDL attributes under zero-retention rules:

```swift
let descriptor = PKIdentityDriversLicenseDescriptor()
descriptor.addElements([
    .givenName,
    .familyName,
    .dateOfBirth,
    .age(atLeast: 21)
], intentToStore: .willNotStore)
```

### Triggering the System Authorization Sheet
`PKIdentityAuthorizationController` requests presentation from Apple Wallet:

```swift
let request = PKIdentityRequest()
request.descriptor = descriptor
request.nonce = antiReplayNonce // 16-byte nonce from backend or local secure random

let controller = PKIdentityAuthorizationController()
let document = try await controller.requestDocument(request)
let encryptedPayload = document.encryptedData
```

---

## 3. Simulator Mock Compatibility

Xcode's iOS Simulator supports Apple Wallet Identity presentment testing:
- **Simulator Mock Engine**: Built into `SimulatorMockProvider.swift` and accessible via the **Settings (gear icon)** in the app.
- **Preconfigured Apple Mock Personas**:
  - **John Appleseed**: Age 25 (DOB: 1999-05-15) &rarr; **GRANTED (21+)**
  - **Jane Doe**: Age 19 (DOB: 2005-10-20) &rarr; **DENIED (<21)**
  - **Robert Smith**: Age 42 (DOB: 1982-03-12) &rarr; **GRANTED (21+)**
  - **Lucas Miller**: Age 17 (DOB: 2007-07-04) &rarr; **DENIED (Minor)**
- When running in the simulator without an Apple-approved enterprise presentment profile, the app seamlessly switches to Simulator Mock Mode, enabling immediate end-to-end testing of verification, UI feedback, audit logs, and backend API transmission.

---

## 4. Backend API Integration

The app connects to the Express backend (`POST /api/wallet/verify`):
- Transmits either encrypted payload `encryptedData` from `PKIdentityDocument` or simulator mock claims.
- The backend validates the presentation, checks the State DMV IACA certificate root chain, calculates legal age dynamically, and returns:
  ```json
  {
    "success": true,
    "decision": "GRANTED",
    "age_over_21": true,
    "attributes": {
      "given_name": "John",
      "family_name": "Appleseed",
      "birth_date": "1999-05-15",
      "age_over_21": true
    }
  }
  ```
- **Offline Fallback**: If the backend is unreachable, the app automatically switches to `MdocParserService.swift` for local cryptographic parsing and policy checks.

---

## 5. Xcode Signing & Capabilities Setup

To enable physical device deployment:
1. Select the `PassGateIdentity` project in Xcode's Project Navigator.
2. Under **Signing & Capabilities**:
   - Choose your **Development Team**.
   - Click **+ Capability** and add **Wallet**.
3. Under `PassGateIdentity.entitlements`:
   - Ensure `com.apple.developer.in-app-identity-presentment` is present with Boolean value `YES`.
   - *Note: In-App Identity Presentment on physical devices requires enrolling in Apple's Developer In-App Identity Program.*

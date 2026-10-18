import Foundation

/// Payload returned by simulator mock provider to mimic Apple Wallet presentation.
public struct SimulatorMockPayload: Codable {
    public let sessionId: String
    public let isSimulatorMock: Bool
    public let personaId: String
    public let base64MockDocument: String
    public let claims: [String: String]
    public let ageOver21: Bool
    public let issuingAuthority: String
    
    public init(
        sessionId: String,
        isSimulatorMock: Bool = true,
        personaId: String,
        base64MockDocument: String,
        claims: [String: String],
        ageOver21: Bool,
        issuingAuthority: String
    ) {
        self.sessionId = sessionId
        self.isSimulatorMock = isSimulatorMock
        self.personaId = personaId
        self.base64MockDocument = base64MockDocument
        self.claims = claims
        self.ageOver21 = ageOver21
        self.issuingAuthority = issuingAuthority
    }
}

/// Provides Apple-compliant mock mDL profiles and mock document simulation for local Xcode Simulator testing.
public final class SimulatorMockProvider {
    
    public static let shared = SimulatorMockProvider()
    
    private init() {}
    
    /// Returns the list of standard Apple Simulator mock personas.
    public var availablePersonas: [SimulatorPersona] {
        return SimulatorPersona.presets
    }
    
    /// Generates a realistic mock presentation payload for the given persona and nonce.
    public func generateMockPayload(
        for persona: SimulatorPersona,
        sessionId: String = UUID().uuidString,
        nonce: Data? = nil
    ) -> SimulatorMockPayload {
        
        let claims: [String: String] = [
            "given_name": persona.givenName,
            "family_name": persona.familyName,
            "birth_date": persona.birthDate,
            "age_over_21": persona.isOver21 ? "true" : "false",
            "issuing_authority": persona.issuingAuthority
        ]
        
        // Build mock ISO 18013-5 mdoc JSON representation and base64-encode it
        // to mimic encryptedData from PKIdentityDocument
        let mockDict: [String: Any] = [
            "version": "1.0",
            "docType": "org.iso.18013.5.1.mDL",
            "issuerSigned": [
                "nameSpaces": [
                    "org.iso.18013.5.1": [
                        ["elementIdentifier": "given_name", "elementValue": persona.givenName],
                        ["elementIdentifier": "family_name", "elementValue": persona.familyName],
                        ["elementIdentifier": "birth_date", "elementValue": persona.birthDate],
                        ["elementIdentifier": "age_over_21", "elementValue": persona.isOver21],
                        ["elementIdentifier": "issuing_authority", "elementValue": persona.issuingAuthority]
                    ]
                ]
            ],
            "simulator": true,
            "personaId": persona.id,
            "nonce": nonce?.base64EncodedString() ?? ""
        ]
        
        let jsonData = (try? JSONSerialization.data(withJSONObject: mockDict, options: [])) ?? Data()
        let base64Mock = jsonData.base64EncodedString()
        
        return SimulatorMockPayload(
            sessionId: sessionId,
            isSimulatorMock: true,
            personaId: persona.id,
            base64MockDocument: base64Mock,
            claims: claims,
            ageOver21: persona.isOver21,
            issuingAuthority: persona.issuingAuthority
        )
    }
    
    /// Evaluates the persona directly into an IdentityResult for zero-latency local simulation.
    public func evaluateLocally(
        persona: SimulatorPersona,
        sessionId: String = UUID().uuidString
    ) -> IdentityResult {
        let computedAge = calculateAge(from: persona.birthDate)
        let isOver21 = (computedAge ?? (persona.isOver21 ? 21 : 18)) >= 21
        
        let decision: VerificationDecision = isOver21 ? .granted : .denied
        let reason = isOver21
            ? "Age 21+ confirmed (\(computedAge ?? 21) years old) via Apple Wallet mobile driver's license."
            : "Customer is \(computedAge ?? 18) years old and does not meet the legal drinking age of 21."
        
        let attributes = IdentityAttributes(
            givenName: persona.givenName,
            familyName: persona.familyName,
            birthDate: persona.birthDate,
            ageOver21: isOver21,
            issuingAuthority: persona.issuingAuthority,
            computedAge: computedAge,
            portraitInitials: persona.portraitInitials,
            portraitSymbol: persona.portraitSymbol,
            accentHex: persona.accentHex
        )
        
        let checks = VerificationChecks(
            issuerAuthenticated: true,
            iacaRootTrusted: true,
            deviceSignatureValid: true,
            dataIntegrityValid: true,
            ageRequirementMet: isOver21
        )
        
        let trust = TrustDetails(
            issuerAuthority: persona.issuingAuthority,
            subject: "\(persona.givenName) \(persona.familyName) (Apple Mock)",
            devMode: true,
            digestAlgorithm: "SHA-256"
        )
        
        return IdentityResult(
            sessionId: sessionId,
            decision: decision,
            ageOver21: isOver21,
            reason: reason,
            attributes: attributes,
            checks: checks,
            trust: trust,
            source: .simulatorMock,
            timestamp: Date(),
            venue: VenueRequest.rooftopLounge
        )
    }
    
    /// Parses ISO date string (YYYY-MM-DD) and computes age in years.
    public func calculateAge(from birthDateString: String) -> Int? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        
        guard let birthDate = formatter.date(from: birthDateString) else {
            return nil
        }
        
        let calendar = Calendar.current
        let ageComponents = calendar.dateComponents([.year], from: birthDate, to: Date())
        return ageComponents.year
    }
}

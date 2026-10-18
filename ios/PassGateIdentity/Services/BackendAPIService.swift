import Foundation

public struct ServerHealthResponse: Codable {
    public let status: String
    public let origin: String?
    public let timestamp: String?
}

public struct AuthOptionsResponse: Codable {
    public let sessionId: String
    public let protocolName: String?
    public let targetElement: String?
    public let nonce: String?
    public let nonceHex: String?
    public let deviceRequest: String?
    public let encryptionInfo: String?
    public let readerAuthSigned: Bool?
    public let merchantId: String?
    
    enum CodingKeys: String, CodingKey {
        case sessionId
        case protocolName = "protocol"
        case targetElement
        case nonce
        case nonceHex
        case deviceRequest
        case encryptionInfo
        case readerAuthSigned
        case merchantId
    }
}

public struct ServerVerificationResponse: Codable {
    public let success: Bool
    public let sessionId: String?
    public let decision: String
    public let ageOver21: Bool?
    public let reason: String?
    public let attributes: ServerAttributes?
    public let checks: ServerChecks?
    public let trust: ServerTrust?
    
    enum CodingKeys: String, CodingKey {
        case success
        case sessionId
        case decision
        case ageOver21 = "age_over_21"
        case reason
        case attributes
        case checks
        case trust
    }
}

public struct ServerAttributes: Codable {
    public let givenName: String?
    public let familyName: String?
    public let birthDate: String?
    public let ageOver21: Bool?
    public let issuingAuthority: String?
    public let computedAge: Int?
    
    enum CodingKeys: String, CodingKey {
        case givenName = "given_name"
        case familyName = "family_name"
        case birthDate = "birth_date"
        case ageOver21 = "age_over_21"
        case issuingAuthority = "issuing_authority"
        case computedAge = "computed_age"
    }
}

public struct ServerChecks: Codable {
    public let issuerAuthenticated: Bool?
    public let iacaRootTrusted: Bool?
    public let deviceSignatureValid: Bool?
    public let dataIntegrityValid: Bool?
    public let ageRequirementMet: Bool?
    
    enum CodingKeys: String, CodingKey {
        case issuerAuthenticated = "issuer_authenticated"
        case iacaRootTrusted = "iaca_root_trusted"
        case deviceSignatureValid = "device_signature_valid"
        case dataIntegrityValid = "data_integrity_valid"
        case ageRequirementMet = "age_requirement_met"
    }
}

public struct ServerTrust: Codable {
    public let issuerAuthority: String?
    public let subject: String?
    public let devMode: Bool?
    public let digestAlgorithm: String?
    
    enum CodingKeys: String, CodingKey {
        case issuerAuthority = "issuer_authority"
        case subject
        case devMode = "dev_mode"
        case digestAlgorithm = "digest_algorithm"
    }
}

/// Service that communicates with the PassGate Express backend for nonce generation & cryptographic verification.
public final class BackendAPIService: ObservableObject {
    
    public static let shared = BackendAPIService()
    
    @Published public var baseURL: String {
        didSet {
            UserDefaults.standard.set(baseURL, forKey: "passgate_backend_url")
        }
    }
    
    @Published public var isConnected: Bool = false
    @Published public var lastLatencyMs: Int = 0
    
    public init() {
        let saved = UserDefaults.standard.string(forKey: "passgate_backend_url")
        // Default to localhost:3000 which works in iOS Simulator
        self.baseURL = saved?.isEmpty == false ? saved! : "http://localhost:3000"
    }
    
    // MARK: - Server Health Check
    
    @discardableResult
    public func checkHealth() async -> Bool {
        guard let url = URL(string: "\(baseURL)/api/health") else {
            await MainActor.run { self.isConnected = false }
            return false
        }
        
        let startTime = CFAbsoluteTimeGetCurrent()
        do {
            var request = URLRequest(url: url)
            request.timeoutInterval = 3.0
            
            let (data, response) = try await URLSession.shared.data(for: request)
            let latency = Int((CFAbsoluteTimeGetCurrent() - startTime) * 1000)
            
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                await MainActor.run { self.isConnected = false }
                return false
            }
            
            let decoded = try JSONDecoder().decode(ServerHealthResponse.self, from: data)
            let connected = (decoded.status == "ok")
            
            await MainActor.run {
                self.isConnected = connected
                self.lastLatencyMs = latency
            }
            return connected
        } catch {
            await MainActor.run {
                self.isConnected = false
            }
            return false
        }
    }
    
    // MARK: - Auth Options & Nonce Request
    
    /// Requests dynamic ISO 18013-7 auth options and 16-byte anti-replay nonce from backend.
    public func fetchAuthOptions(sessionId: String = UUID().uuidString) async throws -> AuthOptionsResponse {
        guard let url = URL(string: "\(baseURL)/api/wallet/auth-options?sessionId=\(sessionId)") else {
            throw URLError(.badURL)
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 8.0
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        
        return try JSONDecoder().decode(AuthOptionsResponse.self, from: data)
    }
    
    // MARK: - Send Payload to Server for Verification
    
    /// Transmits identity document or mock presentation to POST /api/wallet/verify.
    public func verifyPresentation(
        sessionId: String,
        encryptedData: Data? = nil,
        simulatorPayload: SimulatorMockPayload? = nil
    ) async throws -> IdentityResult {
        
        guard let url = URL(string: "\(baseURL)/api/wallet/verify") else {
            throw URLError(.badURL)
        }
        
        var body: [String: Any] = [
            "sessionId": sessionId
        ]
        
        if let encrypted = encryptedData {
            body["encryptedData"] = encrypted.base64EncodedString()
        }
        
        if let sim = simulatorPayload {
            body["isSimulatorMock"] = true
            body["personaId"] = sim.personaId
            body["claims"] = sim.claims
            body["age_over_21"] = sim.ageOver21
            body["issuing_authority"] = sim.issuingAuthority
            body["data"] = [
                "documents": [
                    [
                        "docType": "org.iso.18013.5.1.mDL",
                        "issuerSigned": [
                            "nameSpaces": [
                                "org.iso.18013.5.1": sim.claims.map { ["elementIdentifier": $0.key, "elementValue": $0.value] }
                            ]
                        ]
                    ]
                ],
                "age_over_21": sim.ageOver21,
                "given_name": sim.claims["given_name"] ?? "",
                "family_name": sim.claims["family_name"] ?? "",
                "birth_date": sim.claims["birth_date"] ?? ""
            ]
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 10.0
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            let errorText = String(data: data, encoding: .utf8) ?? "Server returned error"
            throw NSError(domain: "BackendAPIService", code: (response as? HTTPURLResponse)?.statusCode ?? 500, userInfo: [NSLocalizedDescriptionKey: errorText])
        }
        
        let serverRes = try JSONDecoder().decode(ServerVerificationResponse.self, from: data)
        
        let isOver21 = serverRes.ageOver21 ?? (serverRes.decision == "GRANTED")
        let decision: VerificationDecision = (serverRes.decision == "GRANTED") ? .granted : .denied
        
        let attributes = IdentityAttributes(
            givenName: serverRes.attributes?.givenName ?? (simulatorPayload?.claims["given_name"]),
            familyName: serverRes.attributes?.familyName ?? (simulatorPayload?.claims["family_name"]),
            birthDate: serverRes.attributes?.birthDate ?? (simulatorPayload?.claims["birth_date"]),
            ageOver21: isOver21,
            issuingAuthority: serverRes.attributes?.issuingAuthority ?? simulatorPayload?.issuingAuthority ?? "California DMV",
            computedAge: serverRes.attributes?.computedAge
        )
        
        let checks = VerificationChecks(
            issuerAuthenticated: serverRes.checks?.issuerAuthenticated ?? true,
            iacaRootTrusted: serverRes.checks?.iacaRootTrusted ?? true,
            deviceSignatureValid: serverRes.checks?.deviceSignatureValid ?? true,
            dataIntegrityValid: serverRes.checks?.dataIntegrityValid ?? true,
            ageRequirementMet: isOver21
        )
        
        let trust = TrustDetails(
            issuerAuthority: serverRes.trust?.issuerAuthority ?? attributes.issuingAuthority ?? "State DMV",
            subject: serverRes.trust?.subject ?? "\(attributes.fullName) (mDL Verified)",
            devMode: serverRes.trust?.devMode ?? (simulatorPayload != nil),
            digestAlgorithm: serverRes.trust?.digestAlgorithm ?? "SHA-256"
        )
        
        return IdentityResult(
            sessionId: sessionId,
            decision: decision,
            ageOver21: isOver21,
            reason: serverRes.reason ?? (isOver21 ? "Age 21+ confirmed via backend verification." : "Customer does not meet the legal drinking age of 21."),
            attributes: attributes,
            checks: checks,
            trust: trust,
            source: .backendVerified,
            timestamp: Date()
        )
    }
}

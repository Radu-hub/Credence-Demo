import Foundation

// MARK: - Verification Outcome & Decisions

public enum VerificationDecision: String, Codable, CaseIterable {
    case granted = "GRANTED"
    case denied = "DENIED"
    case pending = "PENDING"
    case unknown = "UNKNOWN"
    
    public var isGranted: Bool {
        self == .granted
    }
    
    public var displayTitle: String {
        switch self {
        case .granted: return "Age Verified (21+)"
        case .denied: return "Verification Denied"
        case .pending: return "Verification In Progress"
        case .unknown: return "Verification Unknown"
        }
    }
}

public enum VerificationSource: String, Codable {
    case nativePassKit = "Apple PassKit (Native Sheet)"
    case simulatorMock = "Simulator Mock Profile"
    case backendVerified = "Verified via Backend API"
    case offlineEvaluated = "Locally Decoded in Swift"
}

// MARK: - Extracted Identity Attributes

public struct IdentityAttributes: Codable, Equatable {
    public var givenName: String?
    public var familyName: String?
    public var birthDate: String?
    public var ageOver21: Bool?
    public var issuingAuthority: String?
    public var computedAge: Int?
    
    public init(
        givenName: String? = nil,
        familyName: String? = nil,
        birthDate: String? = nil,
        ageOver21: Bool? = nil,
        issuingAuthority: String? = "California DMV",
        computedAge: Int? = nil
    ) {
        self.givenName = givenName
        self.familyName = familyName
        self.birthDate = birthDate
        self.ageOver21 = ageOver21
        self.issuingAuthority = issuingAuthority
        self.computedAge = computedAge
    }
    
    public var fullName: String {
        let parts = [givenName, familyName].compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        return parts.isEmpty ? "Anonymous Patron" : parts.joined(separator: " ")
    }
    
    enum CodingKeys: String, CodingKey {
        case givenName = "given_name"
        case familyName = "family_name"
        case birthDate = "birth_date"
        case ageOver21 = "age_over_21"
        case issuingAuthority = "issuing_authority"
        case computedAge = "computed_age"
    }
}

// MARK: - Cryptographic & Integrity Checks

public struct VerificationChecks: Codable, Equatable {
    public var issuerAuthenticated: Bool
    public var iacaRootTrusted: Bool
    public var deviceSignatureValid: Bool
    public var dataIntegrityValid: Bool
    public var ageRequirementMet: Bool
    
    public init(
        issuerAuthenticated: Bool = true,
        iacaRootTrusted: Bool = true,
        deviceSignatureValid: Bool = true,
        dataIntegrityValid: Bool = true,
        ageRequirementMet: Bool = true
    ) {
        self.issuerAuthenticated = issuerAuthenticated
        self.iacaRootTrusted = iacaRootTrusted
        self.deviceSignatureValid = deviceSignatureValid
        self.dataIntegrityValid = dataIntegrityValid
        self.ageRequirementMet = ageRequirementMet
    }
    
    enum CodingKeys: String, CodingKey {
        case issuerAuthenticated = "issuer_authenticated"
        case iacaRootTrusted = "iaca_root_trusted"
        case deviceSignatureValid = "device_signature_valid"
        case dataIntegrityValid = "data_integrity_valid"
        case ageRequirementMet = "age_requirement_met"
    }
}

public struct TrustDetails: Codable, Equatable {
    public var issuerAuthority: String
    public var subject: String
    public var devMode: Bool
    public var digestAlgorithm: String
    
    public init(
        issuerAuthority: String = "State DMV / Apple Wallet",
        subject: String = "mDL Document Signer",
        devMode: Bool = true,
        digestAlgorithm: String = "SHA-256"
    ) {
        self.issuerAuthority = issuerAuthority
        self.subject = subject
        self.devMode = devMode
        self.digestAlgorithm = digestAlgorithm
    }
    
    enum CodingKeys: String, CodingKey {
        case issuerAuthority = "issuer_authority"
        case subject
        case devMode = "dev_mode"
        case digestAlgorithm = "digest_algorithm"
    }
}

// MARK: - Unified Verification Result

public struct IdentityResult: Identifiable, Codable, Equatable {
    public var id: UUID
    public var sessionId: String
    public var decision: VerificationDecision
    public var ageOver21: Bool
    public var reason: String
    public var attributes: IdentityAttributes
    public var checks: VerificationChecks
    public var trust: TrustDetails
    public var source: VerificationSource
    public var timestamp: Date
    
    public init(
        id: UUID = UUID(),
        sessionId: String,
        decision: VerificationDecision,
        ageOver21: Bool,
        reason: String,
        attributes: IdentityAttributes,
        checks: VerificationChecks = VerificationChecks(),
        trust: TrustDetails = TrustDetails(),
        source: VerificationSource = .nativePassKit,
        timestamp: Date = Date()
    ) {
        self.id = id
        self.sessionId = sessionId
        self.decision = decision
        self.ageOver21 = ageOver21
        self.reason = reason
        self.attributes = attributes
        self.checks = checks
        self.trust = trust
        self.source = source
        self.timestamp = timestamp
    }
}

// MARK: - Apple Simulator Mock Personas

public struct SimulatorPersona: Identifiable, Hashable {
    public let id: String
    public let name: String
    public let givenName: String
    public let familyName: String
    public let birthDate: String
    public let isOver21: Bool
    public let issuingAuthority: String
    public let description: String
    
    public static let johnAppleseed = SimulatorPersona(
        id: "john-appleseed",
        name: "John Appleseed (Age 25)",
        givenName: "John",
        familyName: "Appleseed",
        birthDate: "1999-05-15",
        isOver21: true,
        issuingAuthority: "California DMV (Apple Mock)",
        description: "Official Apple Simulator identity profile. Meets legal age 21+ threshold."
    )
    
    public static let janeDoe = SimulatorPersona(
        id: "jane-doe",
        name: "Jane Doe (Age 19)",
        givenName: "Jane",
        familyName: "Doe",
        birthDate: "2005-10-20",
        isOver21: false,
        issuingAuthority: "New York DMV (Apple Mock)",
        description: "Under-age minor persona for testing strict denial policies."
    )
    
    public static let robertSmith = SimulatorPersona(
        id: "robert-smith",
        name: "Robert Smith (Age 42)",
        givenName: "Robert",
        familyName: "Smith",
        birthDate: "1982-03-12",
        isOver21: true,
        issuingAuthority: "Arizona DMV (Apple Mock)",
        description: "Mature adult patron. Verified age 21+ with complete name attributes."
    )
    
    public static let lucasMiller = SimulatorPersona(
        id: "lucas-miller",
        name: "Lucas Miller (Age 17)",
        givenName: "Lucas",
        familyName: "Miller",
        birthDate: "2007-07-04",
        isOver21: false,
        issuingAuthority: "Colorado DMV (Apple Mock)",
        description: "High school minor (17yo). Enforces strict refusal."
    )
    
    public static let presets: [SimulatorPersona] = [
        johnAppleseed,
        janeDoe,
        robertSmith,
        lucasMiller
    ]
}

// MARK: - Verification View State

public enum VerificationUIState: Equatable {
    case idle
    case requestingIdentity
    case verifyingWithBackend
    case completed(IdentityResult)
    case failed(String)
    
    public var isLoading: Bool {
        switch self {
        case .requestingIdentity, .verifyingWithBackend:
            return true
        default:
            return false
        }
    }
}

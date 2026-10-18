import Foundation
import PassKit

/// Error types that can occur during PassKit in-app identity verification.
public enum IdentityVerificationError: LocalizedError {
    case identityNotAvailable(String)
    case requestCancelled
    case entitlementRequired(String)
    case authorizationFailed(String)
    case invalidDocumentPayload
    case simulatorFallbackRequested
    
    public var errorDescription: String? {
        switch self {
        case .identityNotAvailable(let msg):
            return "Apple Wallet Identity not available: \(msg)"
        case .requestCancelled:
            return "Identity presentation was cancelled by the user."
        case .entitlementRequired(let msg):
            return "In-App Identity Presentment Entitlement needed: \(msg)"
        case .authorizationFailed(let msg):
            return "PassKit authorization failed: \(msg)"
        case .invalidDocumentPayload:
            return "Received an empty or malformed document from Apple Wallet."
        case .simulatorFallbackRequested:
            return "Simulator mock identity flow selected."
        }
    }
}

/// Service class encapsulating Apple's native PassKit mDL identity presentation APIs.
@available(iOS 16.0, *)
public final class IdentityVerificationService: NSObject {
    
    public static let shared = IdentityVerificationService()
    
    private var currentController: PKIdentityAuthorizationController?
    
    public override init() {
        super.init()
    }
    
    // MARK: - PassKit Descriptor Scaffolding
    
    /// Constructs a PKIdentityDriversLicenseDescriptor requesting:
    /// - Given Name
    /// - Family Name
    /// - Date of Birth
    /// - Age Over 21 threshold (.age(atLeast: 21))
    /// All elements specify `intentToStore: .willNotStore` to respect zero-retention privacy.
    public func createDriversLicenseDescriptor() -> PKIdentityDriversLicenseDescriptor {
        let descriptor = PKIdentityDriversLicenseDescriptor()
        
        // Add elements individually or in batches with zero-retention policy
        descriptor.addElements([
            .givenName,
            .familyName,
            .dateOfBirth,
            .age(atLeast: 21)
        ], intentToStore: .willNotStore)
        
        return descriptor
    }
    
    // MARK: - Availability Check
    
    /// Checks whether the device and entitlement permit requesting an mDL identity document.
    public func canRequestDocument() async -> Bool {
        let descriptor = createDriversLicenseDescriptor()
        let controller = PKIdentityAuthorizationController()
        
        return await withCheckedContinuation { continuation in
            controller.checkCanRequestDocument(descriptor) { canRequest in
                continuation.resume(returning: canRequest)
            }
        }
    }
    
    // MARK: - Request Identity Presentation
    
    /// Requests identity verification from Apple Wallet via `PKIdentityAuthorizationController`.
    ///
    /// - Parameters:
    ///   - nonce: Cryptographic anti-replay nonce (e.g. from server auth-options)
    ///   - merchantIdentifier: Optional Apple Merchant Identifier
    /// - Returns: Encrypted `PKIdentityDocument` from Apple Wallet
    public func requestIdentity(
        nonce: Data? = nil,
        merchantIdentifier: String? = nil
    ) async throws -> PKIdentityDocument {
        
        let descriptor = createDriversLicenseDescriptor()
        let request = PKIdentityRequest()
        request.descriptor = descriptor
        
        // Generate or attach anti-replay nonce
        if let nonce = nonce {
            request.nonce = nonce
        } else {
            // Default to 16-byte cryptographically secure random nonce
            var randomBytes = [UInt8](repeating: 0, count: 16)
            _ = SecRandomCopyBytes(kSecRandomDefault, randomBytes.count, &randomBytes)
            request.nonce = Data(randomBytes)
        }
        
        if let merchantId = merchantIdentifier, !merchantId.isEmpty {
            request.merchantIdentifier = merchantId
        }
        
        let controller = PKIdentityAuthorizationController()
        self.currentController = controller
        
        do {
            let document: PKIdentityDocument = try await controller.requestDocument(request)
            self.currentController = nil
            return document
        } catch let pkError as NSError {
            self.currentController = nil
            
            // Handle specific PassKit identity error codes
            // PKIdentityErrorNotEntitled = 1, PKIdentityErrorUserCancelled = 2, PKIdentityErrorFeatureNotAvailable = 4
            if pkError.domain == "PKIdentityErrorDomain" || pkError.domain.contains("PKIdentity") {
                switch pkError.code {
                case 1: // Not entitled
                    throw IdentityVerificationError.entitlementRequired(
                        "com.apple.developer.in-app-identity-presentment entitlement is required. In Xcode Simulator, use the built-in Simulator Mock Profile switcher below to test the full flow."
                    )
                case 2: // User cancelled
                    throw IdentityVerificationError.requestCancelled
                case 4: // Feature not available
                    throw IdentityVerificationError.identityNotAvailable(
                        "Identity presentment is not supported or no driver's license is provisioned in Wallet."
                    )
                default:
                    throw IdentityVerificationError.authorizationFailed(pkError.localizedDescription)
                }
            }
            
            throw IdentityVerificationError.authorizationFailed(pkError.localizedDescription)
        }
    }
    
    /// Cancels any in-flight identity request.
    public func cancelRequest() {
        currentController?.cancelRequest()
        currentController = nil
    }
}

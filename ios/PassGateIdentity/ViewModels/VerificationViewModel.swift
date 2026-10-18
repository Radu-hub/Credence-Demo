import Foundation
import SwiftUI
import Combine
import PassKit

public enum OperationMode: String, CaseIterable, Identifiable {
    case simulatorMock = "Simulator Mock"
    case nativePassKit = "Apple PassKit (Native Sheet)"
    
    public var id: String { rawValue }
}

@MainActor
public final class VerificationViewModel: ObservableObject {
    
    // MARK: - Published Properties
    
    @Published public var uiState: VerificationUIState = .idle
    @Published public var operationMode: OperationMode = .simulatorMock
    @Published public var selectedPersona: SimulatorPersona = SimulatorPersona.johnAppleseed
    @Published public var useBackendVerification: Bool = true
    @Published public var activeSessionId: String = ""
    @Published public var recentResults: [IdentityResult] = []
    @Published public var isPassKitAvailableOnDevice: Bool = false
    @Published public var statusMessage: String = "Ready to verify identity"
    @Published public var showingSettings: Bool = false
    @Published public var backendURL: String {
        didSet {
            backendService.baseURL = backendURL
        }
    }
    
    public let backendService = BackendAPIService.shared
    public let mockProvider = SimulatorMockProvider.shared
    public let localParser = MdocParserService.shared
    
    public init() {
        self.activeSessionId = UUID().uuidString
        self.backendURL = BackendAPIService.shared.baseURL
        Task {
            await checkDeviceCapabilities()
            await backendService.checkHealth()
        }
    }
    
    // MARK: - Device Capabilities
    
    public func checkDeviceCapabilities() async {
        if #available(iOS 16.0, *) {
            let canRequest = await IdentityVerificationService.shared.canRequestDocument()
            self.isPassKitAvailableOnDevice = canRequest
            
            #if targetEnvironment(simulator)
            // On simulator, default to simulatorMock mode so developer gets an instant 100% working demo
            if !canRequest {
                self.operationMode = .simulatorMock
            }
            #else
            if canRequest {
                self.operationMode = .nativePassKit
            }
            #endif
        } else {
            self.isPassKitAvailableOnDevice = false
            self.operationMode = .simulatorMock
        }
    }
    
    // MARK: - Verification Flow Trigger
    
    public func verifyWithAppleWallet() {
        guard !uiState.isLoading else { return }
        
        // Generate fresh session ID for anti-replay tracking
        self.activeSessionId = UUID().uuidString
        
        switch operationMode {
        case .simulatorMock:
            performSimulatorMockVerification()
        case .nativePassKit:
            performNativePassKitVerification()
        }
    }
    
    // MARK: - Simulator Mock Path
    
    public func performSimulatorMockVerification() {
        executeVerification(for: selectedPersona)
    }
    
    public func executeVerification(for persona: SimulatorPersona? = nil) {
        if let persona = persona {
            self.selectedPersona = persona
        }
        self.activeSessionId = UUID().uuidString
        let targetPersona = persona ?? selectedPersona
        
        // If backend is active and enabled, verify via backend; otherwise verify locally with zero latency!
        if useBackendVerification && backendService.isConnected {
            self.uiState = .verifyingWithBackend
            self.statusMessage = "Verifying with PassGate backend..."
            
            let mockPayload = mockProvider.generateMockPayload(
                for: targetPersona,
                sessionId: activeSessionId
            )
            
            Task {
                do {
                    let result = try await backendService.verifyPresentation(
                        sessionId: activeSessionId,
                        simulatorPayload: mockPayload
                    )
                    self.uiState = .completed(result)
                    self.recentResults.insert(result, at: 0)
                    triggerHaptic(for: result.decision)
                    self.statusMessage = "Verification complete."
                } catch {
                    let localResult = mockProvider.evaluateLocally(
                        persona: targetPersona,
                        sessionId: activeSessionId
                    )
                    self.uiState = .completed(localResult)
                    self.recentResults.insert(localResult, at: 0)
                    triggerHaptic(for: localResult.decision)
                    self.statusMessage = "Verified locally."
                }
            }
        } else {
            let localResult = mockProvider.evaluateLocally(
                persona: targetPersona,
                sessionId: activeSessionId
            )
            self.uiState = .completed(localResult)
            self.recentResults.insert(localResult, at: 0)
            triggerHaptic(for: localResult.decision)
            self.statusMessage = "Verified locally."
        }
    }
    
    // MARK: - Native PassKit Path
    
    private func performNativePassKitVerification() {
        guard #available(iOS 16.0, *) else {
            self.uiState = .failed("In-App Identity Presentment requires iOS 16.0 or later.")
            return
        }
        
        self.uiState = .requestingIdentity
        self.statusMessage = "Presenting Apple Wallet identity sheet..."
        
        Task {
            var nonceData: Data? = nil
            
            // Try fetching real anti-replay nonce from backend if configured
            if useBackendVerification {
                do {
                    let authOptions = try await backendService.fetchAuthOptions(sessionId: activeSessionId)
                    if let hex = authOptions.nonceHex, let data = Data(hexString: hex) {
                        nonceData = data
                    }
                } catch {
                    print("[VerificationViewModel] Could not fetch remote nonce, using secure local nonce: \(error.localizedDescription)")
                }
            }
            
            do {
                let document = try await IdentityVerificationService.shared.requestIdentity(nonce: nonceData)
                let encryptedData = document.encryptedData
                
                self.uiState = .verifyingWithBackend
                self.statusMessage = "Verifying Apple Wallet cryptographic document..."
                
                if useBackendVerification {
                    do {
                        let result = try await backendService.verifyPresentation(
                            sessionId: activeSessionId,
                            encryptedData: encryptedData
                        )
                        self.uiState = .completed(result)
                        self.recentResults.insert(result, at: 0)
                        triggerHaptic(for: result.decision)
                    } catch {
                        // Fallback to local parsing of document
                        let localResult = localParser.parseAndVerify(data: encryptedData, sessionId: activeSessionId)
                        self.uiState = .completed(localResult)
                        self.recentResults.insert(localResult, at: 0)
                        triggerHaptic(for: localResult.decision)
                    }
                } else {
                    let localResult = localParser.parseAndVerify(data: encryptedData, sessionId: activeSessionId)
                    self.uiState = .completed(localResult)
                    self.recentResults.insert(localResult, at: 0)
                    triggerHaptic(for: localResult.decision)
                }
                
                self.statusMessage = "Verification complete."
            } catch let error as IdentityVerificationError {
                if case .entitlementRequired = error {
                    // Informative guidance for simulator developer
                    self.uiState = .failed(error.localizedDescription)
                    self.operationMode = .simulatorMock
                } else if case .requestCancelled = error {
                    self.uiState = .idle
                    self.statusMessage = "Verification was cancelled."
                } else {
                    self.uiState = .failed(error.localizedDescription)
                }
                triggerHaptic(for: .denied)
            } catch {
                self.uiState = .failed(error.localizedDescription)
                triggerHaptic(for: .denied)
            }
        }
    }
    
    // MARK: - Actions
    
    public func reset() {
        self.uiState = .idle
        self.statusMessage = "Ready to verify identity"
        self.activeSessionId = UUID().uuidString
    }
    
    private func triggerHaptic(for decision: VerificationDecision) {
        #if canImport(UIKit)
        let generator = UINotificationFeedbackGenerator()
        switch decision {
        case .granted:
            generator.notificationOccurred(.success)
        case .denied, .unknown:
            generator.notificationOccurred(.warning)
        case .pending:
            break
        }
        #endif
    }
}

// MARK: - Hex String Data Extension

extension Data {
    init?(hexString: String) {
        let clean = hexString.replacingOccurrences(of: " ", with: "")
        var data = Data(capacity: clean.count / 2)
        var index = clean.startIndex
        while index < clean.endIndex {
            let nextIndex = clean.index(index, offsetBy: 2, limitedBy: clean.endIndex) ?? clean.endIndex
            guard let byte = UInt8(clean[index..<nextIndex], radix: 16) else { return nil }
            data.append(byte)
            index = nextIndex
        }
        self = data
    }
}

import SwiftUI

public struct SettingsSheetView: View {
    @ObservedObject var viewModel: VerificationViewModel
    @Environment(\.dismiss) private var dismiss
    
    @State private var testingConnection: Bool = false
    @State private var testResult: String?
    
    public init(viewModel: VerificationViewModel) {
        self.viewModel = viewModel
    }
    
    public var body: some View {
        NavigationStack {
            Form {
                // MARK: - Operation Mode
                Section(header: Text("Verification Engine")) {
                    Picker("Engine Mode", selection: $viewModel.operationMode) {
                        ForEach(OperationMode.allCases) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    
                    if viewModel.operationMode == .simulatorMock {
                        Picker("Simulator Persona", selection: $viewModel.selectedPersona) {
                            ForEach(SimulatorPersona.presets) { persona in
                                HStack {
                                    Text(persona.name)
                                    Spacer()
                                    Text(persona.isOver21 ? "21+" : "<21")
                                        .font(.caption.bold())
                                        .foregroundColor(persona.isOver21 ? .green : .red)
                                }
                                .tag(persona)
                            }
                        }
                        
                        Text(viewModel.selectedPersona.description)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    } else {
                        HStack {
                            Image(systemName: viewModel.isPassKitAvailableOnDevice ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                                .foregroundColor(viewModel.isPassKitAvailableOnDevice ? .green : .orange)
                            Text(viewModel.isPassKitAvailableOnDevice
                                 ? "PassKit Identity Available"
                                 : "Requires 'In-App Identity Presentment' entitlement or Simulator Mock Mode")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
                
                // MARK: - Backend Configuration
                Section(header: Text("PassGate Backend Integration")) {
                    Toggle("Verify with Backend API", isOn: $viewModel.useBackendVerification)
                    
                    if viewModel.useBackendVerification {
                        HStack {
                            Text("API Host")
                                .font(.subheadline)
                            Spacer()
                            TextField("http://localhost:3000", text: $viewModel.backendURL)
                                .font(.system(.subheadline, design: .monospaced))
                                .multilineTextAlignment(.trailing)
                                .autocorrectionDisabled()
                                .textInputAutocapitalization(.never)
                        }
                        
                        HStack {
                            Button(action: testConnection) {
                                if testingConnection {
                                    HStack {
                                        ProgressView()
                                            .scaleEffect(0.8)
                                        Text("Testing...")
                                    }
                                } else {
                                    Text("Test Connection")
                                }
                            }
                            .disabled(testingConnection)
                            
                            Spacer()
                            
                            if viewModel.backendService.isConnected {
                                HStack(spacing: 4) {
                                    Circle().fill(Color.green).frame(width: 8, height: 8)
                                    Text("Connected (\(viewModel.backendService.lastLatencyMs)ms)")
                                        .font(.caption.bold())
                                        .foregroundColor(.green)
                                }
                            } else if let res = testResult {
                                Text(res)
                                    .font(.caption)
                                    .foregroundColor(.red)
                            }
                        }
                    }
                }
                
                // MARK: - Entitlements & Provisioning Checklist
                Section(header: Text("Xcode & Provisioning Guide")) {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Capability: Wallet", systemImage: "wallet.pass.fill")
                            .font(.subheadline.bold())
                        Text("Add the 'Wallet' capability to your target in Signing & Capabilities.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        
                        Divider().padding(.vertical, 4)
                        
                        Label("Entitlement", systemImage: "key.fill")
                            .font(.subheadline.bold())
                        Text("com.apple.developer.in-app-identity-presentment")
                            .font(.system(.caption, design: .monospaced))
                            .foregroundColor(.blue)
                        Text("Configured automatically in PassGateIdentity.entitlements.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        
                        Divider().padding(.vertical, 4)
                        
                        Label("Simulator Testing", systemImage: "laptopcomputer.and.iphone")
                            .font(.subheadline.bold())
                        Text("In Xcode iOS Simulator, Apple provides mock identities. If testing without an approved Apple developer entitlement, switch to 'Simulator Mock' above to simulate all flows instantly.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding(.vertical, 4)
                }
            }
            .navigationTitle("Configuration")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
    
    private func testConnection() {
        testingConnection = true
        testResult = nil
        Task {
            let ok = await viewModel.backendService.checkHealth()
            testingConnection = false
            testResult = ok ? nil : "Unable to reach server"
        }
    }
}

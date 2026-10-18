import SwiftUI

public struct VerificationView: View {
    @ObservedObject var viewModel: VerificationViewModel
    @State private var showingResultDetail: Bool = false
    
    public init(viewModel: VerificationViewModel) {
        self.viewModel = viewModel
    }
    
    public var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // MARK: - Header Status Chip
                HStack {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(viewModel.operationMode == .nativePassKit ? Color.green : Color.blue)
                            .frame(width: 8, height: 8)
                        Text(viewModel.operationMode.rawValue)
                            .font(.caption.bold())
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Color(.tertiarySystemBackground))
                    .cornerRadius(12)
                    
                    Spacer()
                    
                    if viewModel.useBackendVerification {
                        HStack(spacing: 4) {
                            Image(systemName: "server.rack")
                                .font(.caption2)
                            Text(viewModel.backendService.isConnected ? "Backend Active" : "Backend Offline")
                                .font(.caption2.bold())
                        }
                        .foregroundColor(viewModel.backendService.isConnected ? .green : .orange)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color(.tertiarySystemBackground))
                        .cornerRadius(8)
                    }
                }
                .padding(.horizontal)
                
                // MARK: - Hero Digital License Card
                ZStack {
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [Color(red: 0.1, green: 0.15, blue: 0.28), Color(red: 0.05, green: 0.08, blue: 0.15)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(height: 220)
                        .shadow(color: Color.black.opacity(0.2), radius: 15, x: 0, y: 8)
                    
                    VStack(alignment: .leading, spacing: 14) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("MOBILE DRIVER'S LICENSE")
                                    .font(.system(size: 11, weight: .black, design: .rounded))
                                    .foregroundColor(.white.opacity(0.7))
                                    .tracking(1.2)
                                Text("Apple Wallet Presentation")
                                    .font(.system(size: 16, weight: .bold))
                                    .foregroundColor(.white)
                            }
                            Spacer()
                            Image(systemName: "person.badge.shield.checkmark.fill")
                                .font(.system(size: 28))
                                .foregroundColor(.white.opacity(0.9))
                        }
                        
                        Spacer()
                        
                        HStack(alignment: .bottom) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("REQUESTED ELEMENT")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(.white.opacity(0.6))
                                HStack(spacing: 8) {
                                    Text("Age 21 or Older")
                                        .font(.system(size: 17, weight: .heavy))
                                        .foregroundColor(.white)
                                    Text("ISO 18013-5")
                                        .font(.system(size: 10, weight: .bold))
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(Color.white.opacity(0.2))
                                        .cornerRadius(4)
                                        .foregroundColor(.white)
                                }
                            }
                            Spacer()
                            Image(systemName: "wave.3.right")
                                .font(.system(size: 20))
                                .foregroundColor(.white.opacity(0.8))
                        }
                    }
                    .padding(20)
                }
                .padding(.horizontal)
                
                // MARK: - Active Mode Description
                if viewModel.operationMode == .simulatorMock {
                    VStack(spacing: 8) {
                        HStack {
                            Image(systemName: "person.crop.circle.badge.checkmark")
                                .foregroundColor(.blue)
                            Text("Active Simulator Persona:")
                                .font(.subheadline.bold())
                            Spacer()
                            Text(viewModel.selectedPersona.name)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                        HStack {
                            Text("Outcome:")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text(viewModel.selectedPersona.isOver21 ? "Will Grant (21+)" : "Will Deny (<21)")
                                .font(.caption.bold())
                                .foregroundColor(viewModel.selectedPersona.isOver21 ? .green : .red)
                            Spacer()
                            Button("Switch") {
                                viewModel.showingSettings = true
                            }
                            .font(.caption.bold())
                        }
                    }
                    .padding()
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(14)
                    .padding(.horizontal)
                }
                
                // MARK: - Action Buttons
                VStack(spacing: 12) {
                    WalletVerificationButton(
                        title: "Verify with Apple Wallet",
                        isLoading: viewModel.uiState.isLoading,
                        action: {
                            viewModel.verifyWithAppleWallet()
                        }
                    )
                    
                    Text("Zero-Retention: Age threshold is verified cryptographically without storing personal identity records.")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                }
                .padding(.horizontal)
                
                // MARK: - Status & Error Banners
                if case .failed(let errorMsg) = viewModel.uiState {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Image(systemName: "exclamationmark.octagon.fill")
                                .foregroundColor(.red)
                            Text("Verification Error")
                                .font(.headline)
                                .foregroundColor(.red)
                        }
                        
                        Text(errorMsg)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                        
                        if viewModel.operationMode == .nativePassKit {
                            Button(action: {
                                viewModel.operationMode = .simulatorMock
                                viewModel.reset()
                            }) {
                                HStack {
                                    Image(systemName: "sparkles")
                                    Text("Switch to Simulator Mock Mode")
                                }
                                .font(.subheadline.bold())
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8)
                                .background(Color.blue)
                                .foregroundColor(.white)
                                .cornerRadius(8)
                            }
                            .padding(.top, 4)
                        }
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.red.opacity(0.1))
                    .cornerRadius(14)
                    .padding(.horizontal)
                }
                
                // MARK: - Inline Completed Result (if verified)
                if case .completed(let result) = viewModel.uiState {
                    VStack(spacing: 16) {
                        HStack {
                            Text("Latest Verification")
                                .font(.headline)
                            Spacer()
                            StatusBadgeView(decision: result.decision)
                        }
                        
                        Divider()
                        
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(result.attributes.fullName)
                                    .font(.title3.bold())
                                Text(result.reason)
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            Button("View Details") {
                                showingResultDetail = true
                            }
                            .font(.subheadline.bold())
                            .buttonStyle(.borderedProminent)
                        }
                    }
                    .padding()
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(16)
                    .padding(.horizontal)
                }
            }
            .padding(.vertical)
        }
        .navigationTitle("PassGate Identity")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: { viewModel.showingSettings = true }) {
                    Image(systemName: "gearshape.fill")
                }
            }
        }
        .sheet(isPresented: $showingResultDetail) {
            if case .completed(let result) = viewModel.uiState {
                NavigationStack {
                    ResultDetailView(result: result) {
                        showingResultDetail = false
                    }
                }
            }
        }
        .sheet(isPresented: $viewModel.showingSettings) {
            SettingsSheetView(viewModel: viewModel)
        }
    }
}

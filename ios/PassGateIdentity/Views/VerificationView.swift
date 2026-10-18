import SwiftUI

/// Customer-facing view allowing the patron to view their Apple Wallet Digital ID,
/// receive incoming age verification requests from venues (restaurants/bars/clubs),
/// and present their mDL credential via Apple Wallet to generate an anti-fraud verified pass.
public struct VerificationView: View {
    @ObservedObject var viewModel: VerificationViewModel
    @State private var showingVerifiedPass: Bool = false
    @State private var showingWalletSheet: Bool = false
    @State private var showingVenueSelector: Bool = false
    @State private var showingPersonaSelector: Bool = false
    
    public init(viewModel: VerificationViewModel) {
        self.viewModel = viewModel
    }
    
    public var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // MARK: - Customer Profile & Mode Bar
                HStack(spacing: 12) {
                    Button(action: { showingPersonaSelector = true }) {
                        HStack(spacing: 8) {
                            ZStack {
                                Circle()
                                    .fill(Color.blue.opacity(0.15))
                                    .frame(width: 34, height: 34)
                                Image(systemName: viewModel.selectedPersona.portraitSymbol)
                                    .font(.system(size: 18))
                                    .foregroundColor(.blue)
                            }
                            
                            VStack(alignment: .leading, spacing: 1) {
                                Text("Customer Profile")
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundColor(.secondary)
                                HStack(spacing: 4) {
                                    Text(viewModel.selectedPersona.givenName + " " + viewModel.selectedPersona.familyName)
                                        .font(.subheadline.bold())
                                        .foregroundColor(.primary)
                                    Image(systemName: "chevron.down")
                                        .font(.system(size: 10, weight: .bold))
                                        .foregroundColor(.secondary)
                                }
                            }
                        }
                    }
                    
                    Spacer()
                    
                    // Age Status Pill
                    Text(viewModel.selectedPersona.isOver21 ? "Legal (21+)" : "Minor (<21)")
                        .font(.caption.bold())
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(viewModel.selectedPersona.isOver21 ? Color.green.opacity(0.15) : Color.red.opacity(0.15))
                        .foregroundColor(viewModel.selectedPersona.isOver21 ? .green : .red)
                        .cornerRadius(12)
                }
                .padding(.horizontal)
                
                // MARK: - Customer Apple Wallet Digital ID Card Preview
                ZStack {
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [Color(red: 0.10, green: 0.16, blue: 0.28), Color(red: 0.05, green: 0.08, blue: 0.14)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(height: 146)
                        .shadow(color: Color.black.opacity(0.18), radius: 10, x: 0, y: 5)
                    
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("APPLE WALLET DIGITAL ID")
                                    .font(.system(size: 9, weight: .black, design: .rounded))
                                    .foregroundColor(.white.opacity(0.7))
                                    .tracking(1.1)
                                Text(viewModel.selectedPersona.issuingAuthority.uppercased())
                                    .font(.system(size: 12, weight: .heavy))
                                    .foregroundColor(.white)
                            }
                            Spacer()
                            Image(systemName: "wave.3.right")
                                .font(.system(size: 18))
                                .foregroundColor(.white.opacity(0.8))
                        }
                        
                        Spacer()
                        
                        HStack(alignment: .center, spacing: 12) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(Color.white.opacity(0.15))
                                    .frame(width: 44, height: 52)
                                Image(systemName: viewModel.selectedPersona.portraitSymbol)
                                    .font(.system(size: 24))
                                    .foregroundColor(.white)
                            }
                            
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(viewModel.selectedPersona.givenName) \(viewModel.selectedPersona.familyName)")
                                    .font(.system(size: 16, weight: .bold))
                                    .foregroundColor(.white)
                                Text("DOB: \(viewModel.selectedPersona.birthDate)")
                                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                                    .foregroundColor(.white.opacity(0.75))
                                Text(viewModel.selectedPersona.maskedIdNumber)
                                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                                    .foregroundColor(.white.opacity(0.55))
                            }
                            
                            Spacer()
                        }
                    }
                    .padding(16)
                }
                .padding(.horizontal)
                
                // MARK: - Incoming Venue Age Verification Request (Notification Card)
                VStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .top) {
                        HStack(spacing: 8) {
                            ZStack {
                                Circle()
                                    .fill(Color.orange.opacity(0.2))
                                    .frame(width: 32, height: 32)
                                Image(systemName: "bell.badge.fill")
                                    .foregroundColor(.orange)
                                    .font(.system(size: 15))
                            }
                            
                            VStack(alignment: .leading, spacing: 2) {
                                Text("INCOMING VERIFICATION REQUEST")
                                    .font(.system(size: 10, weight: .black))
                                    .foregroundColor(.orange)
                                    .tracking(1.0)
                                Text("Venue requires proof of age")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                        
                        Spacer()
                        
                        // Switch Venue Menu Button
                        Menu {
                            ForEach(VenueRequest.presets) { venue in
                                Button(action: { viewModel.activeVenue = venue }) {
                                    Label(venue.name, systemImage: venue.iconName)
                                }
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Text("Change Venue")
                                    .font(.caption2.bold())
                                Image(systemName: "chevron.up.chevron.down")
                                    .font(.system(size: 10))
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color(.tertiarySystemBackground))
                            .cornerRadius(8)
                            .foregroundColor(.accentColor)
                        }
                    }
                    
                    Divider()
                    
                    // Venue Info Row
                    HStack(spacing: 12) {
                        Image(systemName: viewModel.activeVenue.iconName)
                            .font(.system(size: 24))
                            .foregroundColor(.accentColor)
                            .frame(width: 44, height: 44)
                            .background(Color.accentColor.opacity(0.12))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        
                        VStack(alignment: .leading, spacing: 2) {
                            Text(viewModel.activeVenue.name)
                                .font(.headline)
                                .foregroundColor(.primary)
                            Text(viewModel.activeVenue.category + " · " + viewModel.activeVenue.location)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        Spacer()
                    }
                    
                    Text(viewModel.activeVenue.description)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    
                    // Privacy & Attributes Disclosure Box
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 6) {
                            Image(systemName: "lock.shield.fill")
                                .foregroundColor(.green)
                                .font(.caption)
                            Text("Privacy Preserved (ISO 18013-5 willNotStore)")
                                .font(.caption.bold())
                                .foregroundColor(.primary)
                        }
                        
                        Text("Only confirms that you are 21 or older and shares your ID photo. Your street address, document number, and full birthdate remain private.")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                    .padding(10)
                    .background(Color(.tertiarySystemBackground))
                    .cornerRadius(10)
                    
                    // Primary Verification Action
                    WalletVerificationButton(
                        title: "Verify My Age with Apple Wallet",
                        isLoading: viewModel.uiState.isLoading,
                        action: {
                            if viewModel.operationMode == .simulatorMock {
                                showingWalletSheet = true
                            } else {
                                viewModel.verifyWithAppleWallet()
                            }
                        }
                    )
                }
                .padding(18)
                .background(Color(.secondarySystemBackground))
                .cornerRadius(20)
                .padding(.horizontal)
                
                // MARK: - Active Pass Banner (if verified)
                if let latest = viewModel.latestVerifiedResult {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Circle()
                                .fill(latest.ageOver21 ? Color.green : Color.red)
                                .frame(width: 10, height: 10)
                            Text("Active Verified Pass Available")
                                .font(.subheadline.bold())
                            Spacer()
                            Text(latest.timestamp.formatted(date: .omitted, time: .shortened))
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(latest.attributes.fullName)
                                    .font(.headline)
                                Text(latest.ageOver21 ? "Age 21+ Confirmed" : "Under 21 (Denied)")
                                    .font(.caption)
                                    .foregroundColor(latest.ageOver21 ? .green : .red)
                            }
                            
                            Spacer()
                            
                            Button("Present Pass") {
                                showingVerifiedPass = true
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
                
                // MARK: - Error Banner
                if case .failed(let errorMsg) = viewModel.uiState {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Image(systemName: "exclamationmark.octagon.fill")
                                .foregroundColor(.red)
                            Text("Verification Failed")
                                .font(.headline)
                                .foregroundColor(.red)
                        }
                        Text(errorMsg)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.red.opacity(0.1))
                    .cornerRadius(14)
                    .padding(.horizontal)
                }
            }
            .padding(.top)
            .padding(.bottom, 60)
        }
        .navigationTitle("PassGate ID")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: { viewModel.showingSettings = true }) {
                    Image(systemName: "gearshape.fill")
                }
            }
        }
        // Persona selection sheet
        .confirmationDialog("Switch Customer ID Profile", isPresented: $showingPersonaSelector, titleVisibility: .visible) {
            ForEach(SimulatorPersona.presets) { persona in
                Button("\(persona.name) - \(persona.isOver21 ? "Legal (21+)" : "Minor (<21)")") {
                    viewModel.selectedPersona = persona
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        // Apple Wallet Mock Presentation Sheet
        .sheet(isPresented: $showingWalletSheet) {
            AppleWalletSheetView(
                persona: viewModel.selectedPersona,
                venue: viewModel.activeVenue,
                onConfirm: {
                    showingWalletSheet = false
                    viewModel.executeVerification(for: viewModel.selectedPersona)
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
                        showingVerifiedPass = true
                    }
                },
                onCancel: {
                    showingWalletSheet = false
                }
            )
        }
        // Interactive Anti-Fraud Verified Pass Screen
        .sheet(isPresented: $showingVerifiedPass) {
            if let result = viewModel.latestVerifiedResult {
                NavigationStack {
                    VerifiedPassView(result: result) {
                        showingVerifiedPass = false
                    }
                }
            }
        }
        .sheet(isPresented: $viewModel.showingSettings) {
            SettingsSheetView(viewModel: viewModel)
        }
    }
}

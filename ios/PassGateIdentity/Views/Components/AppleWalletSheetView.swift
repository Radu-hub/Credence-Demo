import SwiftUI

/// A native-fidelity Apple Wallet Identity Presentation sheet mimicking the iOS system sheet.
public struct AppleWalletSheetView: View {
    public let persona: SimulatorPersona
    public let venue: VenueRequest
    public let onConfirm: () -> Void
    public let onCancel: () -> Void
    
    @State private var isAuthenticating: Bool = false
    @State private var authenticated: Bool = false
    @State private var pulseAnimation: Bool = false
    
    public init(
        persona: SimulatorPersona,
        venue: VenueRequest = VenueRequest.rooftopLounge,
        onConfirm: @escaping () -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.persona = persona
        self.venue = venue
        self.onConfirm = onConfirm
        self.onCancel = onCancel
    }
    
    public var body: some View {
        VStack(spacing: 0) {
            // MARK: - Drag Indicator
            Capsule()
                .fill(Color.secondary.opacity(0.4))
                .frame(width: 36, height: 5)
                .padding(.top, 10)
                .padding(.bottom, 16)
            
            // MARK: - Header
            HStack(spacing: 8) {
                Image(systemName: "wallet.pass.fill")
                    .foregroundColor(.white)
                    .font(.system(size: 14, weight: .bold))
                    .padding(6)
                    .background(Color.black)
                    .clipShape(Circle())
                
                Text("Apple Wallet")
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.secondary)
                
                Spacer()
                
                Button(action: onCancel) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title3)
                        .foregroundColor(.secondary.opacity(0.7))
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 12)
            
            ScrollView {
                VStack(spacing: 18) {
                    // MARK: - mDL Card Mockup
                    ZStack {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: [Color(red: 0.12, green: 0.22, blue: 0.42), Color(red: 0.08, green: 0.12, blue: 0.22)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(height: 140)
                            .shadow(color: Color.black.opacity(0.18), radius: 10, x: 0, y: 5)
                        
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text(persona.issuingAuthority.uppercased())
                                    .font(.system(size: 11, weight: .black, design: .rounded))
                                    .foregroundColor(.white.opacity(0.8))
                                    .tracking(1.0)
                                Spacer()
                                Image(systemName: "person.text.rectangle.fill")
                                    .font(.system(size: 22))
                                    .foregroundColor(.white.opacity(0.9))
                            }
                            
                            Spacer()
                            
                            HStack(alignment: .bottom) {
                                HStack(spacing: 12) {
                                    ZStack {
                                        Circle()
                                            .fill(Color.white.opacity(0.2))
                                            .frame(width: 44, height: 44)
                                        Image(systemName: persona.portraitSymbol)
                                            .font(.system(size: 24))
                                            .foregroundColor(.white)
                                    }
                                    
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("\(persona.givenName) \(persona.familyName)")
                                            .font(.system(size: 17, weight: .bold))
                                            .foregroundColor(.white)
                                        Text("DOB: \(persona.birthDate)")
                                            .font(.system(size: 12, weight: .medium))
                                            .foregroundColor(.white.opacity(0.7))
                                    }
                                }
                                
                                Spacer()
                                
                                Text(persona.isOver21 ? "AGE 21+" : "AGE <21")
                                    .font(.system(size: 13, weight: .black))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(persona.isOver21 ? Color.green.opacity(0.85) : Color.red.opacity(0.85))
                                    .foregroundColor(.white)
                                    .cornerRadius(6)
                            }
                        }
                        .padding(16)
                    }
                    .padding(.horizontal, 20)
                    
                    // MARK: - Request Details
                    VStack(alignment: .leading, spacing: 12) {
                        Text("\(venue.name) is requesting age verification:")
                            .font(.subheadline.bold())
                            .foregroundColor(.primary)
                        
                        VStack(spacing: 8) {
                            HStack {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(.green)
                                Text("Age 21 or older")
                                    .font(.subheadline.weight(.medium))
                                Spacer()
                                Text(persona.isOver21 ? "Yes (Verified)" : "No (Under 21)")
                                    .font(.caption.bold())
                                    .foregroundColor(persona.isOver21 ? .green : .red)
                            }
                            
                            Divider()
                            
                            HStack {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(.green)
                                Text("Full Name")
                                    .font(.subheadline.weight(.medium))
                                Spacer()
                                Text("\(persona.givenName) \(persona.familyName)")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            
                            Divider()
                            
                            HStack {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(.green)
                                Text("Date of Birth")
                                    .font(.subheadline.weight(.medium))
                                Spacer()
                                Text(persona.birthDate)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                        .padding(14)
                        .background(Color(.secondarySystemBackground))
                        .cornerRadius(12)
                        
                        HStack(spacing: 6) {
                            Image(systemName: "lock.shield.fill")
                                .foregroundColor(.secondary)
                                .font(.caption)
                            Text("Data will not be stored (intentToStore: .willNotStore)")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                        .padding(.horizontal, 4)
                    }
                    .padding(.horizontal, 20)
                }
            }
            
            // MARK: - Biometric Confirmation Button
            VStack(spacing: 10) {
                Button(action: handleConfirm) {
                    HStack(spacing: 10) {
                        if isAuthenticating {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            Text("Verifying Face ID...")
                                .font(.headline)
                        } else if authenticated {
                            Image(systemName: "checkmark")
                                .font(.headline.bold())
                            Text("Approved")
                                .font(.headline)
                        } else {
                            Image(systemName: "faceid")
                                .font(.system(size: 22, weight: .medium))
                            Text("Double Click or Tap to Verify")
                                .font(.headline)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(authenticated ? Color.green : Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(14)
                }
                .disabled(isAuthenticating || authenticated)
                
                Button("Cancel", action: onCancel)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .padding(.vertical, 4)
            }
            .padding(.horizontal, 20)
            .padding(.top, 10)
            .padding(.bottom, 24)
        }
        .background(Color(.systemBackground))
        .presentationDetents([.fraction(0.85), .large])
        .presentationDragIndicator(.visible)
    }
    
    private func handleConfirm() {
        isAuthenticating = true
        
        #if canImport(UIKit)
        let impact = UIImpactFeedbackGenerator(style: .medium)
        impact.impactOccurred()
        #endif
        
        Task {
            try? await Task.sleep(nanoseconds: 500_000_000) // 0.5s biometric scan simulation
            await MainActor.run {
                isAuthenticating = false
                authenticated = true
                
                #if canImport(UIKit)
                let notif = UINotificationFeedbackGenerator()
                notif.notificationOccurred(.success)
                #endif
            }
            
            try? await Task.sleep(nanoseconds: 400_000_000) // 0.4s checkmark confirmation
            await MainActor.run {
                onConfirm()
            }
        }
    }
}

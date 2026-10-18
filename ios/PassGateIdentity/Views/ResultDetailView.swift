import SwiftUI

public struct ResultDetailView: View {
    public let result: IdentityResult
    public let onDismiss: () -> Void
    
    public init(result: IdentityResult, onDismiss: @escaping () -> Void) {
        self.result = result
        self.onDismiss = onDismiss
    }
    
    public var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // MARK: - Hero Decision Banner
                VStack(spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(result.decision.isGranted ? Color.green.opacity(0.12) : Color.red.opacity(0.12))
                            .frame(width: 84, height: 84)
                        
                        Image(systemName: result.decision.isGranted ? "checkmark.seal.fill" : "xmark.seal.fill")
                            .font(.system(size: 44))
                            .foregroundColor(result.decision.isGranted ? .green : .red)
                    }
                    .padding(.top, 8)
                    
                    Text(result.decision.displayTitle)
                        .font(.title2.bold())
                        .multilineTextAlignment(.center)
                    
                    StatusBadgeView(decision: result.decision)
                    
                    Text(result.reason)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                .padding()
                .frame(maxWidth: .infinity)
                .background(Color(.secondarySystemBackground))
                .cornerRadius(18)
                
                // MARK: - Age 21+ Threshold Card
                HStack(spacing: 16) {
                    ZStack {
                        Circle()
                            .fill(result.ageOver21 ? Color.green : Color.red)
                            .frame(width: 48, height: 48)
                        Text("21+")
                            .font(.system(size: 16, weight: .black))
                            .foregroundColor(.white)
                    }
                    
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Age Threshold Rule")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text(result.ageOver21 ? "Confirmed Legal Age 21+" : "Under Legal Age (Denied)")
                            .font(.headline)
                            .foregroundColor(result.ageOver21 ? .green : .red)
                        if let age = result.attributes.computedAge {
                            Text("Calculated Patron Age: \(age) years old")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }
                    
                    Spacer()
                    
                    Image(systemName: result.ageOver21 ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .font(.title3)
                        .foregroundColor(result.ageOver21 ? .green : .red)
                }
                .padding()
                .background(Color(.secondarySystemBackground))
                .cornerRadius(16)
                
                // MARK: - Extracted Attributes Card
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        Text("Extracted mDL Attributes")
                            .font(.headline)
                        Spacer()
                        Text("ISO 18013-5")
                            .font(.caption2.bold())
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.blue.opacity(0.1))
                            .foregroundColor(.blue)
                            .cornerRadius(6)
                    }
                    
                    Divider()
                    
                    ClaimRowView(
                        icon: "person.fill",
                        label: "Full Name",
                        value: result.attributes.fullName,
                        verified: true,
                        accentColor: .blue
                    )
                    
                    if let dob = result.attributes.birthDate {
                        ClaimRowView(
                            icon: "calendar",
                            label: "Date of Birth",
                            value: dob,
                            verified: true,
                            accentColor: .orange
                        )
                    }
                    
                    ClaimRowView(
                        icon: "building.columns.fill",
                        label: "Issuing Authority",
                        value: result.attributes.issuingAuthority ?? "State DMV",
                        verified: true,
                        accentColor: .purple
                    )
                    
                    ClaimRowView(
                        icon: "lock.shield.fill",
                        label: "Storage Intent",
                        value: "willNotStore (Zero Retention)",
                        verified: true,
                        accentColor: .green
                    )
                }
                .padding()
                .background(Color(.secondarySystemBackground))
                .cornerRadius(16)
                
                // MARK: - Trust & Cryptographic Audit
                VStack(alignment: .leading, spacing: 12) {
                    Text("Cryptographic Verification")
                        .font(.headline)
                    
                    Divider()
                    
                    HStack {
                        Text("IACA Root Authority")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                        Spacer()
                        Text(result.trust.issuerAuthority)
                            .font(.subheadline.bold())
                    }
                    
                    HStack {
                        Text("Verification Source")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                        Spacer()
                        Text(result.source.rawValue)
                            .font(.subheadline.weight(.medium))
                    }
                    
                    HStack {
                        Text("Session ID")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                        Spacer()
                        Text(result.sessionId.prefix(12) + "...")
                            .font(.system(.caption, design: .monospaced))
                    }
                    
                    HStack {
                        Text("Verification Timestamp")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                        Spacer()
                        Text(result.timestamp.formatted(date: .abbreviated, time: .standard))
                            .font(.caption)
                    }
                }
                .padding()
                .background(Color(.secondarySystemBackground))
                .cornerRadius(16)
                
                // MARK: - Bottom Action Button
                Button(action: onDismiss) {
                    Text("Verify Another Patron")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(14)
                }
                .padding(.top, 8)
            }
            .padding()
        }
        .navigationTitle("Verification Result")
        .navigationBarTitleDisplayMode(.inline)
    }
}

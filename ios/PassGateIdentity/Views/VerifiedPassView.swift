import SwiftUI
import Combine

/// A high-security, interactive, and animated customer age verification pass.
/// Features live ticking millisecond clocks, iridescent holographic foil animation,
/// 3D card tilt physics, touch ripple haptics, customer ID portrait photo,
/// and rotating security seals to prevent static screenshots and forged passes.
public struct VerifiedPassView: View {
    public let result: IdentityResult
    public let onDismiss: (() -> Void)?
    
    // MARK: - Animation & Interaction State
    @State private var shimmerPhase: CGFloat = 0.0
    @State private var rotationAngle: Double = 0.0
    @State private var dragOffset: CGSize = .zero
    @State private var isTouching: Bool = false
    @State private var tapPulse: Bool = false
    @State private var pulseScale: CGFloat = 1.0
    @State private var currentTime = Date()
    @State private var activeDurationSeconds: Int = 0
    @State private var showingAuditSheet: Bool = false
    
    // Timer for ticking real-time security clock and duration (updates 10 times a sec)
    private let timer = Timer.publish(every: 0.1, on: .main, in: .common).autoconnect()
    
    public init(result: IdentityResult, onDismiss: (() -> Void)? = nil) {
        self.result = result
        self.onDismiss = onDismiss
    }
    
    public var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Top Venue Notification Header
                if let venue = result.venue {
                    HStack(spacing: 10) {
                        Image(systemName: venue.iconName)
                            .foregroundColor(.accentColor)
                            .font(.system(size: 16, weight: .bold))
                            .padding(8)
                            .background(Color.accentColor.opacity(0.12))
                            .clipShape(Circle())
                        
                        VStack(alignment: .leading, spacing: 2) {
                            Text("VERIFIED FOR VENUE")
                                .font(.system(size: 10, weight: .black))
                                .foregroundColor(.secondary)
                                .tracking(1.0)
                            Text(venue.name)
                                .font(.subheadline.bold())
                        }
                        
                        Spacer()
                        
                        HStack(spacing: 4) {
                            Circle()
                                .fill(Color.green)
                                .frame(width: 7, height: 7)
                            Text("LIVE PASS")
                                .font(.system(size: 10, weight: .heavy))
                                .foregroundColor(.green)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.green.opacity(0.12))
                        .cornerRadius(8)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(14)
                    .padding(.horizontal)
                }
                
                // MARK: - Hero Interactive Security Pass Card
                ZStack {
                    // Card Base Background
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: result.ageOver21
                                    ? [Color(red: 0.05, green: 0.18, blue: 0.12), Color(red: 0.02, green: 0.08, blue: 0.05)]
                                    : [Color(red: 0.22, green: 0.06, blue: 0.06), Color(red: 0.10, green: 0.02, blue: 0.02)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 24, style: .continuous)
                                .stroke(
                                    result.ageOver21 ? Color.green.opacity(0.6) : Color.red.opacity(0.6),
                                    lineWidth: 2
                                )
                        )
                    
                    // Layer 1: Moving Holographic Guilloche / Iridescent Shimmer Foil
                    GeometryReader { geo in
                        let cardWidth = geo.size.width
                        LinearGradient(
                            stops: [
                                .init(color: .clear, location: 0.0),
                                .init(color: Color.cyan.opacity(0.15), location: 0.2),
                                .init(color: Color.pink.opacity(0.20), location: 0.4),
                                .init(color: Color.yellow.opacity(0.25), location: 0.5),
                                .init(color: Color.purple.opacity(0.20), location: 0.6),
                                .init(color: Color.cyan.opacity(0.15), location: 0.8),
                                .init(color: .clear, location: 1.0)
                            ],
                            startPoint: UnitPoint(x: shimmerPhase - 0.5, y: 0),
                            endPoint: UnitPoint(x: shimmerPhase + 0.5, y: 1)
                        )
                        .blendMode(.screen)
                        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                    }
                    
                    // Layer 2: Interactive Specular Gleam responding to touch/tilt
                    LinearGradient(
                        colors: [
                            Color.white.opacity(isTouching ? 0.22 : 0.08),
                            Color.clear
                        ],
                        startPoint: UnitPoint(
                            x: 0.5 + Double(dragOffset.width / 400),
                            y: 0.5 + Double(dragOffset.height / 400)
                        ),
                        endPoint: UnitPoint(
                            x: 0.5 - Double(dragOffset.width / 400),
                            y: 0.5 - Double(dragOffset.height / 400)
                        )
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                    
                    // Layer 3: Security Watermark Pattern in Background
                    VStack {
                        Spacer()
                        HStack {
                            Spacer()
                            RotatingSecuritySealView(rotationAngle: rotationAngle, isOver21: result.ageOver21)
                                .opacity(0.35)
                                .padding(-30)
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                    
                    // Card Foreground Content
                    VStack(alignment: .leading, spacing: 16) {
                        // Card Header
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text((result.attributes.issuingAuthority ?? "CALIFORNIA DMV").uppercased())
                                    .font(.system(size: 11, weight: .black, design: .rounded))
                                    .foregroundColor(.white.opacity(0.75))
                                    .tracking(1.4)
                                
                                Text("OFFICIAL DIGITAL ID")
                                    .font(.system(size: 15, weight: .heavy))
                                    .foregroundColor(.white)
                            }
                            
                            Spacer()
                            
                            // Live Pulsing Authenticity Badge
                            HStack(spacing: 5) {
                                Circle()
                                    .fill(result.ageOver21 ? Color.green : Color.red)
                                    .frame(width: 8, height: 8)
                                    .scaleEffect(pulseScale)
                                Text("AUTHENTIC mDL")
                                    .font(.system(size: 9, weight: .heavy))
                                    .foregroundColor(.white)
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.white.opacity(0.15))
                            .clipShape(Capsule())
                        }
                        
                        // Hero Photo & Age Row
                        HStack(alignment: .center, spacing: 18) {
                            // Official Customer Photo Frame
                            CustomerPortraitPhotoBadge(
                                attributes: result.attributes,
                                isOver21: result.ageOver21
                            )
                            
                            // Customer Identification & Age Decision
                            VStack(alignment: .leading, spacing: 6) {
                                Text(result.attributes.fullName)
                                    .font(.system(size: 21, weight: .heavy))
                                    .foregroundColor(.white)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.85)
                                
                                HStack(spacing: 8) {
                                    Text(result.ageOver21 ? "AGE 21+" : "UNDER 21")
                                        .font(.system(size: 15, weight: .black))
                                        .foregroundColor(result.ageOver21 ? .green : .red)
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 4)
                                        .background(
                                            (result.ageOver21 ? Color.green : Color.red)
                                                .opacity(0.2)
                                        )
                                        .cornerRadius(8)
                                    
                                    if let age = result.attributes.computedAge {
                                        Text("\(age) yrs")
                                            .font(.system(size: 14, weight: .bold))
                                            .foregroundColor(.white.opacity(0.85))
                                    }
                                }
                                
                                Text("DOB: \(result.attributes.birthDate ?? "Protected")")
                                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                                    .foregroundColor(.white.opacity(0.65))
                                
                                Text("ID: \(result.verificationToken)")
                                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                                    .foregroundColor(.white.opacity(0.5))
                            }
                            
                            Spacer()
                        }
                        
                        Divider()
                            .background(Color.white.opacity(0.2))
                        
                        // Verification Status Banner Inside Card
                        HStack {
                            Image(systemName: result.ageOver21 ? "checkmark.shield.fill" : "xmark.shield.fill")
                                .font(.system(size: 24))
                                .foregroundColor(result.ageOver21 ? .green : .red)
                            
                            VStack(alignment: .leading, spacing: 1) {
                                Text(result.ageOver21 ? "LEGAL DRINKING AGE CONFIRMED" : "AGE THRESHOLD NOT MET")
                                    .font(.system(size: 13, weight: .heavy))
                                    .foregroundColor(result.ageOver21 ? .green : .red)
                                Text(result.ageOver21 ? "Authorized for admission & alcoholic beverages" : "Under legal age of 21")
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(.white.opacity(0.7))
                            }
                            
                            Spacer()
                        }
                        .padding(10)
                        .background(Color.black.opacity(0.25))
                        .cornerRadius(12)
                        
                        // Live Security Clock Ticker
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("LIVE VERIFICATION TIME")
                                    .font(.system(size: 9, weight: .black))
                                    .foregroundColor(.white.opacity(0.6))
                                    .tracking(1.0)
                                
                                // Real-time ticking millisecond timestamp
                                Text(formatLiveTime(currentTime))
                                    .font(.system(size: 14, weight: .heavy, design: .monospaced))
                                    .foregroundColor(.white)
                            }
                            
                            Spacer()
                            
                            VStack(alignment: .trailing, spacing: 2) {
                                Text("ACTIVE PASS DURATION")
                                    .font(.system(size: 9, weight: .black))
                                    .foregroundColor(.white.opacity(0.6))
                                    .tracking(1.0)
                                
                                Text(formatDuration(seconds: activeDurationSeconds))
                                    .font(.system(size: 14, weight: .heavy, design: .monospaced))
                                    .foregroundColor(result.ageOver21 ? .green : .orange)
                            }
                        }
                    }
                    .padding(22)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 330)
                // 3D Perspective Tilt on Touch/Drag
                .rotation3DEffect(
                    .degrees(Double(-dragOffset.height / 14)),
                    axis: (x: 1, y: 0, z: 0)
                )
                .rotation3DEffect(
                    .degrees(Double(dragOffset.width / 14)),
                    axis: (x: 0, y: 1, z: 0)
                )
                .shadow(
                    color: (result.ageOver21 ? Color.green : Color.red).opacity(isTouching ? 0.35 : 0.15),
                    radius: isTouching ? 24 : 14,
                    x: 0,
                    y: 10
                )
                .padding(.horizontal)
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in
                            isTouching = true
                            dragOffset = value.translation
                        }
                        .onEnded { _ in
                            withAnimation(.spring(response: 0.45, dampingFraction: 0.65)) {
                                dragOffset = .zero
                                isTouching = false
                            }
                        }
                )
                .onTapGesture {
                    triggerCardTapAnimation()
                }
                
                // Anti-Spoof Instruction Pill
                HStack(spacing: 8) {
                    Image(systemName: "hand.tap.fill")
                        .foregroundColor(.accentColor)
                    Text("Touch, drag, or tilt card to verify live 3D hologram reflection")
                        .font(.caption.weight(.medium))
                        .foregroundColor(.secondary)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(Color(.secondarySystemBackground))
                .cornerRadius(20)
                
                // MARK: - Verification Details & Privacy Cards
                VStack(spacing: 14) {
                    // Verification Timestamp Card
                    HStack {
                        Image(systemName: "clock.badge.checkmark.fill")
                            .foregroundColor(.blue)
                            .font(.title3)
                            .frame(width: 32)
                        
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Initial Verification Timestamp")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text(result.timestamp.formatted(date: .abbreviated, time: .standard))
                                .font(.subheadline.bold())
                        }
                        
                        Spacer()
                        
                        Text("Fresh Token")
                            .font(.caption2.bold())
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.green.opacity(0.12))
                            .foregroundColor(.green)
                            .cornerRadius(8)
                    }
                    .padding()
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(16)
                    
                    // Zero-Retention Privacy Card
                    HStack {
                        Image(systemName: "lock.shield.fill")
                            .foregroundColor(.green)
                            .font(.title3)
                            .frame(width: 32)
                        
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Zero Data Retention Guarantee")
                                .font(.subheadline.bold())
                            Text("Only 'Age 21+' status was transmitted to the venue. Your street address, license number, and full birthday are never stored.")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        
                        Spacer()
                    }
                    .padding()
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(16)
                    
                    // Audit & Technical Diagnostics Button
                    Button(action: { showingAuditSheet = true }) {
                        HStack {
                            Image(systemName: "doc.text.magnifyingglass")
                            Text("View Cryptographic Audit & ISO 18013-5 Details")
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        .font(.subheadline.bold())
                        .foregroundColor(.primary)
                        .padding()
                        .background(Color(.secondarySystemBackground))
                        .cornerRadius(16)
                    }
                }
                .padding(.horizontal)
                
                // Dismiss / Return Button
                if let onDismiss = onDismiss {
                    Button(action: onDismiss) {
                        Text("Done")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color(.systemGray5))
                            .foregroundColor(.primary)
                            .cornerRadius(16)
                    }
                    .padding(.horizontal)
                    .padding(.top, 8)
                }
            }
            .padding(.top)
            .padding(.bottom, 60)
        }
        .navigationTitle("Verified Pass")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let onDismiss = onDismiss {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done", action: onDismiss)
                }
            }
        }
        .sheet(isPresented: $showingAuditSheet) {
            NavigationStack {
                ResultDetailView(result: result) {
                    showingAuditSheet = false
                }
            }
        }
        .onAppear {
            startContinuousAnimations()
        }
        .onReceive(timer) { input in
            currentTime = input
            activeDurationSeconds = max(0, Int(input.timeIntervalSince(result.timestamp)))
        }
    }
    
    // MARK: - Animation Helpers
    
    private func startContinuousAnimations() {
        // Continuous diagonal holographic shimmer
        withAnimation(.linear(duration: 3.5).repeatForever(autoreverses: false)) {
            shimmerPhase = 1.5
        }
        
        // Continuous rotating security watermark
        withAnimation(.linear(duration: 20.0).repeatForever(autoreverses: false)) {
            rotationAngle = 360.0
        }
        
        // Pulsing live indicator
        withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) {
            pulseScale = 1.3
        }
    }
    
    private func triggerCardTapAnimation() {
        #if canImport(UIKit)
        let impact = UIImpactFeedbackGenerator(style: .medium)
        impact.impactOccurred()
        #endif
        
        withAnimation(.easeInOut(duration: 0.18)) {
            shimmerPhase = -0.5
        }
        withAnimation(.linear(duration: 1.2)) {
            shimmerPhase = 1.5
        }
    }
    
    private func formatLiveTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss.S"
        return formatter.string(from: date)
    }
    
    private func formatDuration(seconds: Int) -> String {
        let m = seconds / 60
        let s = seconds % 60
        return String(format: "%02d:%02d", m, s)
    }
}

// MARK: - Customer Portrait Photo Badge

public struct CustomerPortraitPhotoBadge: View {
    public let attributes: IdentityAttributes
    public let isOver21: Bool
    
    public var body: some View {
        ZStack(alignment: .bottomTrailing) {
            // Photo Container Frame
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [Color(red: 0.2, green: 0.25, blue: 0.35), Color(red: 0.1, green: 0.15, blue: 0.22)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(width: 84, height: 104)
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(Color.white.opacity(0.35), lineWidth: 1.5)
                )
                .overlay(
                    // Portrait Avatar Graphics
                    VStack(spacing: 4) {
                        Image(systemName: attributes.portraitSymbol ?? "person.crop.circle.fill")
                            .font(.system(size: 42))
                            .foregroundColor(.white.opacity(0.9))
                        
                        Text(attributes.portraitInitials ?? "ID")
                            .font(.system(size: 11, weight: .black, design: .rounded))
                            .foregroundColor(.white.opacity(0.85))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.black.opacity(0.3))
                            .cornerRadius(4)
                    }
                )
            
            // Holographic DMV Corner Seal Stamped on Photo
            ZStack {
                Circle()
                    .fill(Color.black.opacity(0.7))
                    .frame(width: 28, height: 28)
                Circle()
                    .stroke(isOver21 ? Color.green : Color.red, lineWidth: 1.5)
                    .frame(width: 28, height: 28)
                Image(systemName: isOver21 ? "checkmark.seal.fill" : "exclamationmark.shield.fill")
                    .font(.system(size: 13))
                    .foregroundColor(isOver21 ? .green : .red)
            }
            .offset(x: 4, y: 4)
        }
    }
}

// MARK: - Rotating Security Seal Watermark

public struct RotatingSecuritySealView: View {
    public let rotationAngle: Double
    public let isOver21: Bool
    
    public var body: some View {
        ZStack {
            Circle()
                .stroke(isOver21 ? Color.green : Color.red, lineWidth: 2)
                .frame(width: 140, height: 140)
            
            Circle()
                .stroke(style: StrokeStyle(lineWidth: 1.5, dash: [4, 4]))
                .foregroundColor(Color.white.opacity(0.7))
                .frame(width: 124, height: 124)
            
            Image(systemName: isOver21 ? "checkmark.seal" : "shield.slash")
                .font(.system(size: 44, weight: .ultraLight))
                .foregroundColor(.white.opacity(0.6))
        }
        .rotationEffect(.degrees(rotationAngle))
    }
}

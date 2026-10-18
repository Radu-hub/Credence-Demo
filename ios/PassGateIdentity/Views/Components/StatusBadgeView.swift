import SwiftUI

public struct StatusBadgeView: View {
    public let decision: VerificationDecision
    
    public init(decision: VerificationDecision) {
        self.decision = decision
    }
    
    public var body: some View {
        HStack(spacing: 6) {
            Image(systemName: iconName)
                .font(.system(size: 13, weight: .bold))
            Text(decision.displayTitle)
                .font(.system(size: 13, weight: .bold))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(backgroundColor.opacity(0.15))
        .foregroundColor(backgroundColor)
        .cornerRadius(20)
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(backgroundColor.opacity(0.3), lineWidth: 1)
        )
    }
    
    private var iconName: String {
        switch decision {
        case .granted: return "checkmark.shield.fill"
        case .denied: return "xmark.shield.fill"
        case .pending: return "clock.fill"
        case .unknown: return "questionmark.shield.fill"
        }
    }
    
    private var backgroundColor: Color {
        switch decision {
        case .granted: return .green
        case .denied: return .red
        case .pending: return .orange
        case .unknown: return .gray
        }
    }
}

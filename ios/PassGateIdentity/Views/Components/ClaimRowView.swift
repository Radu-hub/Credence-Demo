import SwiftUI

public struct ClaimRowView: View {
    public let icon: String
    public let label: String
    public let value: String
    public let verified: Bool
    public var accentColor: Color = .blue
    
    public init(
        icon: String,
        label: String,
        value: String,
        verified: Bool = true,
        accentColor: Color = .blue
    ) {
        self.icon = icon
        self.label = label
        self.value = value
        self.verified = verified
        self.accentColor = accentColor
    }
    
    public var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(accentColor.opacity(0.12))
                    .frame(width: 36, height: 36)
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(accentColor)
            }
            
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text(value)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.primary)
            }
            
            Spacer()
            
            if verified {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                    Text("Verified")
                        .font(.caption2.bold())
                        .foregroundColor(.green)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.green.opacity(0.1))
                .cornerRadius(8)
            }
        }
        .padding(.vertical, 4)
    }
}

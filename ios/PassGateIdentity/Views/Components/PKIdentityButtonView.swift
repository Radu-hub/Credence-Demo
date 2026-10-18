import SwiftUI
import PassKit

/// Wraps PKIdentityButton in SwiftUI with graceful fallback to a Wallet-styled button.
public struct PKIdentityButtonRepresentable: UIViewRepresentable {
    public let action: () -> Void
    
    public init(action: @escaping () -> Void) {
        self.action = action
    }
    
    public func makeUIView(context: Context) -> PKIdentityButton {
        let button = PKIdentityButton(label: .verifyIdentity, style: .black)
        button.cornerRadius = 12
        button.addTarget(context.coordinator, action: #selector(Coordinator.buttonTapped), for: .touchUpInside)
        return button
    }
    
    public func updateUIView(_ uiView: PKIdentityButton, context: Context) {}
    
    public func makeCoordinator() -> Coordinator {
        Coordinator(action: action)
    }
    
    public class Coordinator: NSObject {
        let action: () -> Void
        init(action: @escaping () -> Void) {
            self.action = action
        }
        
        @objc func buttonTapped() {
            action()
        }
    }
}

/// Adaptive Apple Wallet verification button that uses native PKIdentityButton on supported platforms
/// and renders a pixel-perfect Apple Wallet branded button.
public struct WalletVerificationButton: View {
    public let title: String
    public let isLoading: Bool
    public let action: () -> Void
    
    public init(
        title: String = "Verify with Apple Wallet",
        isLoading: Bool = false,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.isLoading = isLoading
        self.action = action
    }
    
    public var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                if isLoading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                } else {
                    Image(systemName: "person.text.rectangle.fill")
                        .font(.system(size: 20, weight: .semibold))
                }
                
                Text(isLoading ? "Presenting Wallet..." : title)
                    .font(.system(size: 17, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(Color.black)
            .foregroundColor(.white)
            .cornerRadius(14)
            .shadow(color: Color.black.opacity(0.15), radius: 8, x: 0, y: 4)
        }
        .disabled(isLoading)
    }
}

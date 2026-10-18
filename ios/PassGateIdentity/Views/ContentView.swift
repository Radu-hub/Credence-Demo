import SwiftUI

public struct ContentView: View {
    @StateObject private var viewModel = VerificationViewModel()
    
    public init() {}
    
    public var body: some View {
        TabView {
            NavigationStack {
                VerificationView(viewModel: viewModel)
            }
            .tabItem {
                Label("Verify", systemImage: "person.badge.shield.checkmark.fill")
            }
            
            NavigationStack {
                HistoryView(viewModel: viewModel)
            }
            .tabItem {
                Label("Audit Log", systemImage: "clock.arrow.circlepath")
            }
            
            NavigationStack {
                DiagnosticsView(viewModel: viewModel)
            }
            .tabItem {
                Label("Diagnostics", systemImage: "stethoscope")
            }
        }
    }
}

// MARK: - Audit History View

struct HistoryView: View {
    @ObservedObject var viewModel: VerificationViewModel
    @State private var selectedResult: IdentityResult?
    
    var body: some View {
        List {
            if viewModel.recentResults.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "tray.fill")
                        .font(.system(size: 40))
                        .foregroundColor(.secondary.opacity(0.5))
                    Text("No Verifications Yet")
                        .font(.headline)
                        .foregroundColor(.secondary)
                    Text("Patron presentations verified via Apple Wallet or Simulator Mock will appear here.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.vertical, 40)
                .listRowBackground(Color.clear)
            } else {
                ForEach(viewModel.recentResults) { result in
                    Button(action: { selectedResult = result }) {
                        HStack(spacing: 12) {
                            Circle()
                                .fill(result.decision.isGranted ? Color.green : Color.red)
                                .frame(width: 10, height: 10)
                            
                            VStack(alignment: .leading, spacing: 3) {
                                Text(result.attributes.fullName)
                                    .font(.headline)
                                    .foregroundColor(.primary)
                                Text(result.reason)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                    .lineLimit(1)
                            }
                            
                            Spacer()
                            
                            VStack(alignment: .trailing, spacing: 2) {
                                StatusBadgeView(decision: result.decision)
                                Text(result.timestamp.formatted(date: .omitted, time: .shortened))
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
        }
        .navigationTitle("Audit Log")
        .sheet(item: $selectedResult) { res in
            NavigationStack {
                ResultDetailView(result: res) {
                    selectedResult = nil
                }
            }
        }
    }
}

// MARK: - Diagnostics View

struct DiagnosticsView: View {
    @ObservedObject var viewModel: VerificationViewModel
    
    var body: some View {
        List {
            Section(header: Text("Device & Platform")) {
                LabeledContent("Platform", value: "iOS Simulator / Device")
                LabeledContent("PassKit Availability", value: viewModel.isPassKitAvailableOnDevice ? "Enabled" : "Restricted")
                LabeledContent("Deployment Target", value: "iOS 17.0+")
            }
            
            Section(header: Text("In-App Identity Presentment Entitlement")) {
                LabeledContent("Entitlement Key", value: "com.apple.developer.in-app-identity-presentment")
                LabeledContent("Intent To Store", value: "willNotStore")
                LabeledContent("Age Threshold", value: ".age(atLeast: 21)")
            }
            
            Section(header: Text("PassGate Backend")) {
                LabeledContent("API Host", value: viewModel.backendURL)
                LabeledContent("Server Status", value: viewModel.backendService.isConnected ? "Online" : "Unreachable")
                if viewModel.backendService.isConnected {
                    LabeledContent("Latency", value: "\(viewModel.backendService.lastLatencyMs) ms")
                }
            }
        }
        .navigationTitle("Diagnostics")
    }
}

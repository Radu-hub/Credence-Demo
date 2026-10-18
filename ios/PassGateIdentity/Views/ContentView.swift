import SwiftUI

public struct ContentView: View {
    @StateObject private var viewModel = VerificationViewModel()
    @State private var selectedTab: Int = (CommandLine.arguments.contains("--preview-pass") || CommandLine.arguments.contains("--preview-minor")) ? 1 : 0
    
    public init() {}
    
    public var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                VerificationView(viewModel: viewModel)
            }
            .tabItem {
                Label("My ID", systemImage: "wallet.pass.fill")
            }
            .tag(0)
            
            NavigationStack {
                ActivePassTabView(viewModel: viewModel, onGoToVerify: {
                    selectedTab = 0
                })
            }
            .tabItem {
                Label("Live Pass", systemImage: "person.badge.shield.checkmark.fill")
            }
            .tag(1)
            
            NavigationStack {
                HistoryView(viewModel: viewModel)
            }
            .tabItem {
                Label("Pass History", systemImage: "clock.arrow.circlepath")
            }
            .tag(2)
        }
    }
}

// MARK: - Active Pass Tab View

struct ActivePassTabView: View {
    @ObservedObject var viewModel: VerificationViewModel
    let onGoToVerify: () -> Void
    
    var body: some View {
        Group {
            if let result = viewModel.latestVerifiedResult {
                VerifiedPassView(result: result)
            } else {
                VStack(spacing: 20) {
                    ZStack {
                        Circle()
                            .fill(Color.blue.opacity(0.12))
                            .frame(width: 80, height: 80)
                        Image(systemName: "person.badge.shield.checkmark")
                            .font(.system(size: 38))
                            .foregroundColor(.blue)
                    }
                    
                    Text("No Live Pass Active")
                        .font(.title3.bold())
                    
                    Text("When a venue requests age verification, present your digital ID via Apple Wallet to generate an interactive, anti-fraud security pass.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                    
                    VStack(spacing: 12) {
                        Button(action: onGoToVerify) {
                            HStack {
                                Image(systemName: "wallet.pass.fill")
                                Text("Go to My ID & Verify")
                            }
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.blue)
                            .foregroundColor(.white)
                            .cornerRadius(14)
                        }
                        
                        HStack(spacing: 10) {
                            Button(action: {
                                viewModel.executeVerification(for: SimulatorPersona.johnAppleseed)
                            }) {
                                HStack(spacing: 6) {
                                    Image(systemName: "checkmark.seal.fill")
                                    Text("Test Legal (21+)")
                                }
                                .font(.caption.bold())
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .background(Color.green.opacity(0.15))
                                .foregroundColor(.green)
                                .cornerRadius(10)
                            }
                            
                            Button(action: {
                                viewModel.executeVerification(for: SimulatorPersona.janeDoe)
                            }) {
                                HStack(spacing: 6) {
                                    Image(systemName: "xmark.seal.fill")
                                    Text("Test Minor (<21)")
                                }
                                .font(.caption.bold())
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .background(Color.red.opacity(0.15))
                                .foregroundColor(.red)
                                .cornerRadius(10)
                            }
                        }
                    }
                    .padding(.horizontal, 32)
                    .padding(.top, 8)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(.systemGroupedBackground))
                .navigationTitle("Live Pass")
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
                    Text("No Passes Yet")
                        .font(.headline)
                        .foregroundColor(.secondary)
                    Text("Presentations verified via Apple Wallet or Simulator Mock will appear here.")
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
                                Text(result.venue?.name ?? result.attributes.fullName)
                                    .font(.headline)
                                    .foregroundColor(.primary)
                                Text(result.decision.isGranted ? "Age 21+ Verified" : "Under 21 (Denied)")
                                    .font(.caption)
                                    .foregroundColor(result.decision.isGranted ? .green : .red)
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
        .navigationTitle("Pass History")
        .sheet(item: $selectedResult) { res in
            NavigationStack {
                VerifiedPassView(result: res) {
                    selectedResult = nil
                }
            }
        }
    }
}

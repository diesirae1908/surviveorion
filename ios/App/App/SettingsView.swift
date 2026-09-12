import SafariServices
import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var dailyOn = PreferencesStore.dailyNotification
    @State private var streakOn = PreferencesStore.streakAtRisk
    @State private var callsign = ""
    @State private var password = ""
    @State private var busy = false
    @State private var message: String?
    @State private var confirmDelete = false
    @State private var showPrivacy = false

    var body: some View {
        Form {
            Section {
                Toggle("Daily Patrol reminder", isOn: $dailyOn)
                    .tint(OrionColor.hullGold)
                Toggle("Streak at risk (2 hours before midnight PT)", isOn: $streakOn)
                    .tint(OrionColor.hullGold)
            } header: {
                Text("Notifications")
            } footer: {
                Text("Reminders fire at midnight America/Los_Angeles, not your local midnight.")
            }

            Section {
                if model.isSignedIn, let name = model.callsign {
                    Text("Signed in as \(name)")
                        .foregroundStyle(OrionColor.starlight)
                    Button("Sign out") {
                        Task { await model.signOut() }
                    }
                    .frame(minHeight: OrionLayout.minTap)
                    Button("Delete account", role: .destructive) {
                        confirmDelete = true
                    }
                    .frame(minHeight: OrionLayout.minTap)
                } else {
                    TextField("Callsign", text: $callsign)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .frame(minHeight: OrionLayout.minTap)
                    SecureField("Password", text: $password)
                        .frame(minHeight: OrionLayout.minTap)
                    Button("Sign in") {
                        Task { await signIn() }
                    }
                    .disabled(busy || callsign.count < 3 || password.count < 6)
                    .frame(minHeight: OrionLayout.minTap)
                }
                if let message {
                    Text(message).foregroundStyle(OrionColor.alarm)
                }
            } header: {
                Text("Pilot")
            } footer: {
                Text("Callsign plus password recovers a web account. A fresh install is a new guest until you sign in.")
            }

            Section {
                Button("Privacy policy") { showPrivacy = true }
                    .frame(minHeight: OrionLayout.minTap)
            }
        }
        .scrollContentBackground(.hidden)
        .background(OrionColor.void.ignoresSafeArea())
        .navigationTitle("Settings")
        .onChange(of: dailyOn) { _, on in
            PreferencesStore.dailyNotification = on
            Task { await NotificationScheduler.reschedule() }
        }
        .onChange(of: streakOn) { _, on in
            PreferencesStore.streakAtRisk = on
            Task { await NotificationScheduler.reschedule() }
        }
        .confirmationDialog(
            "Delete this account and its scores?",
            isPresented: $confirmDelete,
            titleVisibility: .visible
        ) {
            Button("Delete account", role: .destructive) {
                Task {
                    do {
                        try await model.deleteAccount()
                        message = "Account deleted."
                    } catch {
                        message = error.localizedDescription
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .sheet(isPresented: $showPrivacy) {
            SafariSheet(url: URL(string: "https://surviveorion.com/privacy.html")!)
        }
    }

    private func signIn() async {
        busy = true
        defer { busy = false }
        do {
            try await model.signIn(callsign: callsign.trimmingCharacters(in: .whitespaces), password: password)
            password = ""
            message = nil
        } catch {
            message = error.localizedDescription
        }
    }
}

struct SafariSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}

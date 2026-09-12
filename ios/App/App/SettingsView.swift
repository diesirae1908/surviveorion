import AuthenticationServices
import SafariServices
import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var dailyOn = PreferencesStore.dailyNotification
    @State private var streakOn = PreferencesStore.streakAtRisk
    @State private var callsign = ""
    @State private var password = ""
    @State private var busy = false
    @State private var message: String?
    @State private var confirmDelete = false
    @State private var showPrivacy = false
    @State private var appeared = false
    @State private var showGoogle = false
    @State private var googleClientId = ""
    @State private var appleCoordinator = AppleSignInCoordinator()

    private var canSignIn: Bool { !busy && callsign.count >= 3 && password.count >= 6 }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                settingsTopBar
                notificationsSection
                pilotSection
                privacySection
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .background(OrionColor.void.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .opacity(appeared ? 1 : 0)
        .onAppear {
            withAnimation(OrionMotion.screen) { appeared = true }
            appleCoordinator.onToken = { token, name in
                Task { await signInApple(token: token, name: name) }
            }
            appleCoordinator.onError = { message = $0 }
            Task {
                if let cfg = try? await APIClient.shared.config() {
                    googleClientId = cfg.googleClientId
                }
            }
        }
        .sheet(isPresented: $showGoogle) {
            GoogleSignInHost(
                clientId: googleClientId,
                onToken: { token in
                    showGoogle = false
                    Task { await signInGoogle(token: token) }
                },
                onCancel: { showGoogle = false }
            )
        }
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

    private var settingsTopBar: some View {
        ZStack {
            Text("Settings")
                .font(OrionFont.display(28))
                .foregroundStyle(OrionColor.starlight)
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(OrionColor.hullGold)
                        .frame(width: OrionLayout.minTap, height: OrionLayout.minTap)
                        .background(OrionColor.deepSpace, in: ChamferedRectangle(chamfer: 8))
                        .overlay {
                            ChamferedRectangle(chamfer: 8)
                                .strokeBorder(OrionColor.hullLine, lineWidth: 1)
                        }
                }
                .accessibilityLabel("Back")
                Spacer()
            }
        }
        .frame(minHeight: OrionLayout.minTap)
    }

    private var notificationsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("NOTIFICATIONS")
                .font(OrionFont.body(13, weight: .bold))
                .foregroundStyle(OrionColor.bronze)
                .tracking(2)
            ChamferedPanel(padding: 4) {
                VStack(spacing: 0) {
                    Toggle("Daily Patrol reminder", isOn: $dailyOn)
                        .toggleStyle(OrionToggleStyle())
                        .padding(.horizontal, 12)
                    hairline
                    Toggle("Streak at risk (2 hours before midnight PT)", isOn: $streakOn)
                        .toggleStyle(OrionToggleStyle())
                        .padding(.horizontal, 12)
                }
            }
            Text("Reminders fire at midnight America/Los_Angeles, not your local midnight.")
                .font(OrionFont.body(13))
                .foregroundStyle(OrionColor.dust)
        }
    }

    private var pilotSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("PILOT")
                .font(OrionFont.body(13, weight: .bold))
                .foregroundStyle(OrionColor.bronze)
                .tracking(2)
            ChamferedPanel {
                VStack(alignment: .leading, spacing: 12) {
                    if model.isSignedIn, let name = model.callsign {
                        HStack(spacing: 8) {
                            Text("Signed in as")
                                .font(OrionFont.body(16))
                                .foregroundStyle(OrionColor.starlight)
                            Text(name.uppercased())
                                .font(OrionFont.body(12, weight: .bold))
                                .foregroundStyle(OrionColor.starlight)
                                .tracking(2)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .overlay {
                                    ChamferedRectangle(chamfer: 8)
                                        .strokeBorder(OrionColor.bronze, lineWidth: 1)
                                }
                        }
                        .frame(minHeight: OrionLayout.minTap)
                        Button("Sign out") {
                            Task { await model.signOut() }
                        }
                        .buttonStyle(OrionButtonStyle(kind: .secondary))
                        Button("Delete account") {
                            confirmDelete = true
                        }
                        .buttonStyle(OrionButtonStyle(kind: .destructive))
                    } else {
                        SignInWithAppleRepresentable {
                            appleCoordinator.start()
                        }
                        .frame(height: 44)
                        .frame(maxWidth: .infinity)
                        if !googleClientId.isEmpty {
                            Button("Sign in with Google") {
                                showGoogle = true
                            }
                            .buttonStyle(OrionButtonStyle(kind: .secondary))
                        }
                        OrionField(title: "Callsign", text: $callsign)
                        OrionField(title: "Password", text: $password, secure: true)
                        Button("Sign in") {
                            Task { await signIn() }
                        }
                        .buttonStyle(OrionButtonStyle(kind: .primary, enabled: canSignIn))
                        .disabled(!canSignIn)
                    }
                    if let message {
                        Text(message)
                            .font(OrionFont.body(15))
                            .foregroundStyle(OrionColor.alarm)
                    }
                }
            }
            Text("Callsign plus password recovers a web account. A fresh install is a new guest until you sign in.")
                .font(OrionFont.body(13))
                .foregroundStyle(OrionColor.dust)
        }
    }

    private var privacySection: some View {
        Button { showPrivacy = true } label: {
            HStack {
                Text("PRIVACY POLICY")
                    .font(OrionFont.body(13, weight: .bold))
                    .foregroundStyle(OrionColor.hullGold)
                    .tracking(2)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(OrionColor.bronze)
            }
            .frame(minHeight: OrionLayout.minTap)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16)
        .background(OrionColor.deepSpace, in: ChamferedRectangle(chamfer: 12))
        .overlay {
            ChamferedRectangle(chamfer: 12)
                .strokeBorder(OrionColor.hullLine, lineWidth: 1.5)
        }
    }

    private var hairline: some View {
        Rectangle()
            .fill(OrionColor.hullLine.opacity(0.40))
            .frame(height: 1)
            .padding(.horizontal, 12)
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

    private func signInGoogle(token: String) async {
        busy = true
        defer { busy = false }
        do {
            try await model.signInWithGoogle(idToken: token)
            message = nil
        } catch {
            message = error.localizedDescription
        }
    }

    private func signInApple(token: String, name: String?) async {
        busy = true
        defer { busy = false }
        do {
            try await model.signInWithApple(identityToken: token, name: name)
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

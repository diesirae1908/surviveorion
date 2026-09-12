import Foundation
import SwiftUI

enum PremiumContext: String, Identifiable {
    case calendar
    case analytics
    case squadrons
    case generic

    var id: String { rawValue }

    var subhead: String {
        switch self {
        case .calendar: return "Every day you've flown, always open."
        case .analytics: return "See your whole record, not just today."
        case .squadrons: return "Race your wingmates, not strangers."
        case .generic: return "Unlock the full patrol record."
        }
    }
}

struct PlayLaunch: Identifiable, Equatable {
    var mode: PlayMode
    var date: String? = nil

    var id: String { "\(mode.rawValue)-\(date ?? "today")" }
}

@MainActor
final class AppModel: ObservableObject {
    @Published var callsign: String?
    @Published var board: DailyBoard?
    @Published var online = true
    @Published var attemptsLeft = 3
    @Published var lastError: String?
    @Published var lastResult: GameResult?
    @Published var isSignedIn = false
    @Published var pendingPlay: PlayMode?
    @Published var pendingPlayDate: String?
    @Published var pendingSettings = false
    @Published var pendingBoard = false
    @Published var pendingGameOver = false
    @Published var pendingShare = false
    @Published var pendingCalendar = false
    @Published var pendingPremium: PremiumContext?
    @Published var pendingFeedback = false
    @Published var pendingWingmates = false
    @Published var pendingAnalytics = false
    @Published var serverTier: AccountTier = .free
    @Published var pendingFriends = 0
    @Published var joinedAt: Date?
    @Published var clipInbox = false
    @Published var premiumToast = false
    @Published var qaPremium = false
    @Published var store = StoreKitManager()

    var mutators: [MutatorLine] { MutatorCatalog.today() }
    var topEntry: DailyBoardEntry? { board?.entries.first }
    var myBest: Int? { board?.me?.best }
    var myRank: Int? { board?.me?.rank }

    var tier: AccountTier {
        if serverTier == .admin || clipInbox { return .admin }
        if serverTier == .premium || store.entitled || PreferencesStore.localPremiumActive || qaPremium {
            return .premium
        }
        return .free
    }

    var isPremium: Bool { tier == .premium || tier == .admin }
    var isAdmin: Bool { tier == .admin }

    func refresh() async {
        attemptsLeft = PreferencesStore.attemptsLeft()
        isSignedIn = KeychainStore.token != nil
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-QAPremium") {
            qaPremium = true
        }
        #endif
        do {
            board = try await APIClient.shared.dailyBoard()
            online = true
            lastError = nil
            if KeychainStore.token != nil {
                do {
                    let me = try await APIClient.shared.me()
                    callsign = me.user.callsign
                    isSignedIn = true
                    pendingFriends = me.pendingFriends ?? 0
                    clipInbox = me.clipInbox ?? false
                    if let raw = me.tier, let t = AccountTier(rawValue: raw) {
                        serverTier = t
                    } else {
                        serverTier = clipInbox ? .admin : .free
                    }
                    if let ms = me.joinedAt {
                        joinedAt = Date(timeIntervalSince1970: ms / (ms > 10_000_000_000 ? 1000 : 1))
                    }
                } catch APIError.unauthorized {
                    KeychainStore.token = nil
                    callsign = nil
                    isSignedIn = false
                    serverTier = .free
                    clipInbox = false
                    pendingFriends = 0
                }
            } else {
                serverTier = .free
                clipInbox = false
                pendingFriends = 0
            }
        } catch APIError.offline {
            online = false
            lastError = "Can't reach patrol command. Training Ground is open offline."
        } catch {
            lastError = error.localizedDescription
        }
        await store.refresh()
    }

    func signIn(callsign: String, password: String) async throws {
        let r = try await APIClient.shared.login(callsign: callsign, password: password)
        applyLogin(r)
        await refresh()
    }

    func signInWithGoogle(idToken: String) async throws {
        let r = try await APIClient.shared.googleSignIn(idToken: idToken, country: guessCountry())
        applyLogin(r)
        await refresh()
    }

    func signInWithApple(identityToken: String, name: String?) async throws {
        let r = try await APIClient.shared.appleSignIn(
            identityToken: identityToken,
            name: name,
            country: guessCountry()
        )
        applyLogin(r)
        await refresh()
    }

    private func applyLogin(_ r: LoginResponse) {
        KeychainStore.token = r.token
        callsign = r.user.callsign
        isSignedIn = true
    }

    private func guessCountry() -> String {
        Locale.current.region?.identifier ?? ""
    }

    func signOut() async {
        await APIClient.shared.logout()
        KeychainStore.token = nil
        callsign = nil
        isSignedIn = false
        serverTier = .free
        clipInbox = false
        pendingFriends = 0
        await refresh()
    }

    func deleteAccount() async throws {
        try await APIClient.shared.deleteAccount()
        KeychainStore.clearSession()
        callsign = nil
        isSignedIn = false
        serverTier = .free
        clipInbox = false
        await refresh()
    }

    func applyBridgeSession(token: String?, guestSecret: String?, dailyAttempts: String?) {
        if let token, !token.isEmpty { KeychainStore.token = token }
        if let guestSecret, !guestSecret.isEmpty { KeychainStore.guestSecret = guestSecret }
        PreferencesStore.applyWebAttemptsJSON(dailyAttempts)
        attemptsLeft = PreferencesStore.attemptsLeft()
        isSignedIn = KeychainStore.token != nil
    }

    func showPremiumToast() {
        premiumToast = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) { [weak self] in
            self?.premiumToast = false
        }
    }
}

struct GameResult: Equatable {
    var mode: PlayMode
    var score: Int
    var timeSurvived: Double
    var kills: Int
    var medal: String?
    var sharePng: Data?
    var callsign: String?
    var clipData: Data? = nil
    var clipBasename: String? = nil
    var clipSidecar: String? = nil
    var clipExt: String? = nil
}

enum PlayMode: String {
    case daily
    case training
}

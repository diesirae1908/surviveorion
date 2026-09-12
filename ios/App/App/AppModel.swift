import Foundation
import SwiftUI

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
    @Published var pendingSettings = false
    @Published var pendingBoard = false
    @Published var pendingGameOver = false

    var mutators: [MutatorLine] { MutatorCatalog.today() }
    var topEntry: DailyBoardEntry? { board?.entries.first }
    var myBest: Int? { board?.me?.best }
    var myRank: Int? { board?.me?.rank }

    func refresh() async {
        attemptsLeft = PreferencesStore.attemptsLeft()
        isSignedIn = KeychainStore.token != nil
        do {
            board = try await APIClient.shared.dailyBoard()
            online = true
            lastError = nil
            if KeychainStore.token != nil {
                do {
                    let me = try await APIClient.shared.me()
                    callsign = me.user.callsign
                    isSignedIn = true
                } catch APIError.unauthorized {
                    KeychainStore.token = nil
                    callsign = nil
                    isSignedIn = false
                }
            }
        } catch APIError.offline {
            online = false
            lastError = "Can't reach patrol command. Training Ground is open offline."
        } catch {
            lastError = error.localizedDescription
        }
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
        await refresh()
    }

    func deleteAccount() async throws {
        try await APIClient.shared.deleteAccount()
        KeychainStore.clearSession()
        callsign = nil
        isSignedIn = false
        await refresh()
    }

    func applyBridgeSession(token: String?, guestSecret: String?, dailyAttempts: String?) {
        if let token, !token.isEmpty { KeychainStore.token = token }
        if let guestSecret, !guestSecret.isEmpty { KeychainStore.guestSecret = guestSecret }
        PreferencesStore.applyWebAttemptsJSON(dailyAttempts)
        attemptsLeft = PreferencesStore.attemptsLeft()
        isSignedIn = KeychainStore.token != nil
    }
}

struct GameResult: Equatable {
    var mode: PlayMode
    var score: Int
    var timeSurvived: Double
    var kills: Int
    var medal: String?
    var sharePng: Data?
}

enum PlayMode: String {
    case daily
    case training
}

import AuthenticationServices
import SwiftUI
import UIKit

struct GoogleSignInHost: UIViewControllerRepresentable {
    var clientId: String
    var iosClientId: String?
    var onToken: (String) -> Void
    var onCancel: () -> Void

    func makeUIViewController(context: Context) -> GoogleSignInController {
        let vc = GoogleSignInController()
        vc.clientId = clientId
        vc.iosClientId = iosClientId
        vc.onToken = onToken
        vc.onCancel = onCancel
        return vc
    }

    func updateUIViewController(_ vc: GoogleSignInController, context: Context) {
        vc.clientId = clientId
        vc.iosClientId = iosClientId
        vc.onToken = onToken
        vc.onCancel = onCancel
    }
}

/// Google OAuth only. Never loads the live game (no Daily attempt spend).
///
/// Runs the flow in `ASWebAuthenticationSession` (a system-managed browser context)
/// instead of an embedded `WKWebView`. Google's login pages block WKWebView's user
/// agent outright (403 disallowed_useragent), which is what broke Google sign-in in
/// the TestFlight build. `ASWebAuthenticationSession` presents as Google's own
/// first-party page and can share the device's existing Google session
/// (`prefersEphemeralWebBrowserSession = false`).
///
/// The prior flow's redirect_uri was `https://surviveorion.com/`, which only a Web
/// type OAuth client accepts, and `ASWebAuthenticationSession` cannot intercept an
/// `https` redirect without an associated domain (iOS 17.4's `.https(host:path:)`
/// callback), which needs a server-hosted apple-app-site-association file (out of
/// scope, no server change). A bare custom scheme on the Web client also doesn't
/// work: Google's Web client type rejects non-https redirect URIs outright
/// (redirect_uri_mismatch). The standard fix is a separate Google Cloud OAuth
/// client of type "iOS", whose redirect is always the reversed client id as a
/// custom URL scheme (e.g. `123-abc.apps.googleusercontent.com` becomes
/// `com.googleusercontent.apps.123-abc`), which Google accepts without an explicit
/// redirect allowlist entry. `iosClientId` comes from `/api/config`
/// (`googleIosClientId`, server env `GOOGLE_IOS_CLIENT_ID`) once Lucas creates
/// that client; the scheme is derived from it at runtime below, falling back to
/// the existing web `clientId` (current behavior) when the iOS client isn't
/// configured yet, in which case sign-in will still fail until it is. See the
/// `CFBundleURLTypes` placeholder entry in `Info.plist` and the JOURNAL for the
/// one manual step (drop in the real client number) once that client exists.
final class GoogleSignInController: UIViewController, ASWebAuthenticationPresentationContextProviding {
    var clientId = ""
    var iosClientId: String?
    var onToken: ((String) -> Void)?
    var onCancel: (() -> Void)?

    private var finished = false
    private var session: ASWebAuthenticationSession?
    private let nonce = UUID().uuidString.replacingOccurrences(of: "-", with: "")

    private var effectiveClientId: String {
        if let iosClientId, !iosClientId.isEmpty { return iosClientId }
        return clientId
    }

    /// Google's "iOS" OAuth client type always redirects to the reversed client id
    /// as a custom URL scheme. Built at runtime from whichever client id is in
    /// play so nothing beyond the fixed `oauth2redirect` path is hardcoded.
    private var redirectScheme: String? {
        let suffix = ".apps.googleusercontent.com"
        guard effectiveClientId.hasSuffix(suffix) else { return nil }
        let prefix = effectiveClientId.dropLast(suffix.count)
        guard !prefix.isEmpty else { return nil }
        return "com.googleusercontent.apps.\(prefix)"
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 10 / 255, green: 10 / 255, blue: 18 / 255, alpha: 1)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard session == nil else { return }
        startOAuth()
    }

    private func startOAuth() {
        guard let scheme = redirectScheme else {
            cancelTapped()
            return
        }
        let redirectUri = "\(scheme):/oauth2redirect"
        var comps = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        comps.queryItems = [
            URLQueryItem(name: "client_id", value: effectiveClientId),
            URLQueryItem(name: "redirect_uri", value: redirectUri),
            URLQueryItem(name: "response_type", value: "id_token"),
            URLQueryItem(name: "scope", value: "openid email profile"),
            URLQueryItem(name: "nonce", value: nonce),
            URLQueryItem(name: "prompt", value: "select_account"),
        ]
        guard let url = comps.url else {
            cancelTapped()
            return
        }
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] callbackURL, error in
            guard let self else { return }
            if let callbackURL, let token = self.idToken(from: callbackURL) {
                self.finish(token: token)
                return
            }
            self.cancelTapped()
        }
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        self.session = session
        session.start()
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        view.window ?? UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow } ?? UIWindow()
    }

    @objc private func cancelTapped() {
        guard !finished else { return }
        finished = true
        onCancel?()
    }

    private func idToken(from url: URL) -> String? {
        let blob = (url.fragment ?? "") + "&" + (url.query ?? "")
        for part in blob.split(separator: "&") {
            let kv = part.split(separator: "=", maxSplits: 1).map(String.init)
            if kv.count == 2, kv[0] == "id_token" {
                return kv[1].removingPercentEncoding
            }
        }
        return nil
    }

    private func finish(token: String) {
        guard !finished else { return }
        finished = true
        onToken?(token)
    }
}

struct SignInWithAppleRepresentable: UIViewRepresentable {
    var onTap: () -> Void

    func makeUIView(context: Context) -> ASAuthorizationAppleIDButton {
        let button = ASAuthorizationAppleIDButton(type: .signIn, style: .white)
        button.cornerRadius = 8
        button.addTarget(context.coordinator, action: #selector(Coordinator.tapped), for: .touchUpInside)
        return button
    }

    func updateUIView(_ uiView: ASAuthorizationAppleIDButton, context: Context) {
        context.coordinator.onTap = onTap
    }

    func makeCoordinator() -> Coordinator { Coordinator(onTap: onTap) }

    final class Coordinator: NSObject {
        var onTap: () -> Void
        init(onTap: @escaping () -> Void) { self.onTap = onTap }
        @objc func tapped() { onTap() }
    }
}

final class AppleSignInCoordinator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    var onToken: ((String, String?) -> Void)?
    var onError: ((String) -> Void)?

    func start() {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow } ?? UIWindow()
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential,
              let data = cred.identityToken,
              let token = String(data: data, encoding: .utf8)
        else {
            onError?("Apple did not return an identity token.")
            return
        }
        var name: String?
        if let full = cred.fullName {
            let formatted = [full.givenName, full.familyName].compactMap { $0 }.joined(separator: " ")
            if !formatted.isEmpty { name = formatted }
        }
        onToken?(token, name)
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        if let e = error as? ASAuthorizationError, e.code == .canceled { return }
        onError?(error.localizedDescription)
    }
}

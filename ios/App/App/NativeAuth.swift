import AuthenticationServices
import SwiftUI
import UIKit
import WebKit

struct GoogleSignInHost: UIViewControllerRepresentable {
    var clientId: String
    var onToken: (String) -> Void
    var onCancel: () -> Void

    func makeUIViewController(context: Context) -> GoogleSignInController {
        let vc = GoogleSignInController()
        vc.clientId = clientId
        vc.onToken = onToken
        vc.onCancel = onCancel
        return vc
    }

    func updateUIViewController(_ vc: GoogleSignInController, context: Context) {
        vc.clientId = clientId
        vc.onToken = onToken
        vc.onCancel = onCancel
    }
}

/// Google OAuth only. Never loads the live game (no Daily attempt spend).
final class GoogleSignInController: UIViewController, WKNavigationDelegate {
    var clientId = ""
    var onToken: ((String) -> Void)?
    var onCancel: (() -> Void)?

    private var webView: WKWebView!
    private var finished = false
    private let nonce = UUID().uuidString.replacingOccurrences(of: "-", with: "")

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 10 / 255, green: 10 / 255, blue: 18 / 255, alpha: 1)

        let bar = UIToolbar()
        bar.barStyle = .black
        bar.translatesAutoresizingMaskIntoConstraints = false
        let cancel = UIBarButtonItem(title: "Cancel", style: .plain, target: self, action: #selector(cancelTapped))
        cancel.tintColor = UIColor(red: 1, green: 215 / 255, blue: 0, alpha: 1)
        bar.items = [cancel, .flexibleSpace()]
        view.addSubview(bar)

        let config = WKWebViewConfiguration()
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            bar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: bar.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        startOAuth()
    }

    private func startOAuth() {
        var comps = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        comps.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: "https://surviveorion.com/"),
            URLQueryItem(name: "response_type", value: "id_token"),
            URLQueryItem(name: "scope", value: "openid email profile"),
            URLQueryItem(name: "nonce", value: nonce),
            URLQueryItem(name: "prompt", value: "select_account"),
        ]
        guard let url = comps.url else { return }
        webView.load(URLRequest(url: url))
    }

    @objc private func cancelTapped() {
        guard !finished else { return }
        finished = true
        onCancel?()
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if let token = idToken(from: url) {
            decisionHandler(.cancel)
            finish(token: token)
            return
        }
        if let host = url.host?.lowercased() {
            if host.contains("google.") || host.contains("gstatic.com") || host.contains("googleapis.com")
                || host.contains("googleusercontent.com")
            {
                decisionHandler(.allow)
                return
            }
            if host == "surviveorion.com" || host.hasSuffix(".surviveorion.com") {
                decisionHandler(.cancel)
                if let token = idToken(from: url) {
                    finish(token: token)
                }
                return
            }
        }
        decisionHandler(.cancel)
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

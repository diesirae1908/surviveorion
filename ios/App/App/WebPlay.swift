import CoreMotion
import SafariServices
import SwiftUI
import UIKit
import WebKit

@MainActor
protocol PlayWebControllerDelegate: AnyObject {
    func playWebControllerDidUpdateResult(_ result: GameResult)
    func playWebControllerDidRequestAnalytics()
}

/// Serves bundled dist/ at capacitor://localhost so live CORS already allows API calls.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "capacitor"
    static let origin = "capacitor://localhost"

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }
        do {
            let file = try fileURL(for: url)
            let data = try Data(contentsOf: file)
            let mime = mimeType(for: file)
            let resp = URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: "utf-8")
            urlSchemeTask.didReceive(resp)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } catch {
            urlSchemeTask.didFailWithError(error)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private func fileURL(for url: URL) throws -> URL {
        guard let root = Bundle.main.url(forResource: "dist", withExtension: nil) else {
            throw URLError(.fileDoesNotExist)
        }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        if path.hasPrefix("/") { path.removeFirst() }
        if path.isEmpty { path = "index.html" }
        let file = root.appendingPathComponent(path)
        var isDir: ObjCBool = false
        if FileManager.default.fileExists(atPath: file.path, isDirectory: &isDir), isDir.boolValue {
            return file.appendingPathComponent("index.html")
        }
        if FileManager.default.fileExists(atPath: file.path) { return file }
        throw URLError(.fileDoesNotExist)
    }

    private func mimeType(for file: URL) -> String {
        switch file.pathExtension.lowercased() {
        case "html": return "text/html"
        case "js": return "text/javascript"
        case "css": return "text/css"
        case "json", "webmanifest": return "application/json"
        case "png": return "image/png"
        case "svg": return "image/svg+xml"
        case "ttf": return "font/ttf"
        case "woff2": return "font/woff2"
        case "mp3": return "audio/mpeg"
        case "map": return "application/json"
        default: return "application/octet-stream"
        }
    }
}

enum PlayExit {
    case quit
    case finished(GameResult)
}

final class PlayWebController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    /// Version the web side reads as `?shell=`. Bump only with a matching `minShell` plan.
    static let shellProtocol = 1

    var mode: PlayMode = .training
    var patrolDate: String? = nil
    var recordRuns = false
    var goldPatrol = false
    var onExit: ((PlayExit) -> Void)?
    var onSession: ((String?, String?, String?) -> Void)?
    var delegate: PlayWebControllerDelegate?
    var appModel: AppModel?

    /// Shell mode: one persistent WebView booted into the web lobby (`?shell=`), not a single run.
    var shell = false
    var sessions = 0
    var forceShell = false
    var onShellReady: (() -> Void)?
    var onShellFallback: ((String) -> Void)?
    var onOpenSettings: ((String?) -> Void)?
    var onOpenManageGold: (() -> Void)?
    var onOpenAnalytics: (() -> Void)?
    var onRequestReview: ((String) -> Void)?
    var onSignedOut: (() -> Void)?
    var onChrome: ((Bool) -> Void)?

    private var webView: WKWebView!
    private let handler = BundleSchemeHandler()
    private var finished = false
    private let motion = CMMotionManager()
    private var motionGranted = false
    private var shellURL: URL?
    private var chromePlaying = false
    private var shellReady = false

    /// Shell: status bar and edge swipes are only taken over while a run is on screen.
    override var prefersStatusBarHidden: Bool { shell ? chromePlaying : true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge {
        (shell && !chromePlaying) ? [] : .all
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 10 / 255, green: 10 / 255, blue: 18 / 255, alpha: 1)
        view.insetsLayoutMarginsFromSafeArea = false
        UIApplication.shared.isIdleTimerDisabled = !shell

        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(handler, forURLScheme: BundleSchemeHandler.scheme)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let page = WKWebpagePreferences()
        page.allowsContentJavaScript = true
        config.defaultWebpagePreferences = page
        config.userContentController.add(self, name: "orion")
        config.userContentController.addUserScript(WKUserScript(
            source: sessionInjection,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false
        webView.scrollView.contentInset = .zero
        webView.scrollView.scrollIndicatorInsets = .zero
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appWillResign),
            name: UIApplication.willResignActiveNotification,
            object: nil
        )

        var q: String
        if shell {
            let version = (appModel?.appVersion ?? "0")
                .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "0"
            q = "shell=\(Self.shellProtocol)&appv=\(version)&sessions=\(sessions)"
            if forceShell { q += "&shellForce=1" }
        } else {
            q = "nativePlay=\(mode.rawValue)"
            if let patrolDate, !patrolDate.isEmpty {
                q += "&date=\(patrolDate)"
            }
        }
        if goldPatrol { q += "&goldPatrol=1" }
        let args = ProcessInfo.processInfo.arguments
        if args.contains("-QAAutoStick") { q += "&nativeAuto=stick" }
        if args.contains("-QATiltConfirm") { q += "&nativeAuto=tiltconfirm" }
        let url = URL(string: "\(BundleSchemeHandler.origin)/index.html?\(q)")!
        if shell { shellURL = url }
        webView.load(URLRequest(url: url))
        if args.contains("-QAAutoLeave") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.8) { [weak self] in
                self?.finish(.quit)
            }
        }
        if args.contains("-QALandscape") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { [weak self] in
                self?.requestLandscape()
            }
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        syncViewport()
    }

    override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
        super.viewWillTransition(to: size, with: coordinator)
        coordinator.animate(alongsideTransition: { _ in
            self.view.layoutIfNeeded()
        }, completion: { _ in
            self.syncViewport()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { [weak self] in
                self?.syncViewport()
            }
        })
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        UIApplication.shared.isIdleTimerDisabled = false
        if isBeingDismissed || isMovingFromParent {
            teardown()
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    func teardown() {
        stopMotion()
        UIApplication.shared.isIdleTimerDisabled = false
        guard webView != nil else { return }
        webView.stopLoading()
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "orion")
        webView.loadHTMLString("", baseURL: nil)
        webView.removeFromSuperview()
        webView = nil
    }

    @objc private func appWillResign() {
        guard !finished, webView != nil else { return }
        webView.evaluateJavaScript("window.dispatchEvent(new Event('orion-native-pause'))", completionHandler: nil)
    }

    private func syncViewport() {
        guard let webView, webView.bounds.width > 1, webView.bounds.height > 1 else { return }
        let w = webView.bounds.width
        let h = webView.bounds.height
        let top = view.safeAreaInsets.top
        let right = view.safeAreaInsets.right
        let bottom = view.safeAreaInsets.bottom
        let left = view.safeAreaInsets.left
        let js = """
        (function(){
          window.__orionViewport = {w: \(w), h: \(h)};
          var r = document.documentElement;
          r.style.setProperty('--safe-top', '\(top)px');
          r.style.setProperty('--safe-right', '\(right)px');
          r.style.setProperty('--safe-bottom', '\(bottom)px');
          r.style.setProperty('--safe-left', '\(left)px');
          window.dispatchEvent(new Event('resize'));
        })();
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        syncViewport()
    }

    // MARK: Shell navigation policy

    private enum NavTarget {
        case bundle
        case external
        case blocked
    }

    /// Shell allowlist. Only the bundled page loads in the WebView; Stripe hosts are always
    /// refused (App Store 3.1.1: the app never shows a web checkout); a short list of
    /// legal and App Store pages opens in Safari; everything else is cancelled.
    private func classify(_ url: URL) -> NavTarget {
        let scheme = url.scheme?.lowercased() ?? ""
        let host = url.host?.lowercased() ?? ""
        if scheme == "about" { return .bundle }
        if scheme == BundleSchemeHandler.scheme && host == "localhost" { return .bundle }
        if host == "stripe.com" || host.hasSuffix(".stripe.com") { return .blocked }
        guard scheme == "https" else { return .blocked }
        let path = url.path
        if (host == "surviveorion.com" || host == "www.surviveorion.com") && path.hasPrefix("/privacy") {
            return .external
        }
        if host == "www.apple.com" && path.hasPrefix("/legal/") { return .external }
        if host == "apps.apple.com" { return .external }
        return .blocked
    }

    private func openExternal(_ url: URL) {
        guard presentedViewController == nil else { return }
        present(SFSafariViewController(url: url), animated: true)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard shell else {
            decisionHandler(.allow)
            return
        }
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        switch classify(url) {
        case .bundle:
            decisionHandler(.allow)
        case .external:
            decisionHandler(.cancel)
            openExternal(url)
        case .blocked:
            NSLog("ORION shell blocked navigation to %@", url.host ?? url.scheme ?? "?")
            decisionHandler(.cancel)
        }
    }

    /// `window.open` (the privacy link) does nothing in a WKWebView without this.
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if shell, let url = navigationAction.request.url {
            if classify(url) == .external {
                openExternal(url)
            } else {
                NSLog("ORION shell blocked window.open to %@", url.host ?? url.scheme ?? "?")
            }
        }
        return nil
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        // A policy-cancelled navigation (blocked link) also lands here; it is not a load failure.
        let ns = error as NSError
        if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return }
        if ns.domain == "WebKitErrorDomain" && ns.code == 102 { return }
        if shell && !shellReady { onShellFallback?("load-failed") }
    }

    /// iOS can kill the persistent WebView's content process under memory pressure.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard shell, let shellURL else { return }
        setChrome(playing: false)
        webView.load(URLRequest(url: shellURL))
    }

    // MARK: Shell bridge

    private func setChrome(playing: Bool) {
        guard shell, playing != chromePlaying else { return }
        chromePlaying = playing
        UIApplication.shared.isIdleTimerDisabled = playing
        setNeedsStatusBarAppearanceUpdate()
        setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
        onChrome?(playing)
    }

    /// Returns true when the message was a shell message and is fully handled.
    private func handleShellMessage(_ type: String, _ body: [String: Any]) -> Bool {
        switch type {
        case "shellReady":
            shellReady = true
            onShellReady?()
        case "shellFallback":
            onShellFallback?(body["reason"] as? String ?? "unspecified")
        case "openSettings":
            onOpenSettings?(body["section"] as? String)
        case "openManageGold":
            onOpenManageGold?()
        case "openAnalytics":
            onOpenAnalytics?()
        case "requestReview":
            onRequestReview?(body["reason"] as? String ?? "unspecified")
        case "chrome":
            setChrome(playing: (body["playing"] as? Bool) ?? false)
        case "signedOut":
            onSignedOut?()
        case "leave":
            break
        default:
            return false
        }
        return true
    }

    /// Tells the web shell the Gold state changed (purchase, restore, expiry).
    func pushTier(_ gold: Bool) {
        let js = "window.dispatchEvent(new CustomEvent('orion-native-tier', {detail:{gold:\(gold ? "true" : "false")}}));"
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    /// Re-syncs the Keychain session into the WebView after a native sign-in or out.
    /// The token goes straight into localStorage; the event only says "re-read it".
    func pushSession() {
        let js = """
        (function(){
          var t = \(Self.jsLiteral(KeychainStore.token));
          var g = \(Self.jsLiteral(KeychainStore.guestSecret));
          try {
            if (t) localStorage.setItem('orion.session', t); else localStorage.removeItem('orion.session');
            if (g) localStorage.setItem('orion.guestSecret', g);
          } catch (e) {}
          window.dispatchEvent(new CustomEvent('orion-native-session', {detail:{signedIn: t !== null}}));
        })();
        """
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    private static func jsLiteral(_ s: String?) -> String {
        guard let s else { return "null" }
        let escaped = s
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")
        return "'\(escaped)'"
    }

    private func requestLandscape() {
        guard let scene = view.window?.windowScene else { return }
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: .landscapeRight)) { _ in }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
            self?.syncViewport()
        }
    }

    private var sessionInjection: String {
        func jsString(_ s: String?) -> String { Self.jsLiteral(s) }
        let attempts = PreferencesStore.loadAttempts()
        let attemptsJSON: String
        if let data = try? JSONEncoder().encode(attempts), let s = String(data: data, encoding: .utf8) {
            attemptsJSON = jsString(s)
        } else {
            attemptsJSON = "null"
        }
        let record = recordRuns ? "true" : "false"
        let recMode = PreferencesStore.recordingMode ? "true" : "false"
        return """
        (function(){
          try {
            var t = \(jsString(KeychainStore.token));
            var g = \(jsString(KeychainStore.guestSecret));
            var a = \(attemptsJSON);
            if (t) localStorage.setItem('orion.session', t);
            if (g) localStorage.setItem('orion.guestSecret', g);
            if (a) localStorage.setItem('orion.dailyAttempts', a);
            var raw = localStorage.getItem('orion.settings');
            var s = {};
            try { s = raw ? JSON.parse(raw) : {}; } catch (e) { s = {}; }
            s.recordRuns = \(record);
            s.recordingMode = \(recMode);
            localStorage.setItem('orion.settings', JSON.stringify(s));
          } catch (e) {}
        })();
        """
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        if shell, handleShellMessage(type, body) { return }
        switch type {
        case "graze":
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case "death":
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        case "requestMotion":
            requestMotionFromUser()
        case "stopMotion":
            DispatchQueue.main.async { [weak self] in
                self?.stopMotion()
            }
        case "session":
            onSession?(
                body["token"] as? String,
                body["guestSecret"] as? String,
                body["dailyAttempts"] as? String
            )
        case "leave":
            finish(.quit)
        case "gameOver":
            var png: Data?
            if let b64 = body["sharePngBase64"] as? String, !b64.isEmpty {
                png = Data(base64Encoded: b64)
            }
            var clip: Data?
            if let b64 = body["clipBase64"] as? String, !b64.isEmpty {
                clip = Data(base64Encoded: b64)
            }
            let result = GameResult(
                mode: mode,
                score: intValue(body["score"]),
                timeSurvived: doubleValue(body["timeSurvived"]),
                kills: intValue(body["kills"]),
                medal: body["medal"] as? String,
                sharePng: png,
                callsign: body["callsign"] as? String,
                clipData: clip,
                clipBasename: body["clipBasename"] as? String,
                clipSidecar: body["clipSidecar"] as? String,
                clipExt: body["clipExt"] as? String,
                patrolDate: patrolDate,
                shareText: body["shareText"] as? String
            )
            DispatchQueue.main.async { [weak self] in
                self?.delegate?.playWebControllerDidUpdateResult(result)
            }
        case "premium":
            let raw = body["context"] as? String ?? "calendar"
            let ctx = PremiumContext(rawValue: raw) ?? .calendar
            DispatchQueue.main.async { [weak self] in
                self?.presentPremium(ctx)
            }
        case "share":
            let text = body["text"] as? String ?? ""
            var items: [Any] = [text]
            if let b64 = body["pngBase64"] as? String, let data = Data(base64Encoded: b64), let img = UIImage(data: data) {
                items.append(img)
            }
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                let av = UIActivityViewController(activityItems: items, applicationActivities: nil)
                if let pop = av.popoverPresentationController {
                    pop.sourceView = self.view
                    pop.sourceRect = CGRect(x: self.view.bounds.midX, y: self.view.bounds.midY, width: 1, height: 1)
                }
                self.present(av, animated: true)
            }
        case "openAnalytics":
            DispatchQueue.main.async { [weak self] in
                self?.delegate?.playWebControllerDidRequestAnalytics()
                self?.finish(.quit)
            }
        default:
            break
        }
    }

    private func finish(_ exit: PlayExit) {
        guard !finished else { return }
        finished = true
        stopMotion()
        DispatchQueue.main.async { [weak self] in
            self?.onExit?(exit)
        }
    }

    private func presentPremium(_ context: PremiumContext) {
        guard presentedViewController == nil, let appModel else { return }
        let host = UIHostingController(
            rootView: PremiumSheet(context: context) { [weak self] in
                self?.dismiss(animated: true)
            }
            .environmentObject(appModel)
        )
        host.modalPresentationStyle = .pageSheet
        present(host, animated: true)
    }

    private func requestMotionFromUser() {
        DispatchQueue.main.async { [weak self] in
            self?.startMotion()
        }
    }

    private func startMotion() {
        guard motion.isDeviceMotionAvailable else {
            postMotionGranted(false)
            return
        }
        motion.deviceMotionUpdateInterval = 1.0 / 60.0
        motion.startDeviceMotionUpdates(using: .xArbitraryZVertical, to: .main) { [weak self] data, error in
            guard let self, let att = data?.attitude, error == nil else { return }
            if !self.motionGranted {
                self.motionGranted = true
                self.postMotionGranted(true)
            }
            let beta = att.pitch * 180 / .pi
            let gamma = att.roll * 180 / .pi
            let js = """
            window.dispatchEvent(new CustomEvent('oriontilt', {detail:{beta:\(beta),gamma:\(gamma)}}));
            """
            self.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
            guard let self, !self.motionGranted else { return }
            if self.motion.isDeviceMotionActive {
                self.motionGranted = true
                self.postMotionGranted(true)
            } else {
                self.postMotionGranted(false)
            }
        }
    }

    private func postMotionGranted(_ ok: Bool) {
        let js = "window.dispatchEvent(new CustomEvent('orion-native-motion', {detail:{granted:\(ok ? "true" : "false")}}));"
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    private func stopMotion() {
        motion.stopDeviceMotionUpdates()
        motionGranted = false
    }

    private func intValue(_ v: Any?) -> Int {
        if let n = v as? Int { return n }
        if let n = v as? Double { return Int(n) }
        if let n = v as? NSNumber { return n.intValue }
        return 0
    }

    private func doubleValue(_ v: Any?) -> Double {
        if let n = v as? Double { return n }
        if let n = v as? Int { return Double(n) }
        if let n = v as? NSNumber { return n.doubleValue }
        return 0
    }
}

struct PlayView: UIViewControllerRepresentable {
    let launch: PlayLaunch
    var onExit: (PlayExit) -> Void
    @EnvironmentObject private var model: AppModel

    func makeUIViewController(context: Context) -> PlayWebController {
        let vc = PlayWebController()
        vc.mode = launch.mode
        vc.patrolDate = launch.date
        vc.recordRuns = model.isAdmin && PreferencesStore.recordRuns
        vc.goldPatrol = model.isPremium
        vc.appModel = model
        vc.delegate = PlayViewDelegate(model: model)
        vc.onExit = onExit
        vc.onSession = { token, secret, attempts in
            Task { @MainActor in
                model.applyBridgeSession(token: token, guestSecret: secret, dailyAttempts: attempts)
            }
        }
        return vc
    }

    func updateUIViewController(_ vc: PlayWebController, context: Context) {}

    static func dismantleUIViewController(_ vc: PlayWebController, coordinator: ()) {
        vc.teardown()
    }
}

/// Lets SwiftUI push native events (Gold state, session) into the shell WebView.
@MainActor
final class ShellChannel: ObservableObject {
    fileprivate weak var controller: PlayWebController?

    func pushTier(_ gold: Bool) { controller?.pushTier(gold) }
    func pushSession() { controller?.pushSession() }
    func isPresenting() -> Bool { controller?.presentedViewController != nil }
}

/// The web lobby (`?shell=`) in one persistent WebView. Callbacks are the native side of
/// the bridge: sheets, review prompt, chrome (status bar and swipes follow run state).
struct ShellView: UIViewControllerRepresentable {
    let channel: ShellChannel
    var onReady: () -> Void
    var onFallback: (String) -> Void
    var onOpenSettings: (String?) -> Void
    var onOpenManageGold: () -> Void
    var onOpenAnalytics: () -> Void
    var onRequestReview: (String) -> Void
    var onSignedOut: () -> Void
    var onChrome: (Bool) -> Void
    @EnvironmentObject private var model: AppModel

    func makeUIViewController(context: Context) -> PlayWebController {
        let vc = PlayWebController()
        vc.shell = true
        vc.sessions = NotificationScheduler.countSession()
        vc.forceShell = PreferencesStore.forceShell
        vc.recordRuns = model.isAdmin && PreferencesStore.recordRuns
        vc.goldPatrol = model.isPremium
        vc.appModel = model
        vc.delegate = PlayViewDelegate(model: model)
        vc.onSession = { token, secret, attempts in
            Task { @MainActor in
                model.applyBridgeSession(token: token, guestSecret: secret, dailyAttempts: attempts)
            }
        }
        channel.controller = vc
        wire(vc)
        return vc
    }

    func updateUIViewController(_ vc: PlayWebController, context: Context) {
        wire(vc)
    }

    static func dismantleUIViewController(_ vc: PlayWebController, coordinator: ()) {
        vc.teardown()
    }

    private func wire(_ vc: PlayWebController) {
        vc.onShellReady = onReady
        vc.onShellFallback = onFallback
        vc.onOpenSettings = onOpenSettings
        vc.onOpenManageGold = onOpenManageGold
        vc.onOpenAnalytics = onOpenAnalytics
        vc.onRequestReview = onRequestReview
        vc.onSignedOut = onSignedOut
        vc.onChrome = onChrome
    }
}

@MainActor
private final class PlayViewDelegate: NSObject, PlayWebControllerDelegate {
    private let model: AppModel

    init(model: AppModel) {
        self.model = model
    }

    func playWebControllerDidUpdateResult(_ result: GameResult) {
        model.lastResult = result
    }

    func playWebControllerDidRequestAnalytics() {
        model.pendingAnalytics = true
    }
}

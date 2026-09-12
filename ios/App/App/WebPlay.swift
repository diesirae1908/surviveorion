import CoreMotion
import SwiftUI
import UIKit
import WebKit

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

final class PlayWebController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {
    var mode: PlayMode = .training
    var onExit: ((PlayExit) -> Void)?
    var onSession: ((String?, String?, String?) -> Void)?

    private var webView: WKWebView!
    private let handler = BundleSchemeHandler()
    private var finished = false
    private let motion = CMMotionManager()
    private var motionGranted = false

    override var prefersStatusBarHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 10 / 255, green: 10 / 255, blue: 18 / 255, alpha: 1)
        view.insetsLayoutMarginsFromSafeArea = false
        UIApplication.shared.isIdleTimerDisabled = true

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

        var q = "nativePlay=\(mode.rawValue)"
        let args = ProcessInfo.processInfo.arguments
        if args.contains("-QAAutoStick") { q += "&nativeAuto=stick" }
        if args.contains("-QATiltConfirm") { q += "&nativeAuto=tiltconfirm" }
        let url = URL(string: "\(BundleSchemeHandler.origin)/index.html?\(q)")!
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

    private func requestLandscape() {
        guard let scene = view.window?.windowScene else { return }
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: .landscapeRight)) { _ in }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
            self?.syncViewport()
        }
    }

    private var sessionInjection: String {
        func jsString(_ s: String?) -> String {
            guard let s else { return "null" }
            let escaped = s
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
                .replacingOccurrences(of: "\n", with: "\\n")
            return "'\(escaped)'"
        }
        let attempts = PreferencesStore.loadAttempts()
        let attemptsJSON: String
        if let data = try? JSONEncoder().encode(attempts), let s = String(data: data, encoding: .utf8) {
            attemptsJSON = jsString(s)
        } else {
            attemptsJSON = "null"
        }
        return """
        (function(){
          try {
            var t = \(jsString(KeychainStore.token));
            var g = \(jsString(KeychainStore.guestSecret));
            var a = \(attemptsJSON);
            if (t) localStorage.setItem('orion.session', t);
            if (g) localStorage.setItem('orion.guestSecret', g);
            if (a) localStorage.setItem('orion.dailyAttempts', a);
          } catch (e) {}
        })();
        """
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
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
            let result = GameResult(
                mode: mode,
                score: intValue(body["score"]),
                timeSurvived: doubleValue(body["timeSurvived"]),
                kills: intValue(body["kills"]),
                medal: body["medal"] as? String,
                sharePng: png,
                callsign: body["callsign"] as? String
            )
            finish(.finished(result))
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
    let mode: PlayMode
    var onExit: (PlayExit) -> Void
    @EnvironmentObject private var model: AppModel

    func makeUIViewController(context: Context) -> PlayWebController {
        let vc = PlayWebController()
        vc.mode = mode
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

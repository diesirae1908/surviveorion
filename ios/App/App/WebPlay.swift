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
        case "map": return "application/json"
        default: return "application/octet-stream"
        }
    }
}

final class PlayWebController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {
    var mode: PlayMode = .training
    var onResult: ((GameResult) -> Void)?
    var onSession: ((String?, String?, String?) -> Void)?

    private var webView: WKWebView!
    private let handler = BundleSchemeHandler()
    private var finished = false

    override var prefersStatusBarHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 10 / 255, green: 10 / 255, blue: 18 / 255, alpha: 1)
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
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false
        view.addSubview(webView)

        let url = URL(string: "\(BundleSchemeHandler.origin)/index.html?nativePlay=\(mode.rawValue)")!
        webView.load(URLRequest(url: url))
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        UIApplication.shared.isIdleTimerDisabled = false
    }

    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "orion")
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
        case "session":
            onSession?(
                body["token"] as? String,
                body["guestSecret"] as? String,
                body["dailyAttempts"] as? String
            )
        case "gameOver":
            guard !finished else { return }
            finished = true
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
                sharePng: png
            )
            DispatchQueue.main.async { [weak self] in
                self?.onResult?(result)
            }
        default:
            break
        }
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
    var onFinished: (GameResult) -> Void
    @EnvironmentObject private var model: AppModel

    func makeUIViewController(context: Context) -> PlayWebController {
        let vc = PlayWebController()
        vc.mode = mode
        vc.onResult = onFinished
        vc.onSession = { token, secret, attempts in
            Task { @MainActor in
                model.applyBridgeSession(token: token, guestSecret: secret, dailyAttempts: attempts)
            }
        }
        return vc
    }

    func updateUIViewController(_ vc: PlayWebController, context: Context) {}
}

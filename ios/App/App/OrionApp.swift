import StoreKit
import SwiftUI
import UIKit

private enum ShellPhase {
    case loading
    case ready
    case fallback
}

/// Root of the app. Boots the web shell (bundled lobby v3 in one WebView) and waits for the
/// web side to say `shellReady`. Anything else (`shellFallback`, load failure, 8s of silence,
/// a `-QA` launch arg) lands on the SwiftUI Home, which is exactly the 1.1 experience.
private struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.requestReview) private var requestReview
    @State private var phase: ShellPhase = RootView.launchPhase
    @State private var playing = false
    @StateObject private var channel = ShellChannel()
    @State private var showSettings = false
    @State private var showManage = false
    @State private var showAnalytics = false
    @State private var premium: PremiumContext?

    private static var launchPhase: ShellPhase {
        ProcessInfo.processInfo.arguments.contains { $0.hasPrefix("-QA") } ? .fallback : .loading
    }

    var body: some View {
        ZStack {
            if phase == .fallback {
                NavigationStack {
                    HomeView()
                }
            } else {
                shellLayer
            }
        }
        .task {
            if phase != .fallback { await model.refresh() }
        }
        .task {
            guard phase == .loading else { return }
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            fallBack("timeout")
        }
    }

    private var shellLayer: some View {
        ZStack {
            OrionColor.void.ignoresSafeArea()
            ShellView(
                channel: channel,
                onReady: {
                    phase = .ready
                    channel.pushTier(model.isPremium)
                },
                onFallback: { reason in fallBack(reason) },
                onOpenSettings: { section in
                    switch section?.lowercased() {
                    case "pilot": model.pendingScrollPilot = true
                    case "crew": model.pendingScrollCrew = true
                    default: break
                    }
                    showSettings = true
                },
                onOpenManageGold: { showManage = true },
                onOpenAnalytics: {
                    if model.isPremium { showAnalytics = true } else { premium = .analytics }
                },
                onRequestReview: { reason in askReview(reason) },
                onSignedOut: { model.applyBridgeSignedOut() },
                onChrome: { playing = $0 }
            )
            .ignoresSafeArea()
            if phase == .loading {
                ZStack {
                    OrionColor.void.ignoresSafeArea()
                    Image("Splash")
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: 200)
                }
                .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: phase)
        .statusBarHidden(playing)
        .persistentSystemOverlays(playing ? .hidden : .automatic)
        .defersSystemGestures(on: playing ? .all : [])
        .sheet(isPresented: $showSettings, onDismiss: { channel.pushSession() }) {
            NavigationStack {
                SettingsView()
            }
        }
        .sheet(isPresented: $showManage) {
            ManageGoldPatrolView { showManage = false }
        }
        .sheet(isPresented: $showAnalytics) {
            NavigationStack {
                AnalyticsView()
            }
        }
        .sheet(item: $premium) { ctx in
            PremiumSheet(context: ctx) { premium = nil }
        }
        .onChange(of: model.isPremium) { _, gold in
            channel.pushTier(gold)
        }
    }

    private func fallBack(_ reason: String) {
        guard phase == .loading else { return }
        NSLog("ORION shell fallback: %@", reason)
        phase = .fallback
    }

    private func askReview(_ reason: String) {
        let busy = playing || showSettings || showManage || showAnalytics || premium != nil
        if model.approveReview(reason: reason, busy: busy, sceneActive: scenePhase == .active) {
            requestReview()
        }
    }
}

@main
struct OrionApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
            .preferredColorScheme(.dark)
            .tint(OrionColor.hullGold)
            .environmentObject(model)
            .onAppear {
                let args = ProcessInfo.processInfo.arguments
                let qaPlay = args.contains("-QAPlay")
                let qaSession = qaPlay
                    || args.contains("-QAPremium")
                    || args.contains("-QAPatrolComplete")
                    || args.contains("-QACrew")
                    || args.contains("-QAPreviewFree")
                if args.contains("-QAPatrolComplete") {
                    model.attemptsLeft = 0
                }
                if !qaSession {
                    NotificationScheduler.requestIfSecondSession()
                }
                if let i = args.firstIndex(of: "-QAPlay"), args.indices.contains(i + 1) {
                    if args[i + 1] == "training" { model.pendingPlay = .training }
                    if args[i + 1] == "daily" { model.pendingPlay = .daily }
                    if args[i + 1] == "settings" { model.pendingSettings = true }
                    if args[i + 1] == "crew" {
                        model.qaCrew = true
                        model.pendingSettings = true
                        model.pendingScrollCrew = true
                    }
                    if args[i + 1] == "board" { model.pendingBoard = true }
                    if args[i + 1] == "gameover" { model.pendingGameOver = true }
                    if args[i + 1] == "gameover-archive" {
                        model.lastResult = GameResult(
                            mode: .daily,
                            score: 12840,
                            timeSurvived: 93,
                            kills: 27,
                            medal: "silver",
                            sharePng: nil,
                            patrolDate: PatrolDate.addCivilDays(PatrolDate.dateString(), -5)
                        )
                        model.pendingGameOverArchive = true
                        model.pendingGameOver = true
                    }
                    if args[i + 1] == "share" {
                        model.pendingGameOver = true
                        model.pendingShare = true
                    }
                    if args[i + 1] == "calendar" { model.pendingCalendar = true }
                    if args[i + 1] == "calendar-day" {
                        model.pendingCalendar = true
                        model.pendingQaDayDetail = true
                    }
                    if args[i + 1] == "calendar-launch" {
                        model.pendingCalendar = true
                        model.pendingQaDayDetail = true
                        model.pendingQaDayLaunch = true
                    }
                    if args[i + 1] == "premium" { model.pendingPremium = .calendar }
                    if args[i + 1] == "feedback" { model.pendingFeedback = true }
                    if args[i + 1] == "wingmates" { model.pendingWingmates = true }
                    if args[i + 1] == "analytics" { model.pendingAnalytics = true }
                }
            }
            .onOpenURL { url in
                guard url.scheme == "orion", url.host == "play" else { return }
                let part = url.pathComponents.last ?? url.query
                if part == "training" { model.pendingPlay = .training }
                if part == "daily" { model.pendingPlay = .daily }
            }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
                Task {
                    await NotificationScheduler.reschedule()
                    await model.refresh()
                }
            }
        }
    }
}

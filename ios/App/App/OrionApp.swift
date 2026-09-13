import SwiftUI
import UIKit

@main
struct OrionApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                HomeView()
            }
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
                    if args[i + 1] == "share" {
                        model.pendingGameOver = true
                        model.pendingShare = true
                    }
                    if args[i + 1] == "calendar" { model.pendingCalendar = true }
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

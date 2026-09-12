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
                if !qaPlay {
                    NotificationScheduler.requestIfSecondSession()
                }
                if let i = args.firstIndex(of: "-QAPlay"), args.indices.contains(i + 1) {
                    if args[i + 1] == "training" { model.pendingPlay = .training }
                    if args[i + 1] == "daily" { model.pendingPlay = .daily }
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

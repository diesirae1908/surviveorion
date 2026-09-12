import Foundation
import UserNotifications

enum NotificationScheduler {
    static let dailyId = "orion.daily-patrol"
    static let streakId = "orion.streak-at-risk"

    private static var countedThisLaunch = false

    static func requestIfSecondSession() {
        if !countedThisLaunch {
            PreferencesStore.sessionCount += 1
            countedThisLaunch = true
        }
        guard PreferencesStore.sessionCount >= 2 else { return }
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            if settings.authorizationStatus == .notDetermined {
                UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, _ in
                    if granted { Task { await reschedule() } }
                }
            } else if settings.authorizationStatus == .authorized {
                Task { await reschedule() }
            }
        }
    }

    static func reschedule() async {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [dailyId, streakId])
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized else { return }

        let midnight = PatrolDate.nextMidnight()
        if PreferencesStore.dailyNotification {
            await schedule(
                id: dailyId,
                title: "Daily Patrol is live",
                body: "A new swarm. Three attempts. Same run for every pilot.",
                at: midnight
            )
        }
        if PreferencesStore.streakAtRisk {
            let warn = midnight.addingTimeInterval(-2 * 3600)
            if warn > Date() {
                await schedule(
                    id: streakId,
                    title: "Patrol streak at risk",
                    body: "Today's Daily Patrol closes in two hours.",
                    at: warn
                )
            }
        }
    }

    private static func schedule(id: String, title: String, body: String, at date: Date) async {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
        let req = UNNotificationRequest(identifier: id, content: content, trigger: trigger)
        try? await UNUserNotificationCenter.current().add(req)
    }
}

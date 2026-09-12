import Foundation

enum PreferencesStore {
    private static let defaults = UserDefaults.standard
    private static let sessionCountKey = "orion.nativeSessions"
    private static let dailyNotifKey = "orion.notifDaily"
    private static let streakNotifKey = "orion.notifStreak"
    private static let attemptsKey = "orion.dailyAttempts"

    static var sessionCount: Int {
        get { defaults.integer(forKey: sessionCountKey) }
        set { defaults.set(newValue, forKey: sessionCountKey) }
    }

    static var dailyNotification: Bool {
        get {
            if defaults.object(forKey: dailyNotifKey) == nil { return true }
            return defaults.bool(forKey: dailyNotifKey)
        }
        set { defaults.set(newValue, forKey: dailyNotifKey) }
    }

    static var streakAtRisk: Bool {
        get { defaults.bool(forKey: streakNotifKey) }
        set { defaults.set(newValue, forKey: streakNotifKey) }
    }

    struct DailyAttempts: Codable {
        var date: String
        var used: Int
        var best: Best?
        struct Best: Codable {
            var score: Int
            var time: Double
            var maxMultiplier: Double
            var rank: Int?
            var attempt: Int
        }
    }

    static func loadAttempts(today: String = PatrolDate.dateString()) -> DailyAttempts {
        guard let data = defaults.data(forKey: attemptsKey),
              let parsed = try? JSONDecoder().decode(DailyAttempts.self, from: data),
              parsed.date == today
        else {
            return DailyAttempts(date: today, used: 0, best: nil)
        }
        return parsed
    }

    static func saveAttempts(_ state: DailyAttempts) {
        if let data = try? JSONEncoder().encode(state) {
            defaults.set(data, forKey: attemptsKey)
        }
    }

    static func attemptsLeft(today: String = PatrolDate.dateString()) -> Int {
        max(0, 3 - loadAttempts(today: today).used)
    }

    static func applyWebAttemptsJSON(_ raw: String?) {
        guard let raw, let data = raw.data(using: .utf8),
              let parsed = try? JSONDecoder().decode(DailyAttempts.self, from: data)
        else { return }
        saveAttempts(parsed)
    }
}

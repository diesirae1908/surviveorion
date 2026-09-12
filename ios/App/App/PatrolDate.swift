import Foundation

enum PatrolDate {
    static let timeZone = TimeZone(identifier: "America/Los_Angeles")!

    static func dateString(from now: Date = Date()) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = timeZone
        let c = cal.dateComponents([.year, .month, .day], from: now)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    static func nextMidnight(after now: Date = Date()) -> Date {
        let tomorrow = addCivilDays(dateString(from: now), 1)
        return dayStart(tomorrow)
    }

    static func dayStart(_ dateStr: String) -> Date {
        let parts = dateStr.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return Date() }
        var noon = DateComponents()
        noon.calendar = Calendar(identifier: .gregorian)
        noon.timeZone = TimeZone(secondsFromGMT: 0)
        noon.year = parts[0]
        noon.month = parts[1]
        noon.day = parts[2]
        noon.hour = 12
        let noonDate = noon.date ?? Date()
        let offset = offsetMs(at: noonDate)
        var midnight = DateComponents()
        midnight.calendar = Calendar(identifier: .gregorian)
        midnight.timeZone = TimeZone(secondsFromGMT: 0)
        midnight.year = parts[0]
        midnight.month = parts[1]
        midnight.day = parts[2]
        midnight.hour = 0
        let utcMidnight = midnight.date ?? Date()
        return utcMidnight.addingTimeInterval(TimeInterval(offset) / 1000)
    }

    static func countdown(to target: Date, now: Date = Date()) -> String {
        let remain = max(0, Int(target.timeIntervalSince(now)))
        let h = remain / 3600
        let m = (remain % 3600) / 60
        let s = remain % 60
        return String(format: "%d:%02d:%02d", h, m, s)
    }

    static func addCivilDays(_ dateStr: String, _ days: Int) -> String {
        let parts = dateStr.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return dateStr }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(secondsFromGMT: 0)!
        var c = DateComponents()
        c.year = parts[0]
        c.month = parts[1]
        c.day = parts[2] + days
        let d = cal.date(from: c) ?? Date()
        let out = cal.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", out.year ?? 0, out.month ?? 0, out.day ?? 0)
    }

    static func monthKey(from dateStr: String) -> String {
        String(dateStr.prefix(7))
    }

    static func monthStart(_ year: Int, _ month: Int) -> String {
        String(format: "%04d-%02d-01", year, month)
    }

    static func weekdaySundayZero(_ dateStr: String) -> Int {
        let parts = dateStr.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return 0 }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(secondsFromGMT: 0)!
        var c = DateComponents()
        c.year = parts[0]
        c.month = parts[1]
        c.day = parts[2]
        let d = cal.date(from: c) ?? Date()
        let wd = cal.component(.weekday, from: d) // 1 = Sunday
        return wd - 1
    }

    static func daysInMonth(year: Int, month: Int) -> Int {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(secondsFromGMT: 0)!
        let d = cal.date(from: DateComponents(year: year, month: month, day: 1)) ?? Date()
        return cal.range(of: .day, in: .month, for: d)?.count ?? 30
    }

    static func monthTitle(year: Int, month: Int) -> String {
        let names = [
            "", "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
            "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
        ]
        guard month >= 1, month <= 12 else { return "" }
        return "\(names[month]) \(year)"
    }

    /// Milliseconds Pacific Time lags behind UTC at `now` (same as src/patrolDate.ts).
    private static func offsetMs(at now: Date) -> Int {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = timeZone
        let wall = cal.dateComponents([.year, .month, .day, .hour, .minute, .second], from: now)
        var utc = DateComponents()
        utc.calendar = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(secondsFromGMT: 0)
        utc.year = wall.year
        utc.month = wall.month
        utc.day = wall.day
        utc.hour = (wall.hour ?? 0) % 24
        utc.minute = wall.minute
        utc.second = wall.second
        let wallAsUtc = utc.date ?? now
        let ms = now.timeIntervalSince(wallAsUtc) * 1000
        return Int((ms / 60_000).rounded()) * 60_000
    }
}

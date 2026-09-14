import SwiftUI

enum CalendarDayKind {
    case today
    case played
    case missed
    case untracked
    case future
}

struct CalendarDay: Identifiable {
    var date: String
    var day: Int
    var kind: CalendarDayKind
    /// Mutator names joined with " + " (Sundays fly two).
    var mutator: String
    var lines: [MutatorLine] = []
    var score: Int?
    var time: Double?
    var rank: Int?
    var medal: String?

    var id: String { date }
}

/// One Sunday-to-Saturday strip of the month, newest day first.
struct CalendarWeek: Identifiable {
    var sunday: String
    var days: [CalendarDay]

    var id: String { sunday }
}

/// Weekly list of past patrols: big tiles with the mutator name and its subline so
/// free pilots see what they missed, a lock on every past day until Gold Patrol.
/// Lucas, TestFlight 9: "more teasing with bigger tiles, a weekly calendar with tiles
/// explaining each previous mutator and a lock on it if you're not gold."
struct CalendarView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var year = 0
    @State private var month = 0
    @State private var weeks: [CalendarWeek] = []
    @State private var footnote = ""
    @State private var detail: CalendarDay?
    @State private var premium: PremiumContext?
    /// Play request parked until this screen has fully left the stack. Presenting the
    /// play cover while the pop (and the day sheet) were still animating left the WebView
    /// sized to a fraction of the screen on device (TestFlight 9 "rehearsal" report).
    @State private var queued: PlayLaunch?
    @State private var queuedAfterSheet: PlayLaunch?
    var onPlay: ((PlayMode, String?) -> Void)?

    private var today: String { PatrolDate.dateString() }

    var body: some View {
        VStack(spacing: 0) {
            OrionScreenBar(title: "PATROL CALENDAR") { dismiss() }
                .padding(.horizontal, 20)
                .padding(.top, 12)
            ScrollView(showsIndicators: false) {
                VStack(spacing: 14) {
                    monthNav
                    if !model.isPremium {
                        goldStrip
                    }
                    ForEach(weeks) { week in
                        weekHeader(week)
                        ForEach(week.days) { day in
                            dayTile(day)
                        }
                    }
                    if weeks.isEmpty {
                        OrionEmptyState(title: "No patrols yet", bodyText: "Daily Patrol starts on the first day of this month's schedule.")
                    }
                    if !footnote.isEmpty {
                        Text(footnote)
                            .font(OrionFont.body(13, weight: .regular))
                            .foregroundStyle(OrionColor.dust)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 14)
                .padding(.bottom, 32)
            }
        }
        .background(OrionColor.void.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .task { await boot() }
        .onDisappear {
            if let q = queued {
                queued = nil
                onPlay?(q.mode, q.date)
            }
        }
        .sheet(item: $detail, onDismiss: {
            if let q = queuedAfterSheet {
                queuedAfterSheet = nil
                launch(q)
            }
        }) { day in
            DayDetailSheet(day: day, isAdmin: model.isAdmin) { launch in
                if launch {
                    queuedAfterSheet = PlayLaunch(mode: .daily, date: day.date == today ? nil : day.date)
                }
                detail = nil
            }
        }
        .sheet(item: $premium) { ctx in
            PremiumSheet(context: ctx) { premium = nil }
                .environmentObject(model)
        }
    }

    /// Pop this screen; `onDisappear` fires the play request once the stack is idle.
    private func launch(_ l: PlayLaunch) {
        queued = l
        dismiss()
    }

    private var monthNav: some View {
        HStack {
            navButton("chevron.left", enabled: canPrev) {
                shift(-1)
            }
            Spacer()
            Text(PatrolDate.monthTitle(year: year, month: month))
                .font(OrionFont.body(13, weight: .bold))
                .foregroundStyle(OrionColor.starlight)
                .tracking(2)
            Spacer()
            navButton("chevron.right", enabled: canNext) {
                shift(1)
            }
        }
    }

    private func navButton(_ icon: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(OrionColor.hullGold)
                .frame(width: OrionLayout.minTap, height: OrionLayout.minTap)
                .background(OrionColor.deepSpace, in: ChamferedRectangle(chamfer: 8))
                .overlay {
                    ChamferedRectangle(chamfer: 8)
                        .strokeBorder(OrionColor.hullLine, lineWidth: 1)
                }
                .opacity(enabled ? 1 : 0.25)
        }
        .disabled(!enabled)
    }

    private var goldStrip: some View {
        Button { premium = .calendar } label: {
            HStack(spacing: 10) {
                Image(systemName: "crown.fill")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(OrionColor.hullGold)
                VStack(alignment: .leading, spacing: 2) {
                    Text("GOLD PATROL")
                        .font(OrionFont.body(11, weight: .bold))
                        .foregroundStyle(OrionColor.bronze)
                        .tracking(2)
                    Text("Every past patrol, one tap away.")
                        .font(OrionFont.body(14, weight: .bold))
                        .foregroundStyle(OrionColor.starlight)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(OrionColor.bronze)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 52)
            .frame(maxWidth: .infinity)
            .background(OrionColor.deepSpace, in: ChamferedRectangle(chamfer: 10))
            .overlay {
                ChamferedRectangle(chamfer: 10)
                    .strokeBorder(OrionColor.hullGold.opacity(0.35), lineWidth: 1.5)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Gold Patrol. Every past patrol, one tap away.")
    }

    private func weekHeader(_ week: CalendarWeek) -> some View {
        let containsToday = week.days.contains { $0.date == today }
        let label = containsToday ? "THIS WEEK" : "WEEK OF \(PatrolDate.shortLabel(week.sunday).uppercased())"
        return HStack(spacing: 10) {
            Text(label)
                .font(OrionFont.body(11, weight: .bold))
                .foregroundStyle(OrionColor.bronze)
                .tracking(2)
            Rectangle()
                .fill(OrionColor.hullLine.opacity(0.6))
                .frame(height: 1)
        }
        .padding(.top, 6)
    }

    private func dayTile(_ day: CalendarDay) -> some View {
        Button {
            tap(day)
        } label: {
            HStack(alignment: .center, spacing: 12) {
                VStack(spacing: 0) {
                    Text(weekdayAbbrev(day.date))
                        .font(OrionFont.body(10, weight: .bold))
                        .foregroundStyle(OrionColor.bronze)
                        .tracking(1)
                    Text("\(day.day)")
                        .font(OrionFont.display(24, weight: .bold))
                        .foregroundStyle(day.kind == .today ? OrionColor.hullGold : OrionColor.starlight)
                        .monospacedDigit()
                }
                .frame(width: 40)
                VStack(alignment: .leading, spacing: 3) {
                    Text(day.mutator)
                        .font(OrionFont.display(17))
                        .foregroundStyle(OrionColor.goldGradient)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                    Text(subline(day))
                        .font(OrionFont.body(12, weight: .regular))
                        .foregroundStyle(OrionColor.dust)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                status(day)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .background(OrionColor.deepSpace, in: ChamferedRectangle(chamfer: 10))
            .overlay {
                ChamferedRectangle(chamfer: 10)
                    .strokeBorder(stroke(day), lineWidth: day.kind == .today ? 1.5 : 1)
            }
            .opacity(day.kind == .missed || day.kind == .untracked ? 0.92 : 1)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibility(day))
    }

    @ViewBuilder
    private func status(_ day: CalendarDay) -> some View {
        let locked = !model.isPremium && day.date < today
        switch day.kind {
        case .today:
            VStack(spacing: 4) {
                chip("TODAY", color: OrionColor.hullGold)
                if model.isPremium {
                    Image(systemName: "infinity")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(OrionColor.hullGold)
                } else {
                    Text("\(model.attemptsLeft) left")
                        .font(OrionFont.body(11, weight: .bold))
                        .foregroundStyle(model.attemptsLeft > 0 ? OrionColor.starlight : OrionColor.alarm)
                }
            }
        case .played:
            VStack(alignment: .trailing, spacing: 4) {
                Text((day.score ?? 0).formatted())
                    .font(OrionFont.display(15, weight: .bold))
                    .foregroundStyle(OrionColor.starlight)
                    .monospacedDigit()
                if let medal = day.medal {
                    MedalBadge(medal: medal)
                } else if let r = day.rank {
                    Text("#\(r)")
                        .font(OrionFont.body(11, weight: .bold))
                        .foregroundStyle(OrionColor.bronze)
                }
            }
        case .missed:
            if locked { lock } else { chip("MISSED", color: OrionColor.dust) }
        case .untracked:
            if locked { lock } else { chip("NO RECORD", color: OrionColor.dust) }
        case .future:
            chip("REHEARSAL", color: OrionColor.alarm)
        }
    }

    private var lock: some View {
        VStack(spacing: 4) {
            PremiumLockGlyph()
            Text("GOLD")
                .font(OrionFont.body(9, weight: .bold))
                .foregroundStyle(OrionColor.bronze)
                .tracking(1)
        }
    }

    private func chip(_ text: String, color: Color) -> some View {
        Text(text)
            .font(OrionFont.body(9, weight: .bold))
            .foregroundStyle(color)
            .tracking(1)
            .padding(.horizontal, 7)
            .padding(.vertical, 4)
            .overlay {
                ChamferedRectangle(chamfer: 5)
                    .strokeBorder(color.opacity(0.6), lineWidth: 1)
            }
    }

    private func subline(_ day: CalendarDay) -> String {
        if day.lines.isEmpty { return "The standard swarm. No mutator today." }
        if day.lines.count == 1 { return day.lines[0].subline }
        return day.lines.map { "\($0.name.capitalized): \($0.subline)" }.joined(separator: " ")
    }

    private func weekdayAbbrev(_ date: String) -> String {
        let names = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]
        let i = PatrolDate.weekdaySundayZero(date)
        return names.indices.contains(i) ? names[i] : ""
    }

    private func accessibility(_ day: CalendarDay) -> String {
        var parts = [PatrolDate.shortLabel(day.date), day.mutator]
        switch day.kind {
        case .today: parts.append("Today")
        case .played: parts.append("Flown, \((day.score ?? 0).formatted()) points")
        case .missed: parts.append("Missed")
        case .untracked: parts.append("No record")
        case .future: parts.append("Rehearsal, crew only")
        }
        if !model.isPremium && day.date < today { parts.append("Locked, requires Gold Patrol") }
        return parts.joined(separator: ". ")
    }

    private func stroke(_ day: CalendarDay) -> Color {
        if day.kind == .today { return OrionColor.hullGold }
        if day.kind == .future { return OrionColor.alarm.opacity(0.35) }
        return OrionColor.hullLine
    }

    private var canPrev: Bool { true }
    private var canNext: Bool {
        let next = nextMonth(year: year, month: month)
        let nextStart = PatrolDate.monthStart(next.0, next.1)
        if model.isAdmin { return nextStart <= PatrolDate.addCivilDays(today, 14) }
        return nextStart <= today
    }

    private func shift(_ delta: Int) {
        if delta < 0 {
            if month == 1 { year -= 1; month = 12 } else { month -= 1 }
        } else {
            let n = nextMonth(year: year, month: month)
            year = n.0
            month = n.1
        }
        Task { await loadMonth() }
    }

    private func nextMonth(year: Int, month: Int) -> (Int, Int) {
        month == 12 ? (year + 1, 1) : (year, month + 1)
    }

    private func tap(_ day: CalendarDay) {
        if day.kind == .today {
            if model.attemptsLeft > 0 || model.isPremium {
                launch(PlayLaunch(mode: .daily, date: nil))
            } else {
                premium = .calendar
            }
            return
        }
        if day.date < today && !model.isPremium {
            premium = .calendar
            return
        }
        if day.kind == .future && !model.isAdmin { return }
        detail = day
    }

    private func boot() async {
        let t = today
        let parts = t.split(separator: "-").compactMap { Int($0) }
        year = parts.count == 3 ? parts[0] : 2026
        month = parts.count == 3 ? parts[1] : 9
        await loadMonth()
    }

    private func loadMonth() async {
        let start = PatrolDate.monthStart(year, month)
        let lastDay = PatrolDate.daysInMonth(year: year, month: month)
        let end = String(format: "%04d-%02d-%02d", year, month, lastDay)
        var history: [String: DailyHistoryEntry] = [:]
        footnote = ""
        if model.isSignedIn {
            footnote = "Syncing your account's record…"
            do {
                let r = try await APIClient.shared.dailyHistory(from: start, to: min(end, today))
                for e in r.entries { history[e.date] = e }
                footnote = ""
            } catch APIError.offline {
                footnote = "Couldn't reach the server, showing this device's local history."
            } catch {
                footnote = "Couldn't reach the server, showing this device's local history."
            }
        } else {
            footnote = "Signed out: showing this device's local history only. Sign in to sync your full record."
        }

        // The bundled schedule is exported from the same hash as the server, so it wins
        // whenever it knows the day; the server fills in dates past the bundle. A server
        // without its schedule file answers "CLASSIC" for every day, never trust that alone.
        var remote: [String: [MutatorLine]] = [:]
        if model.isSignedIn {
            let to = model.isAdmin ? PatrolDate.addCivilDays(today, 14) : today
            if let r = try? await APIClient.shared.patrolMutators(from: start, to: min(end, to)) {
                for e in r.entries where e.name != "CLASSIC" {
                    remote[e.date] = [MutatorLine(name: e.name, subline: e.subline ?? "")]
                }
            }
        }

        let join = model.joinedAt.map { PatrolDate.dateString(from: $0) }
        var days: [CalendarDay] = []
        for d in 1...lastDay {
            let date = String(format: "%04d-%02d-%02d", year, month, d)
            if date > today && !model.isAdmin { continue }
            if date > PatrolDate.addCivilDays(today, 14) { continue }
            let bundled = MutatorCatalog.today(date)
            let lines = bundled.isEmpty ? (remote[date] ?? []) : bundled
            let mutator = lines.isEmpty ? "CLASSIC" : lines.map(\.name).joined(separator: " + ")
            var kind: CalendarDayKind
            var score: Int?
            var time: Double?
            var rank: Int?
            if date == today {
                kind = .today
                if let h = history[date] { score = h.best; time = h.bestTime; rank = h.rank }
            } else if date > today {
                kind = .future
            } else if let h = history[date] {
                kind = .played
                score = h.best
                time = h.bestTime
                rank = h.rank
            } else if let join, date < join {
                kind = .untracked
            } else if model.isSignedIn {
                kind = .missed
            } else {
                kind = .untracked
            }
            days.append(CalendarDay(
                date: date,
                day: d,
                kind: kind,
                mutator: mutator,
                lines: lines,
                score: score,
                time: time,
                rank: rank,
                medal: medal(for: score)
            ))
        }
        weeks = groupWeeks(days)
        if model.pendingQaDayDetail {
            model.pendingQaDayDetail = false
            if let first = days.first(where: { $0.kind == .missed || $0.kind == .untracked }) {
                detail = first
                if model.pendingQaDayLaunch {
                    model.pendingQaDayLaunch = false
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                        queuedAfterSheet = PlayLaunch(mode: .daily, date: first.date)
                        detail = nil
                    }
                }
            }
        }
    }

    /// Newest first: today (and crew rehearsal days) on top, then the weeks before.
    private func groupWeeks(_ days: [CalendarDay]) -> [CalendarWeek] {
        var byWeek: [String: [CalendarDay]] = [:]
        for day in days {
            let offset = PatrolDate.weekdaySundayZero(day.date)
            let sunday = PatrolDate.addCivilDays(day.date, -offset)
            byWeek[sunday, default: []].append(day)
        }
        return byWeek.keys.sorted(by: >).map { sunday in
            CalendarWeek(sunday: sunday, days: byWeek[sunday]!.sorted { $0.date > $1.date })
        }
    }

    private func medal(for score: Int?) -> String? {
        guard let score else { return nil }
        if score >= 300_000 { return "gold" }
        if score >= 130_000 { return "silver" }
        if score >= 60_000 { return "copper" }
        return nil
    }
}

struct DayDetailSheet: View {
    var day: CalendarDay
    var isAdmin: Bool
    var onClose: (Bool) -> Void

    var body: some View {
        VStack(spacing: 16) {
            Text(day.date)
                .font(OrionFont.body(13, weight: .bold))
                .foregroundStyle(OrionColor.bronze)
                .tracking(2)
            Text(day.mutator)
                .font(OrionFont.display(28))
                .foregroundStyle(OrionColor.goldGradient)
                .multilineTextAlignment(.center)
            if let first = day.lines.first {
                Text(first.subline)
                    .font(OrionFont.body(14, weight: .regular))
                    .foregroundStyle(OrionColor.dust)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
            }
            if day.kind == .played, let score = day.score {
                Text(score.formatted())
                    .font(OrionFont.display(24, weight: .bold))
                    .foregroundStyle(OrionColor.starlight)
                HStack(spacing: 16) {
                    if let t = day.time {
                        Text(OrionFormat.survived(t))
                            .font(OrionFont.body(16))
                            .foregroundStyle(OrionColor.bronze)
                    }
                    if let r = day.rank {
                        Text("#\(r)")
                            .font(OrionFont.body(16, weight: .bold))
                            .foregroundStyle(OrionColor.bronze)
                    }
                    if let medal = day.medal {
                        MedalBadge(medal: medal)
                    }
                }
                Button("Replay this Patrol") { onClose(true) }
                    .buttonStyle(OrionButtonStyle(kind: .primary))
            } else if day.kind == .future {
                OrionEmptyState(title: "Rehearsal day", bodyText: "Crew only. Same script pilots will fly.")
                Button("Launch Rehearsal") { onClose(true) }
                    .buttonStyle(OrionButtonStyle(kind: .secondary))
                    .overlay {
                        ChamferedRectangle(chamfer: 12)
                            .strokeBorder(OrionColor.alarm.opacity(0.45), lineWidth: 1)
                    }
            } else if day.kind == .untracked {
                OrionEmptyState(
                    title: "No record",
                    bodyText: "No record for this device, and you weren't signed in yet"
                )
                Button("Fly this Patrol") { onClose(true) }
                    .buttonStyle(OrionButtonStyle(kind: .primary))
            } else {
                OrionEmptyState(title: "No patrol flown.", bodyText: "This day has no submitted Daily score.")
                Button("Fly this Patrol") { onClose(true) }
                    .buttonStyle(OrionButtonStyle(kind: .primary))
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(OrionColor.void.ignoresSafeArea())
        .presentationDetents([.medium, .large])
    }
}

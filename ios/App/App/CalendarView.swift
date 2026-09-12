import SwiftUI

enum CalendarDayKind {
    case empty
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
    var mutator: String
    var score: Int?
    var time: Double?
    var rank: Int?
    var medal: String?

    var id: String { date.isEmpty ? "e-\(day)" : date }
}

struct CalendarView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.verticalSizeClass) private var vSize
    @State private var year = 0
    @State private var month = 0
    @State private var days: [CalendarDay] = []
    @State private var footnote = ""
    @State private var detail: CalendarDay?
    @State private var premium: PremiumContext?
    var onPlay: ((PlayMode, String?) -> Void)?

    private var today: String { PatrolDate.dateString() }
    private var landscape: Bool { vSize == .compact }

    var body: some View {
        VStack(spacing: 14) {
            OrionScreenBar(title: "PATROL CALENDAR") { dismiss() }
            monthNav
            weekdayHeader
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
                ForEach(Array(days.enumerated()), id: \.offset) { _, cell in
                    dayCell(cell)
                }
            }
            if !footnote.isEmpty {
                Text(footnote)
                    .font(OrionFont.body(13, weight: .regular))
                    .foregroundStyle(OrionColor.dust)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(OrionColor.void.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .task { await boot() }
        .sheet(item: $detail) { day in
            DayDetailSheet(day: day, isAdmin: model.isAdmin) { replay in
                detail = nil
                if replay {
                    onPlay?(.daily, day.date == today ? nil : day.date)
                    dismiss()
                }
            }
        }
        .sheet(item: $premium) { ctx in
            PremiumSheet(context: ctx) { premium = nil }
                .environmentObject(model)
        }
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
                .frame(width: 32, height: 32)
                .background(OrionColor.deepSpace, in: ChamferedRectangle(chamfer: 6))
                .overlay {
                    ChamferedRectangle(chamfer: 6)
                        .strokeBorder(OrionColor.hullLine, lineWidth: 1)
                }
                .opacity(enabled ? 1 : 0.25)
        }
        .disabled(!enabled)
    }

    private var weekdayHeader: some View {
        HStack(spacing: 4) {
            ForEach(["SU", "M", "T", "W", "TH", "F", "SA"], id: \.self) { d in
                Text(d)
                    .font(OrionFont.body(11, weight: .bold))
                    .foregroundStyle(OrionColor.bronze)
                    .tracking(1)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    @ViewBuilder
    private func dayCell(_ cell: CalendarDay) -> some View {
        if cell.kind == .empty {
            Color.clear
                .aspectRatio(landscape ? 1 : 0.85, contentMode: .fit)
        } else {
            Button {
                tap(cell)
            } label: {
                ZStack(alignment: .topLeading) {
                    ChamferedRectangle(chamfer: 6)
                        .fill(OrionColor.deepSpace)
                    ChamferedRectangle(chamfer: 6)
                        .strokeBorder(stroke(cell), lineWidth: cell.kind == .today ? 1.5 : 1)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text("\(cell.day)")
                                .font(OrionFont.display(13, weight: .bold))
                                .foregroundStyle(OrionColor.starlight)
                            Spacer(minLength: 0)
                            if cell.kind == .played {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 8, weight: .bold))
                                    .foregroundStyle(OrionColor.bronze)
                            } else if cell.kind == .missed {
                                Text("-")
                                    .font(OrionFont.body(10, weight: .bold))
                                    .foregroundStyle(OrionColor.dust)
                            } else if cell.kind == .untracked {
                                Text("?")
                                    .font(OrionFont.body(10, weight: .bold))
                                    .foregroundStyle(OrionColor.dust)
                            }
                        }
                        Text(cell.mutator)
                            .font(OrionFont.body(9, weight: .bold))
                            .foregroundStyle(OrionColor.starlight.opacity(cell.kind == .missed || cell.kind == .untracked ? 0.50 : 1))
                            .lineLimit(2)
                            .minimumScaleFactor(0.8)
                        Spacer(minLength: 0)
                    }
                    .padding(5)
                    if cell.kind == .today && model.attemptsLeft > 0 {
                        Circle()
                            .fill(OrionColor.hullGold)
                            .frame(width: 5, height: 5)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                            .padding(6)
                    }
                    if !model.isPremium && cell.date < today {
                        PremiumLockGlyph()
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                            .padding(4)
                    }
                }
                .aspectRatio(landscape ? 1 : 0.85, contentMode: .fit)
                .opacity(cell.kind == .missed ? 0.85 : 1)
            }
            .buttonStyle(.plain)
        }
    }

    private func stroke(_ cell: CalendarDay) -> Color {
        if cell.kind == .today { return OrionColor.hullGold }
        if cell.kind == .future { return OrionColor.alarm.opacity(0.25) }
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

    private func tap(_ cell: CalendarDay) {
        if cell.kind == .today {
            onPlay?(.daily, nil)
            dismiss()
            return
        }
        if cell.date < today && !model.isPremium {
            premium = .calendar
            return
        }
        if cell.kind == .future && !model.isAdmin { return }
        detail = cell
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

        var remoteNames: [String: String] = [:]
        if model.isSignedIn {
            let to = model.isAdmin ? PatrolDate.addCivilDays(today, 14) : today
            if let r = try? await APIClient.shared.patrolMutators(from: start, to: min(end, to)) {
                for e in r.entries { remoteNames[e.date] = e.name }
            }
        }

        let pad = PatrolDate.weekdaySundayZero(start)
        var cells: [CalendarDay] = (0..<pad).map { _ in
            CalendarDay(date: "", day: 0, kind: .empty, mutator: "")
        }
        let join = model.joinedAt.map { PatrolDate.dateString(from: $0) }
        for d in 1...lastDay {
            let date = String(format: "%04d-%02d-%02d", year, month, d)
            if date > today && !model.isAdmin { continue }
            if date > PatrolDate.addCivilDays(today, 14) { continue }
            let mutator = remoteNames[date] ?? MutatorCatalog.name(for: date)
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
            cells.append(CalendarDay(
                date: date,
                day: d,
                kind: kind,
                mutator: mutator,
                score: score,
                time: time,
                rank: rank,
                medal: medal(for: score)
            ))
        }
        days = cells
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
            } else {
                OrionEmptyState(title: "No patrol flown.", bodyText: "This day has no submitted Daily score.")
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(OrionColor.void.ignoresSafeArea())
        .presentationDetents([.medium])
    }
}

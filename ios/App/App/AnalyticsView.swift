import SwiftUI

struct AnalyticsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var hSize
    @Environment(\.verticalSizeClass) private var vSize
    @State private var history: [DailyHistoryEntry] = []
    @State private var loaded = false

    private var twoCol: Bool { hSize == .regular || vSize == .compact }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                OrionScreenBar(title: "ANALYTICS") { dismiss() }
                if twoCol {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
                        streakCard
                        attemptsCard
                        medalsCard
                        if history.count >= 3 {
                            bestCard
                            trendCard
                        }
                    }
                } else {
                    streakCard
                    attemptsCard
                    medalsCard
                    if history.count >= 3 {
                        bestCard
                        trendCard
                    } else if loaded {
                        OrionEmptyState(
                            title: "Keep flying",
                            bodyText: "Fly a few more patrols and your record fills in here."
                        )
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .background(OrionColor.void.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .task { await load() }
    }

    private var stats: AnalyticsStats { AnalyticsStats(history: history, today: PatrolDate.dateString()) }

    private var streakCard: some View {
        ChamferedPanel {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(stats.streak)")
                        .font(OrionFont.display(32, weight: .bold))
                        .foregroundStyle(OrionColor.goldGradient)
                    Text("DAY STREAK")
                        .font(OrionFont.body(12, weight: .bold))
                        .foregroundStyle(OrionColor.bronze)
                        .tracking(2)
                    Text(stats.streakDelta)
                        .font(OrionFont.body(13))
                        .foregroundStyle(stats.streakDelta.hasPrefix("-") ? OrionColor.alarm : OrionColor.bronze)
                }
                Spacer()
                Text("Longest: \(stats.longest)")
                    .font(OrionFont.body(14, weight: .regular))
                    .foregroundStyle(OrionColor.dust)
            }
        }
    }

    private var attemptsCard: some View {
        ChamferedPanel {
            HStack {
                stat("PATROLS FLOWN", "\(stats.flown)")
                stat("COMPLETION", stats.completion)
                stat("AVG SCORE", stats.avg)
            }
        }
    }

    private var medalsCard: some View {
        ChamferedPanel {
            HStack {
                MedalBadge(medal: "gold", count: stats.gold, dimmed: stats.gold == 0)
                MedalBadge(medal: "silver", count: stats.silver, dimmed: stats.silver == 0)
                MedalBadge(medal: "copper", count: stats.copper, dimmed: stats.copper == 0)
            }
            .frame(maxWidth: .infinity)
        }
    }

    private var bestCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("BEST SCORES")
                .font(OrionFont.body(13, weight: .bold))
                .foregroundStyle(OrionColor.bronze)
                .tracking(2)
            ChamferedPanel(padding: 0) {
                VStack(spacing: 0) {
                    ForEach(Array(stats.top.enumerated()), id: \.element.id) { i, row in
                        if i > 0 { OrionHairline() }
                        HStack {
                            Text("\(i + 1)")
                                .font(OrionFont.body(14, weight: .bold))
                                .foregroundStyle(OrionColor.bronze)
                                .frame(width: 20)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(MutatorCatalog.name(for: row.date))
                                    .font(OrionFont.body(15))
                                    .foregroundStyle(OrionColor.starlight)
                                Text(row.date)
                                    .font(OrionFont.body(12, weight: .regular))
                                    .foregroundStyle(OrionColor.dust)
                            }
                            Spacer()
                            Text(row.best.formatted())
                                .font(OrionFont.display(16, weight: .bold))
                                .foregroundStyle(i == 0 ? AnyShapeStyle(OrionColor.goldGradient) : AnyShapeStyle(OrionColor.starlight))
                        }
                        .padding(.horizontal, 16)
                        .frame(minHeight: OrionLayout.minTap)
                    }
                }
            }
        }
    }

    private var trendCard: some View {
        ChamferedPanel {
            MiniBarRow(values: stats.trendValues, missed: stats.trendMissed)
            Text("Last 14 patrols")
                .font(OrionFont.body(12, weight: .regular))
                .foregroundStyle(OrionColor.dust)
        }
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(spacing: 6) {
            Text(label)
                .font(OrionFont.body(11, weight: .bold))
                .foregroundStyle(OrionColor.bronze)
                .tracking(1)
                .multilineTextAlignment(.center)
            Text(value)
                .font(OrionFont.display(20, weight: .bold))
                .foregroundStyle(OrionColor.starlight)
        }
        .frame(maxWidth: .infinity)
    }

    private func load() async {
        let today = PatrolDate.dateString()
        let from = PatrolDate.addCivilDays(today, -400)
        if let r = try? await APIClient.shared.dailyHistory(from: from, to: today) {
            history = r.entries
        }
        loaded = true
    }
}

private struct AnalyticsStats {
    var streak = 0
    var longest = 0
    var streakDelta = "+0 this week"
    var flown = 0
    var completion = "0%"
    var avg = "0"
    var gold = 0
    var silver = 0
    var copper = 0
    var top: [DailyHistoryEntry] = []
    var trendValues: [Double] = []
    var trendMissed: [Bool] = []

    init(history: [DailyHistoryEntry], today: String) {
        let byDate = Dictionary(uniqueKeysWithValues: history.map { ($0.date, $0) })
        flown = history.count
        if flown > 0 {
            let sum = history.reduce(0) { $0 + $1.best }
            avg = (sum / flown).formatted()
        }
        let first = history.map(\.date).min() ?? today
        var cursor = first
        var eligible = 0
        while cursor <= today {
            eligible += 1
            cursor = PatrolDate.addCivilDays(cursor, 1)
        }
        if eligible > 0 {
            completion = "\(Int((Double(flown) / Double(eligible) * 100).rounded()))%"
        }
        for e in history {
            if e.best >= 300_000 { gold += 1 }
            else if e.best >= 130_000 { silver += 1 }
            else if e.best >= 60_000 { copper += 1 }
        }
        top = Array(history.sorted { $0.best > $1.best }.prefix(5))

        var run = 0
        var best = 0
        cursor = today
        if byDate[today] == nil { cursor = PatrolDate.addCivilDays(today, -1) }
        while let _ = byDate[cursor] {
            run += 1
            cursor = PatrolDate.addCivilDays(cursor, -1)
        }
        streak = run
        cursor = first
        run = 0
        while cursor <= today {
            if byDate[cursor] != nil {
                run += 1
                best = max(best, run)
            } else {
                run = 0
            }
            cursor = PatrolDate.addCivilDays(cursor, 1)
        }
        longest = max(best, streak)

        var week = 0
        for i in 0..<7 {
            if byDate[PatrolDate.addCivilDays(today, -i)] != nil { week += 1 }
        }
        streakDelta = "+\(week) this week"

        var vals: [Double] = []
        var miss: [Bool] = []
        for i in (0..<14).reversed() {
            let d = PatrolDate.addCivilDays(today, -i)
            if let e = byDate[d] {
                vals.append(e.bestTime)
                miss.append(false)
            } else {
                vals.append(0)
                miss.append(true)
            }
        }
        trendValues = vals
        trendMissed = miss
    }
}

import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.horizontalSizeClass) private var hSize
    @Environment(\.verticalSizeClass) private var vSize
    @State private var now = Date()
    @State private var playLaunch: PlayLaunch?
    @State private var pendingGameResult: GameResult?
    @State private var showGameOver = false
    @State private var showSettings = false
    @State private var showBoard = false
    @State private var showCalendar = false
    @State private var showWingmates = false
    @State private var showAnalytics = false
    @State private var showFeedback = false
    @State private var premium: PremiumContext?
    @State private var launchPulse = false
    @State private var appeared = false
    @State private var recPulse = false

    private var midnight: Date { PatrolDate.nextMidnight(after: now) }
    private var canLaunchDaily: Bool { model.online && model.attemptsLeft > 0 }
    private var twoColumn: Bool { hSize == .regular || vSize == .compact }

    var body: some View {
        ScrollView {
            Group {
                if twoColumn {
                    VStack(alignment: .leading, spacing: 20) {
                        topBar
                        HStack(alignment: .top, spacing: 20) {
                            VStack(alignment: .leading, spacing: 20) {
                                header
                                mutatorCard
                                attemptRow
                            }
                            VStack(alignment: .leading, spacing: 20) {
                                launchButtons
                                boardSummary
                            }
                        }
                    }
                } else {
                    VStack(alignment: .leading, spacing: 20) {
                        topBar
                        header
                        mutatorCard
                        attemptRow
                        launchButtons
                        boardSummary
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)

            if let err = model.lastError {
                Text(err)
                    .font(OrionFont.body(14))
                    .foregroundStyle(OrionColor.alarm)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 16)
            }
        }
        .background {
            ZStack {
                OrionColor.void
                StarfieldBackground()
            }
            .ignoresSafeArea()
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
        .opacity(appeared ? 1 : 0)
        .task { await model.refresh() }
        .onAppear {
            withAnimation(OrionMotion.screen) { appeared = true }
            syncLaunchPulse()
            if playLaunch == nil { LobbyMusic.shared.play() }
            if model.pendingSettings {
                showSettings = true
                model.pendingSettings = false
            }
            if model.pendingBoard {
                showBoard = true
                model.pendingBoard = false
            }
            if model.pendingGameOver {
                model.lastResult = GameResult(
                    mode: .training,
                    score: 12840,
                    timeSurvived: 93,
                    kills: 27,
                    medal: "silver",
                    sharePng: nil
                )
                showGameOver = true
                model.pendingGameOver = false
            }
            if model.pendingCalendar {
                showCalendar = true
                model.pendingCalendar = false
            }
            if model.pendingWingmates {
                openWingmates()
                model.pendingWingmates = false
            }
            if model.pendingAnalytics {
                openAnalytics()
                model.pendingAnalytics = false
            }
            if model.pendingFeedback {
                showFeedback = true
                model.pendingFeedback = false
            }
            if let ctx = model.pendingPremium {
                premium = ctx
                model.pendingPremium = nil
            }
            if let mode = model.pendingPlay {
                startPlay(mode, date: model.pendingPlayDate)
                model.pendingPlay = nil
                model.pendingPlayDate = nil
            }
        }
        .onChange(of: canLaunchDaily) { _, _ in
            syncLaunchPulse()
        }
        .navigationDestination(isPresented: $showSettings) {
            SettingsView()
        }
        .navigationDestination(isPresented: $showBoard) {
            BoardView()
        }
        .navigationDestination(isPresented: $showCalendar) {
            CalendarView { mode, date in startPlay(mode, date: date) }
        }
        .navigationDestination(isPresented: $showWingmates) {
            SquadronsView()
        }
        .navigationDestination(isPresented: $showAnalytics) {
            AnalyticsView()
        }
        .navigationDestination(isPresented: $showFeedback) {
            FeedbackView()
        }
        .sheet(item: $premium) { ctx in
            PremiumSheet(context: ctx) { premium = nil }
        }
        .onChange(of: model.pendingPlay) { _, mode in
            if let mode {
                startPlay(mode, date: model.pendingPlayDate)
                model.pendingPlay = nil
                model.pendingPlayDate = nil
            }
        }
        .onChange(of: model.pendingCalendar) { _, on in
            if on { showCalendar = true; model.pendingCalendar = false }
        }
        .onChange(of: model.pendingWingmates) { _, on in
            if on { openWingmates(); model.pendingWingmates = false }
        }
        .onChange(of: model.pendingAnalytics) { _, on in
            if on { openAnalytics(); model.pendingAnalytics = false }
        }
        .onChange(of: model.pendingFeedback) { _, on in
            if on { showFeedback = true; model.pendingFeedback = false }
        }
        .onChange(of: model.pendingPremium) { _, ctx in
            if let ctx { premium = ctx; model.pendingPremium = nil }
        }
        .onChange(of: model.pendingSettings) { _, on in
            if on {
                showSettings = true
                model.pendingSettings = false
            }
        }
        .onChange(of: model.pendingBoard) { _, on in
            if on {
                showBoard = true
                model.pendingBoard = false
            }
        }
        .onChange(of: model.pendingGameOver) { _, on in
            if on {
                model.lastResult = GameResult(
                    mode: .training,
                    score: 12840,
                    timeSurvived: 93,
                    kills: 27,
                    medal: "silver",
                    sharePng: nil
                )
                showGameOver = true
                model.pendingGameOver = false
            }
        }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { now = $0 }
        .fullScreenCover(item: $playLaunch, onDismiss: {
            LobbyMusic.shared.play()
            if let result = pendingGameResult {
                model.lastResult = result
                pendingGameResult = nil
                showGameOver = true
            }
            Task { await model.refresh() }
        }) { launch in
            ZStack(alignment: .topLeading) {
                PlayView(launch: launch) { exit in
                    switch exit {
                    case .quit:
                        pendingGameResult = nil
                        playLaunch = nil
                    case .finished(let result):
                        pendingGameResult = result
                        playLaunch = nil
                    }
                }
                .environmentObject(model)
                .ignoresSafeArea()
                if model.isAdmin && PreferencesStore.recordRuns {
                    Circle()
                        .fill(OrionColor.alarm)
                        .frame(width: 8, height: 8)
                        .opacity(recPulse ? 1 : 0.35)
                        .padding(.top, 18)
                        .padding(.leading, 18)
                        .onAppear {
                            withAnimation(OrionMotion.pulse.repeatForever(autoreverses: true)) {
                                recPulse = true
                            }
                        }
                }
            }
        }
        .overlay(alignment: .top) {
            if model.premiumToast {
                Text("Gold Patrol active.")
                    .font(OrionFont.body(14, weight: .bold))
                    .foregroundStyle(OrionColor.void)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(OrionColor.goldGradient, in: ChamferedRectangle(chamfer: 8))
                    .padding(.top, 12)
            }
        }
        .sheet(isPresented: $showGameOver) {
            if let result = model.lastResult {
                GameOverView(
                    result: result,
                    callsign: model.callsign,
                    autoShare: model.pendingShare,
                    isAdmin: model.isAdmin,
                    isPremium: model.isPremium,
                    onDone: {
                        showGameOver = false
                        model.pendingShare = false
                    },
                    onFeedback: {
                        showGameOver = false
                        showFeedback = true
                    },
                    onAnalytics: {
                        showGameOver = false
                        showAnalytics = true
                    },
                    onUnlockArchive: {
                        showGameOver = false
                        premium = .analytics
                    }
                )
            }
        }
    }

    private func startPlay(_ mode: PlayMode, date: String? = nil) {
        LobbyMusic.shared.pause()
        playLaunch = PlayLaunch(mode: mode, date: date)
    }

    private func openWingmates() {
        if model.isPremium { showWingmates = true } else { premium = .squadrons }
    }

    private func openAnalytics() {
        if model.isPremium { showAnalytics = true } else { premium = .analytics }
    }

    private func openCalendar() {
        showCalendar = true
    }

    private func syncLaunchPulse() {
        if canLaunchDaily {
            withAnimation(OrionMotion.pulse.repeatForever(autoreverses: true)) {
                launchPulse = true
            }
        } else {
            launchPulse = false
        }
    }

    private var topBar: some View {
        HStack(spacing: 10) {
            PatrolSightMark(size: 28)
            Text("ORION")
                .font(OrionFont.display(28))
                .foregroundStyle(OrionColor.goldGradient)
                .tracking(1)
            Spacer(minLength: 8)
            if model.tier == .free {
                ActivatePremiumChip { premium = .generic }
            } else {
                TierBadge(tier: model.tier)
            }
            NavigationLink {
                SettingsView()
            } label: {
                Text("SETTINGS")
                    .font(OrionFont.body(12, weight: .bold))
                    .foregroundStyle(OrionColor.hullGold)
                    .tracking(2)
                    .padding(.horizontal, 12)
                    .frame(minWidth: OrionLayout.minTap, minHeight: OrionLayout.minTap)
                    .background(OrionColor.deepSpace, in: ChamferedRectangle(chamfer: 8))
                    .overlay {
                        ChamferedRectangle(chamfer: 8)
                            .strokeBorder(OrionColor.hullLine, lineWidth: 1)
                    }
            }
            .accessibilityLabel("Settings")
        }
        .accessibilityElement(children: .contain)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("DAILY PATROL")
                .font(OrionFont.body(13, weight: .bold))
                .foregroundStyle(OrionColor.bronze)
                .tracking(2)
            Text("Dodge the swarm. Three attempts. Same run for every pilot.")
                .font(OrionFont.body(16))
                .foregroundStyle(OrionColor.starlight)
            Text("Next patrol in \(PatrolDate.countdown(to: midnight, now: now)) PT")
                .font(OrionFont.body(14))
                .foregroundStyle(OrionColor.bronze)
        }
    }

    private var mutatorCard: some View {
        ChamferedPanel(goldBorder: true, padding: 18) {
            ZStack(alignment: .bottomTrailing) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("TODAY'S BRIEFING")
                        .font(OrionFont.body(12, weight: .bold))
                        .foregroundStyle(OrionColor.bronze)
                        .tracking(2)
                    if model.mutators.isEmpty {
                        Text("CLASSIC DAILY")
                            .font(OrionFont.display(32))
                            .foregroundStyle(OrionColor.goldGradient)
                    } else {
                        ForEach(model.mutators) { m in
                            Text(m.name)
                                .font(OrionFont.display(32))
                                .foregroundStyle(OrionColor.goldGradient)
                            Text(m.subline)
                                .font(OrionFont.body(16))
                                .foregroundStyle(OrionColor.starlight)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                PatrolSightMark(size: 40)
                    .opacity(0.10)
                    .offset(x: 10, y: 10)
                    .allowsHitTesting(false)
            }
        }
        .background {
            GoldBloom(diameter: 220)
                .offset(y: 12)
        }
    }

    private var attemptRow: some View {
        HStack(spacing: 8) {
            ForEach(0..<3, id: \.self) { i in
                AttemptPip(available: i < model.attemptsLeft)
            }
            Text(model.attemptsLeft > 0 ? "\(model.attemptsLeft) left today" : "PATROL COMPLETE")
                .font(OrionFont.body(16, weight: .bold))
                .foregroundStyle(model.attemptsLeft > 0 ? OrionColor.starlight : OrionColor.alarm)
                .tracking(model.attemptsLeft > 0 ? 0 : 2)
            Spacer()
            if let name = model.callsign {
                Text(name)
                    .font(OrionFont.body(14, weight: .bold))
                    .foregroundStyle(OrionColor.bronze)
            }
        }
        .frame(minHeight: OrionLayout.minTap)
    }

    private var launchButtons: some View {
        VStack(spacing: 12) {
            Button("Launch Patrol") { startPlay(.daily) }
                .buttonStyle(OrionButtonStyle(kind: .primary, enabled: canLaunchDaily))
                .disabled(!canLaunchDaily)
                .background {
                    if canLaunchDaily {
                        ChamferedRectangle(chamfer: 12)
                            .fill(OrionColor.hullGold.opacity(launchPulse ? 0.26 : 0.10))
                            .blur(radius: 16)
                    }
                }
            Button("Training Ground") { startPlay(.training) }
                .buttonStyle(OrionButtonStyle(kind: .secondary))
            if model.attemptsLeft == 0 && !model.isPremium {
                Button("Unlock Gold Patrol") { premium = .calendar }
                    .buttonStyle(OrionButtonStyle(kind: .secondary))
            }
            Button("Patrol Calendar") { openCalendar() }
                .buttonStyle(OrionButtonStyle(kind: .secondary))
            Button(action: openWingmates) {
                HStack(spacing: 8) {
                    Text("Wingmates")
                    if !model.isPremium {
                        PremiumLockGlyph()
                    }
                    if model.pendingFriends > 0 {
                        Circle()
                            .fill(OrionColor.alarm)
                            .frame(width: 8, height: 8)
                    }
                }
            }
            .buttonStyle(OrionButtonStyle(kind: .secondary))
            .accessibilityLabel(model.isPremium ? "Wingmates" : "Wingmates, Gold Patrol locked")
            Button("Feedback") { showFeedback = true }
                .buttonStyle(OrionButtonStyle(kind: .secondary))
        }
    }

    private var boardSummary: some View {
        ChamferedPanel {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("TODAY'S BOARD")
                        .font(OrionFont.body(13, weight: .bold))
                        .foregroundStyle(OrionColor.bronze)
                        .tracking(2)
                    Spacer()
                    NavigationLink("Full Board") {
                        BoardView()
                    }
                    .font(OrionFont.body(16, weight: .bold))
                    .foregroundStyle(OrionColor.hullGold)
                    .frame(minHeight: OrionLayout.minTap)
                }
                if let entries = model.board?.entries, !entries.isEmpty {
                    ForEach(Array(entries.prefix(5).enumerated()), id: \.element.id) { idx, row in
                        boardRow(rank: idx + 1, row: row)
                    }
                } else if !model.online {
                    Text("Board is offline.")
                        .font(OrionFont.body(15))
                        .foregroundStyle(OrionColor.bronze)
                } else {
                    Text("No scores yet today.")
                        .font(OrionFont.body(15))
                        .foregroundStyle(OrionColor.bronze)
                }
                if let best = model.myBest {
                    row(label: "Your best", value: "\(best.formatted())" + (model.myRank.map { "  #\($0)" } ?? ""))
                }
            }
        }
    }

    private func boardRow(rank: Int, row: DailyBoardEntry) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("\(rank)")
                .font(OrionFont.display(16, weight: .bold))
                .foregroundStyle(OrionColor.hullGold)
                .frame(width: 22, alignment: .trailing)
            Text(OrionFormat.callsign(row))
                .font(OrionFont.body(15, weight: .bold))
                .foregroundStyle(OrionColor.starlight)
                .lineLimit(1)
            Spacer(minLength: 8)
            if let t = row.bestTime {
                Text(OrionFormat.survived(t))
                    .font(OrionFont.body(13))
                    .foregroundStyle(OrionColor.bronze)
                    .monospacedDigit()
            }
            Text(row.best.formatted())
                .font(OrionFont.display(16, weight: .bold))
                .foregroundStyle(OrionColor.starlight)
                .monospacedDigit()
        }
        .frame(minHeight: 28)
    }

    private func row(label: String, value: String) -> some View {
        HStack {
            Text(label.uppercased())
                .font(OrionFont.body(13, weight: .bold))
                .foregroundStyle(OrionColor.bronze)
            Spacer()
            Text(value)
                .font(OrionFont.display(18, weight: .bold))
                .foregroundStyle(OrionColor.starlight)
                .monospacedDigit()
        }
    }
}

extension PlayMode: Identifiable {
    var id: String { rawValue }
}

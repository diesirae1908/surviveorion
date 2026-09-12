import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var model: AppModel
    @State private var now = Date()
    @State private var playMode: PlayMode?
    @State private var showGameOver = false

    private var midnight: Date { PatrolDate.nextMidnight(after: now) }
    private var canLaunchDaily: Bool { model.online && model.attemptsLeft > 0 }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                mutatorCard
                attemptRow
                launchButtons
                boardSummary
                if let err = model.lastError {
                    Text(err)
                        .font(OrionFont.body(14))
                        .foregroundStyle(OrionColor.alarm)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
        }
        .background(OrionColor.void.ignoresSafeArea())
        .navigationTitle("ORION")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink {
                    SettingsView()
                } label: {
                    Text("Settings")
                        .font(OrionFont.body(16, weight: .bold))
                        .foregroundStyle(OrionColor.hullGold)
                        .frame(minWidth: OrionLayout.minTap, minHeight: OrionLayout.minTap)
                }
            }
        }
        .task { await model.refresh() }
        .onChange(of: model.pendingPlay) { _, mode in
            if let mode {
                playMode = mode
                model.pendingPlay = nil
            }
        }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { now = $0 }
        .fullScreenCover(item: $playMode) { mode in
            PlayView(mode: mode) { result in
                playMode = nil
                model.lastResult = result
                showGameOver = true
                Task { await model.refresh() }
            }
            .environmentObject(model)
        }
        .sheet(isPresented: $showGameOver) {
            if let result = model.lastResult {
                GameOverView(result: result) { showGameOver = false }
            }
        }
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
        VStack(alignment: .leading, spacing: 8) {
            if model.mutators.isEmpty {
                Text("Classic daily")
                    .font(OrionFont.display(28))
                    .foregroundStyle(OrionColor.hullGold)
            } else {
                ForEach(model.mutators) { m in
                    Text(m.name)
                        .font(OrionFont.display(28))
                        .foregroundStyle(OrionColor.hullGold)
                    Text(m.subline)
                        .font(OrionFont.body(16))
                        .foregroundStyle(OrionColor.starlight)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(OrionColor.deepSpace)
    }

    private var attemptRow: some View {
        HStack(spacing: 8) {
            ForEach(0..<3, id: \.self) { i in
                Text("◆")
                    .foregroundStyle(i < model.attemptsLeft ? OrionColor.hullGold : OrionColor.bronze.opacity(0.35))
            }
            Text(model.attemptsLeft > 0 ? "\(model.attemptsLeft) left today" : "done for today")
                .font(OrionFont.body(16, weight: .bold))
                .foregroundStyle(model.attemptsLeft > 0 ? OrionColor.starlight : OrionColor.alarm)
            Spacer()
            if let name = model.callsign {
                Text(name)
                    .font(OrionFont.body(14, weight: .bold))
                    .foregroundStyle(OrionColor.bronze)
            }
        }
    }

    private var launchButtons: some View {
        VStack(spacing: 12) {
            Button("Launch Patrol") { playMode = .daily }
                .buttonStyle(OrionButtonStyle(disabled: !canLaunchDaily))
                .disabled(!canLaunchDaily)
            Button("Training Ground") { playMode = .training }
                .buttonStyle(OrionButtonStyle(fill: OrionColor.deepSpace, text: OrionColor.hullGold))
        }
    }

    private var boardSummary: some View {
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
            if let top = model.topEntry {
                row(label: "Top", value: "\(top.callsign)  \(top.best.formatted())")
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
        .padding(16)
        .background(OrionColor.deepSpace)
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
        }
    }
}

extension PlayMode: Identifiable {
    var id: String { rawValue }
}

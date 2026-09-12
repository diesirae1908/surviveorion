import SwiftUI

struct GameOverView: View {
    let result: GameResult
    var onDone: () -> Void

    @Environment(\.verticalSizeClass) private var vSize
    @State private var scoreLanded = false

    private var landscape: Bool { vSize == .compact }
    private var hasMedal: Bool {
        if let medal = result.medal, !medal.isEmpty { return true }
        return false
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if landscape {
                    landscapeBody
                } else {
                    portraitBody
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background {
                ZStack {
                    OrionColor.void
                    StarfieldBackground()
                }
                .ignoresSafeArea()
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
        }
        .presentationDetents([.medium, .large])
        .onAppear {
            withAnimation(OrionMotion.gameOver) {
                scoreLanded = true
            }
        }
    }

    private var portraitBody: some View {
        VStack(spacing: 0) {
            Text(result.mode == .training ? "TRAINING" : "PATROL OVER")
                .font(OrionFont.body(13, weight: .bold))
                .foregroundStyle(OrionColor.bronze)
                .tracking(2)
                .frame(maxWidth: .infinity)
            scoreTrophy
                .padding(.top, 12)
            statRow
                .padding(.top, 24)
            Spacer(minLength: 16)
            actionButtons
        }
    }

    private var landscapeBody: some View {
        VStack(spacing: 16) {
            HStack(alignment: .center, spacing: 20) {
                VStack(spacing: 8) {
                    Text(result.mode == .training ? "TRAINING" : "PATROL OVER")
                        .font(OrionFont.body(13, weight: .bold))
                        .foregroundStyle(OrionColor.bronze)
                        .tracking(2)
                    scoreTrophy
                }
                .frame(maxWidth: .infinity)
                statColumn
                    .frame(maxWidth: .infinity)
            }
            Spacer(minLength: 8)
            actionButtons
        }
    }

    private var scoreTrophy: some View {
        Text(result.score.formatted())
            .font(OrionFont.display(60))
            .foregroundStyle(OrionColor.goldGradient)
            .monospacedDigit()
            .scaleEffect(scoreLanded ? 1 : 0.96)
            .opacity(scoreLanded ? 1 : 0)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 140)
            .background {
                GoldBloom(diameter: 200)
                PatrolSightMark(size: 140, showCore: false)
                    .opacity(0.08)
            }
    }

    private var statRow: some View {
        HStack(alignment: .top, spacing: 12) {
            statCell(label: "SURVIVED", value: formatTime(result.timeSurvived))
            statCell(label: "KILLS", value: "\(result.kills)")
            if hasMedal, let medal = result.medal {
                medalCell(medal)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var statColumn: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                statCell(label: "SURVIVED", value: formatTime(result.timeSurvived))
                statCell(label: "KILLS", value: "\(result.kills)")
            }
            if hasMedal, let medal = result.medal {
                medalCell(medal)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
    }

    private func statCell(label: String, value: String) -> some View {
        VStack(spacing: 6) {
            Text(label)
                .font(OrionFont.body(12, weight: .bold))
                .foregroundStyle(OrionColor.bronze)
                .tracking(2)
            Text(value)
                .font(OrionFont.display(22, weight: .bold))
                .foregroundStyle(OrionColor.starlight)
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity)
    }

    private func medalCell(_ medal: String) -> some View {
        VStack(spacing: 6) {
            Text("MEDAL")
                .font(OrionFont.body(12, weight: .bold))
                .foregroundStyle(OrionColor.bronze)
                .tracking(2)
            Text(medal.uppercased())
                .font(OrionFont.body(12, weight: .bold))
                .foregroundStyle(OrionColor.void)
                .tracking(2)
                .frame(width: 64, height: 28)
                .background(OrionColor.medalGradient(named: medal), in: ChamferedRectangle(chamfer: 8))
        }
        .frame(maxWidth: .infinity)
    }

    private var actionButtons: some View {
        VStack(spacing: 12) {
            if result.sharePng != nil {
                Button("Share") { share() }
                    .buttonStyle(OrionButtonStyle(kind: .secondary))
            }
            Button("Done") { onDone() }
                .buttonStyle(OrionButtonStyle(kind: .primary))
        }
    }

    private func formatTime(_ t: Double) -> String {
        let m = Int(t) / 60
        let s = Int(t) % 60
        return String(format: "%d:%02d", m, s)
    }

    private func share() {
        var items: [Any] = []
        if let data = result.sharePng, let img = UIImage(data: data) {
            items.append(img)
        }
        items.append("ORION Daily Patrol. Dodge the swarm. Three attempts.")
        let av = UIActivityViewController(activityItems: items, applicationActivities: nil)
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        scene?.keyWindow?.rootViewController?.present(av, animated: true)
    }
}

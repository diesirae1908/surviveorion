import SwiftUI

struct GameOverView: View {
    let result: GameResult
    var onDone: () -> Void

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text(result.mode == .training ? "TRAINING" : "PATROL OVER")
                    .font(OrionFont.body(13, weight: .bold))
                    .foregroundStyle(OrionColor.bronze)
                    .tracking(2)
                Text(result.score.formatted())
                    .font(OrionFont.display(48))
                    .foregroundStyle(OrionColor.hullGold)
                metric("Survived", formatTime(result.timeSurvived))
                metric("Kills", "\(result.kills)")
                if let medal = result.medal, !medal.isEmpty {
                    metric("Medal", medal.uppercased())
                }
                Spacer()
                if result.sharePng != nil {
                    Button("Share") { share() }
                        .buttonStyle(OrionButtonStyle(fill: OrionColor.deepSpace, text: OrionColor.hullGold))
                }
                Button("Done") { onDone() }
                    .buttonStyle(OrionButtonStyle())
            }
            .padding(24)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(OrionColor.void.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
    }

    private func metric(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label.uppercased())
                .font(OrionFont.body(13, weight: .bold))
                .foregroundStyle(OrionColor.bronze)
            Spacer()
            Text(value)
                .font(OrionFont.display(22))
                .foregroundStyle(OrionColor.starlight)
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

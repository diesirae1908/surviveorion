import SwiftUI
import UIKit

struct GameOverView: View {
    let result: GameResult
    var callsign: String? = nil
    var autoShare = false
    var isAdmin = false
    var isPremium = false
    var onDone: () -> Void
    var onFeedback: (() -> Void)? = nil
    var onAnalytics: (() -> Void)? = nil
    var onUnlockArchive: (() -> Void)? = nil

    @Environment(\.verticalSizeClass) private var vSize
    @State private var scoreLanded = false
    @State private var sharePresented = false
    @State private var clipNote: String?
    @State private var clipSaved = false
    @State private var showFeedback = false

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
        .background {
            ShareSheetHost(isPresented: $sharePresented, items: shareItems)
        }
        .presentationDetents([.medium, .large])
        .onAppear {
            withAnimation(OrionMotion.gameOver) {
                scoreLanded = true
            }
            if autoShare {
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                    sharePresented = true
                }
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
            Button("Share") { sharePresented = true }
                .buttonStyle(OrionButtonStyle(kind: .secondary))
            Button("Done") { onDone() }
                .buttonStyle(OrionButtonStyle(kind: .primary))
            HStack(spacing: 16) {
                Button("Feedback") {
                    if let onFeedback { onFeedback() } else { showFeedback = true }
                }
                if isPremium {
                    Button("Analytics") {
                        onAnalytics?()
                    }
                } else {
                    Button("Unlock Patrol Archive") {
                        onUnlockArchive?()
                    }
                }
            }
            .font(OrionFont.body(13, weight: .bold))
            .foregroundStyle(OrionColor.bronze)
            .frame(minHeight: OrionLayout.minTap)
            if isAdmin, result.clipData != nil {
                HStack(spacing: 16) {
                    Button(clipSaved ? "Saved" : "Save Clip") { Task { await saveClip() } }
                        .font(OrionFont.body(13, weight: .bold))
                        .foregroundStyle(clipSaved ? OrionColor.hullGold : OrionColor.bronze)
                    Button("Send to Inbox") { Task { await sendInbox() } }
                        .font(OrionFont.body(13, weight: .bold))
                        .foregroundStyle(OrionColor.bronze)
                }
                .frame(minHeight: OrionLayout.minTap)
            }
            if let clipNote {
                Text(clipNote)
                    .font(OrionFont.body(13))
                    .foregroundStyle(OrionColor.alarm)
            }
        }
        .sheet(isPresented: $showFeedback) {
            FeedbackView(asSheet: true) { showFeedback = false }
        }
    }

    private func saveClip() async {
        guard let data = result.clipData else { return }
        var access = ClipStore.photosStatus()
        if access != .granted {
            access = await ClipStore.requestPhotos()
        }
        if access != .granted {
            clipNote = "Enable Photos access in Settings to save clips."
            return
        }
        do {
            try await ClipStore.saveVideo(data: data, ext: result.clipExt ?? "mp4")
            clipSaved = true
            clipNote = nil
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { clipSaved = false }
        } catch {
            clipNote = "Enable Photos access in Settings to save clips."
        }
    }

    private func sendInbox() async {
        guard let data = result.clipData,
              let base = result.clipBasename,
              let side = result.clipSidecar
        else { return }
        do {
            try await APIClient.shared.uploadClip(
                video: data,
                sidecar: side,
                basename: base,
                ext: result.clipExt ?? "mp4"
            )
            clipNote = nil
            clipSaved = true
        } catch {
            clipNote = error.localizedDescription
        }
    }

    private func formatTime(_ t: Double) -> String {
        let m = Int(t) / 60
        let s = Int(t) % 60
        return String(format: "%d:%02d", m, s)
    }

    private func shareText() -> String {
        var parts: [String] = []
        parts.append(result.mode == .training ? "ORION Training Ground" : "ORION Daily Patrol")
        parts.append("Score \(result.score.formatted())")
        parts.append("Survived \(formatTime(result.timeSurvived))")
        if let medal = result.medal, !medal.isEmpty {
            parts.append("Medal \(medal)")
        }
        if let name = result.callsign ?? callsign, !name.isEmpty {
            parts.append(name)
        }
        parts.append("surviveorion.com")
        return parts.joined(separator: ". ")
    }

    private var shareItems: [Any] {
        var items: [Any] = []
        if let data = result.sharePng, let img = UIImage(data: data) {
            items.append(img)
        }
        items.append(shareText())
        return items
    }
}

/// Presents UIActivityViewController from a VC inside the game-over sheet.
private struct ShareSheetHost: UIViewControllerRepresentable {
    @Binding var isPresented: Bool
    var items: [Any]

    func makeUIViewController(context: Context) -> Host {
        Host()
    }

    func updateUIViewController(_ host: Host, context: Context) {
        host.items = items
        if isPresented {
            host.presentShare { isPresented = false }
        }
    }

    final class Host: UIViewController {
        var items: [Any] = []
        private var presenting = false
        private var attachTries = 0

        func presentShare(onDismiss: @escaping () -> Void) {
            guard !presenting, presentedViewController == nil else { return }
            if viewIfLoaded?.window == nil {
                attachTries += 1
                guard attachTries < 40 else { return }
                DispatchQueue.main.async { [weak self] in
                    self?.presentShare(onDismiss: onDismiss)
                }
                return
            }
            attachTries = 0
            presenting = true
            let av = UIActivityViewController(activityItems: items, applicationActivities: nil)
            av.completionWithItemsHandler = { [weak self] _, _, _, _ in
                self?.presenting = false
                onDismiss()
            }
            if let pop = av.popoverPresentationController {
                pop.sourceView = view
                pop.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 8, height: 8)
                pop.permittedArrowDirections = []
            }
            present(av, animated: true)
        }
    }
}

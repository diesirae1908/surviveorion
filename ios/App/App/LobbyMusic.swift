import AVFoundation
import Foundation

/// Website menu bed (`public/music/empire-of-the-stars.mp3`), looping on native Home.
@MainActor
final class LobbyMusic {
    static let shared = LobbyMusic()

    private var player: AVAudioPlayer?
    private var shouldPlay = true

    func prepare() {
        guard player == nil else { return }
        guard let url = Bundle.main.url(forResource: "empire-of-the-stars", withExtension: "mp3") else {
            return
        }
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
            let p = try AVAudioPlayer(contentsOf: url)
            p.numberOfLoops = -1
            p.volume = 0.45
            p.prepareToPlay()
            player = p
        } catch {
            player = nil
        }
    }

    func play() {
        shouldPlay = true
        prepare()
        player?.play()
    }

    func pause() {
        shouldPlay = false
        player?.pause()
    }

    func resumeIfNeeded() {
        guard shouldPlay else {
            play()
            return
        }
        prepare()
        player?.play()
    }
}

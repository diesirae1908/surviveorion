import AVFoundation
import Foundation

/// Website menu bed (`public/music/empire-of-the-stars.mp3`), looping on native Home.
@MainActor
final class LobbyMusic: NSObject {
    static let shared = LobbyMusic()

    private var player: AVAudioPlayer?
    private var sting: AVAudioPlayer?
    private var gameOver: AVAudioPlayer?
    private var shouldPlay = true
    /// Bed volume before it was ducked for the sting, so resume restores it exactly.
    private var duckedBedVolume: Float?

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
        stopGameOver()
        prepare()
        unduckBed()
        player?.play()
    }

    func pause() {
        shouldPlay = false
        unduckBed()
        player?.pause()
    }

    func resumeIfNeeded() {
        guard shouldPlay else {
            play()
            return
        }
        prepare()
        unduckBed()
        player?.play()
    }

    /// Website game-over bed (`public/music/imperial-procession.mp3`) under the native
    /// PATROL OVER sheet. Pauses the Home bed so the two never double up.
    func playGameOver() {
        guard let url = Bundle.main.url(forResource: "imperial-procession", withExtension: "mp3") else {
            return
        }
        player?.pause()
        shouldPlay = false
        if let gameOver, gameOver.isPlaying { return }
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
            let p = try AVAudioPlayer(contentsOf: url)
            p.numberOfLoops = -1
            p.volume = 0.4
            p.prepareToPlay()
            gameOver = p
            p.play()
        } catch {
            gameOver = nil
        }
    }

    func stopGameOver() {
        gameOver?.stop()
        gameOver = nil
    }

    /// One-shot PATROL COMPLETE sting. The bed goes silent underneath while it
    /// plays (was audibly doubling with the sting, TestFlight build 9 feedback)
    /// and comes back at its prior volume once the sting finishes.
    func playSting() {
        guard let url = Bundle.main.url(forResource: "patrol-complete", withExtension: "mp3") else {
            return
        }
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
            let p = try AVAudioPlayer(contentsOf: url)
            p.numberOfLoops = 0
            p.volume = 0.5
            p.delegate = self
            p.prepareToPlay()
            sting = p
            duckBed()
            p.play()
        } catch {
            sting = nil
        }
    }

    private func duckBed() {
        guard let bed = player, duckedBedVolume == nil else { return }
        duckedBedVolume = bed.volume
        bed.volume = 0
    }

    private func unduckBed() {
        guard let restored = duckedBedVolume else { return }
        player?.volume = restored
        duckedBedVolume = nil
    }
}

extension LobbyMusic: AVAudioPlayerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.unduckBed()
        }
    }
}

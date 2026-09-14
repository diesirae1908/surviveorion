import AVFoundation
import Foundation

/// Website menu bed (`public/music/empire-of-the-stars.mp3`), looping on native Home.
@MainActor
final class LobbyMusic {
    static let shared = LobbyMusic()

    private var player: AVAudioPlayer?
    private var sting: AVAudioPlayer?
    private var gameOver: AVAudioPlayer?
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
        stopGameOver()
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

    /// One-shot PATROL COMPLETE sting. Home bed keeps looping underneath.
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
            p.prepareToPlay()
            sting = p
            p.play()
        } catch {
            sting = nil
        }
    }
}

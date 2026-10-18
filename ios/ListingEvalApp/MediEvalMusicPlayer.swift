#if os(iOS)
import AVFoundation
import UIKit

@MainActor
final class MediEvalMusicPlayer: ObservableObject {
    private var player: AVAudioPlayer?
    private var activeTrack: MediEvalMusicTrack?
    private var missingAssetLogged = false

    func update(isEnabled: Bool, track: MediEvalMusicTrack) {
        if activeTrack != track {
            stop()
            player = nil
            activeTrack = track
            missingAssetLogged = false
        }

        if isEnabled {
            start(track: track)
        } else {
            stop()
        }
    }

    private func start(track: MediEvalMusicTrack) {
        if player == nil {
            loadPlayer(track: track)
        }
        guard let player else { return }

        do {
            try AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            return
        }

        if !player.isPlaying {
            player.play()
        }
    }

    private func stop() {
        player?.stop()
        player?.currentTime = 0
    }

    private func loadPlayer(track: MediEvalMusicTrack) {
        guard let asset = NSDataAsset(name: track.assetName) else {
            if !missingAssetLogged {
                missingAssetLogged = true
                assertionFailure("Missing \(track.assetName) data asset.")
            }
            return
        }

        do {
            let newPlayer = try AVAudioPlayer(data: asset.data)
            newPlayer.numberOfLoops = -1
            newPlayer.volume = 0.18
            newPlayer.prepareToPlay()
            player = newPlayer
        } catch {
            assertionFailure("Could not prepare \(track.title): \(error.localizedDescription)")
        }
    }
}
#else
import Foundation

@MainActor
final class MediEvalMusicPlayer: ObservableObject {
    func update(isEnabled: Bool, track: MediEvalMusicTrack) {}
}
#endif

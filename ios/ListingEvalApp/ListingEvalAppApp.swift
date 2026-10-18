import SwiftUI

@main
struct ListingEvalAppApp: App {
    @StateObject private var settings = AppSettings()
    @StateObject private var musicPlayer = MediEvalMusicPlayer()
    @StateObject private var account = PlatformAccountStore()
    @StateObject private var outbox = OutboxStore()

    var body: some Scene {
        WindowGroup {
            ListingEvalRootView()
                .environmentObject(settings)
                .environmentObject(musicPlayer)
                .environmentObject(account)
                .environmentObject(outbox)
                .task {
                    musicPlayer.update(isEnabled: settings.isMusicEnabled, track: settings.musicTrack)
                }
                .onChange(of: settings.isMusicEnabled) { _, isEnabled in
                    musicPlayer.update(isEnabled: isEnabled, track: settings.musicTrack)
                }
                .onChange(of: settings.musicTrackId) { _, _ in
                    musicPlayer.update(isEnabled: settings.isMusicEnabled, track: settings.musicTrack)
                }
        }
    }
}

import Foundation
import Photos
import UIKit

enum PhotosAccess: String {
    /// iOS has never asked. The Photos row in iOS Settings only appears after the first prompt.
    case notAsked = "Tap to allow"
    case notGranted = "Denied, open Settings"
    case granted = "Granted"
}

enum ClipStore {
    private static func access(_ s: PHAuthorizationStatus) -> PhotosAccess {
        switch s {
        case .authorized, .limited: return .granted
        case .notDetermined: return .notAsked
        default: return .notGranted
        }
    }

    static func photosStatus() -> PhotosAccess {
        access(PHPhotoLibrary.authorizationStatus(for: .addOnly))
    }

    /// True until the system permission dialog has ever been shown. Once the
    /// pilot has answered (granted or denied), asking again does nothing;
    /// only Settings can change it from there.
    static func photosNeverAsked() -> Bool {
        PHPhotoLibrary.authorizationStatus(for: .addOnly) == .notDetermined
    }

    static func requestPhotos() async -> PhotosAccess {
        access(await PHPhotoLibrary.requestAuthorization(for: .addOnly))
    }

    static func saveVideo(data: Data, ext: String) async throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("orion-clip-\(UUID().uuidString).\(ext)")
        try data.write(to: url)
        try await PHPhotoLibrary.shared().performChanges {
            PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
        }
    }

    static func openSystemSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }
}

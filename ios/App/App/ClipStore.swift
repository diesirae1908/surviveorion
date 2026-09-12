import Foundation
import Photos
import UIKit

enum PhotosAccess: String {
    case notGranted = "Not granted"
    case granted = "Granted"
}

enum ClipStore {
    static func photosStatus() -> PhotosAccess {
        let s = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        return (s == .authorized || s == .limited) ? .granted : .notGranted
    }

    static func requestPhotos() async -> PhotosAccess {
        let s = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        return (s == .authorized || s == .limited) ? .granted : .notGranted
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

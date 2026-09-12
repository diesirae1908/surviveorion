import Foundation
import Security

enum KeychainStore {
    private static let service = "com.surviveorion.app"

    static func set(_ value: String?, key: String) {
        let data = value?.data(using: .utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
        guard let data else { return }
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }

    static func get(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static var token: String? {
        get { get("orion.session") }
        set { set(newValue, key: "orion.session") }
    }

    static var guestSecret: String? {
        get { get("orion.guestSecret") }
        set { set(newValue, key: "orion.guestSecret") }
    }

    static func clearSession() {
        token = nil
        guestSecret = nil
    }
}

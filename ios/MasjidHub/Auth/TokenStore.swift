import Foundation
import Security

/// Tokens live in the Keychain, not UserDefaults: they are credentials, and
/// the Keychain survives reinstalls being wiped only when we say so.
final class TokenStore {
    static let shared = TokenStore()

    private let service = "app.masjidhub.staff"
    private let accessKey = "accessToken"
    private let refreshKey = "refreshToken"

    private init() {}

    var accessToken: String? { read(accessKey) }
    var refreshToken: String? { read(refreshKey) }
    var isSignedIn: Bool { accessToken != nil }

    func save(_ tokens: AuthTokens) {
        write(tokens.accessToken, for: accessKey)
        write(tokens.refreshToken, for: refreshKey)
    }

    func clear() {
        delete(accessKey)
        delete(refreshKey)
    }

    // MARK: - Keychain

    private func query(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
    }

    private func read(_ key: String) -> String? {
        var lookup = query(key)
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        guard SecItemCopyMatching(lookup as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func write(_ value: String, for key: String) {
        delete(key)
        var item = query(key)
        item[kSecValueData as String] = Data(value.utf8)
        // Available after first unlock so background refreshes can still run.
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(item as CFDictionary, nil)
    }

    private func delete(_ key: String) {
        SecItemDelete(query(key) as CFDictionary)
    }
}

import Foundation

/// Who is signed in, and the masjid they work for. Every screen reads the
/// masjid id from here rather than passing it down.
@MainActor
final class Session: ObservableObject {
    enum State {
        case loading
        case signedOut
        case signedIn(User)
    }

    @Published private(set) var state: State = .loading
    @Published private(set) var masjid: Masjid?

    var user: User? {
        if case let .signedIn(user) = state { return user }
        return nil
    }

    /// Platform admins have no masjid of their own; the staff app is for
    /// masjid staff, so screens that need an id ask for this.
    var masjidId: String? { user?.masjidId }

    func restore() async {
        await APIClient.shared.setAuthFailureHandler { [weak self] in
            await self?.signOutLocally()
        }
        guard TokenStore.shared.isSignedIn else {
            state = .signedOut
            return
        }
        do {
            let user = try await APIClient.shared.get("/auth/me", as: User.self)
            state = .signedIn(user)
            await loadMasjid()
        } catch {
            TokenStore.shared.clear()
            state = .signedOut
        }
    }

    func signIn(email: String, password: String) async throws {
        let tokens = try await APIClient.shared.login(email: email, password: password)
        TokenStore.shared.save(tokens)
        state = .signedIn(tokens.user)
        await loadMasjid()
    }

    func signOut() async {
        // Best effort: revoke the refresh token server-side, but sign out
        // locally regardless of whether the server is reachable.
        if let refreshToken = TokenStore.shared.refreshToken {
            struct Body: Encodable { let refreshToken: String }
            _ = try? await APIClient.shared.post(
                "/auth/logout",
                body: Body(refreshToken: refreshToken),
                as: NoContent.self
            )
        }
        TokenStore.shared.clear()
        await signOutLocally()
    }

    /// Re-reads the profile after the user edits their name.
    func refreshProfile() async {
        guard let user = try? await APIClient.shared.get("/auth/me", as: User.self) else { return }
        state = .signedIn(user)
    }

    private func signOutLocally() async {
        masjid = nil
        state = .signedOut
    }

    private func loadMasjid() async {
        guard let masjidId else { return }
        masjid = try? await APIClient.shared.get("/masjids/\(masjidId)", as: Masjid.self)
    }
}

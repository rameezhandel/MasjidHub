import Foundation

/// Stand-in for endpoints that answer 204 with no body.
struct NoContent: Codable {}

enum APIError: LocalizedError {
    case unauthorized
    case server(status: Int, message: String)
    case offline
    case decoding(String)

    var errorDescription: String? {
        switch self {
        case .unauthorized:
            return "Your session has expired. Please sign in again."
        case let .server(_, message):
            return message
        case .offline:
            return "Cannot reach the server. Check your connection and try again."
        case let .decoding(detail):
            return "Unexpected response from the server. (\(detail))"
        }
    }
}

/// Thin wrapper over URLSession that adds the bearer token, retries once
/// through a refresh on 401, and turns API error bodies into readable text.
/// Everything the app talks to goes through here.
actor APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder = JSONDecoder()

    /// Set in project.yml (INFOPLIST_KEY_APIBaseURL) so builds can point at a
    /// local API without touching code.
    private let baseURL: URL

    private init() {
        let configured = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String
        let root = configured?.isEmpty == false ? configured! : "https://masjidhub-api.onrender.com"
        baseURL = URL(string: root.hasSuffix("/") ? String(root.dropLast()) : root)!

        let config = URLSessionConfiguration.default
        // Render's free tier sleeps; a cold start can take most of a minute.
        config.timeoutIntervalForRequest = 60
        config.waitsForConnectivity = true
        session = URLSession(configuration: config)
    }

    /// Called when refreshing fails, so the app can drop back to the login screen.
    var onAuthFailure: (@Sendable () async -> Void)?

    func setAuthFailureHandler(_ handler: @escaping @Sendable () async -> Void) {
        onAuthFailure = handler
    }

    // MARK: - Requests

    func get<T: Decodable>(_ path: String, as type: T.Type) async throws -> T {
        try await send(path: path, method: "GET", body: Optional<NoContent>.none, as: type)
    }

    @discardableResult
    func post<B: Encodable, T: Decodable>(
        _ path: String,
        body: B,
        as type: T.Type
    ) async throws -> T {
        try await send(path: path, method: "POST", body: body, as: type)
    }

    @discardableResult
    func patch<B: Encodable, T: Decodable>(
        _ path: String,
        body: B,
        as type: T.Type
    ) async throws -> T {
        try await send(path: path, method: "PATCH", body: body, as: type)
    }

    /// Unauthenticated call, for signing in.
    func login(email: String, password: String) async throws -> AuthTokens {
        struct Credentials: Encodable {
            let email: String
            let password: String
        }
        return try await send(
            path: "/auth/login",
            method: "POST",
            body: Credentials(email: email, password: password),
            as: AuthTokens.self,
            authenticated: false
        )
    }

    // MARK: - Plumbing


    private func send<B: Encodable, T: Decodable>(
        path: String,
        method: String,
        body: B?,
        as type: T.Type,
        authenticated: Bool = true,
        isRetry: Bool = false
    ) async throws -> T {
        // Built by string, not appendingPathComponent: that would percent-escape
        // the "?" and turn a query string into part of the path.
        guard let url = URL(string: baseURL.absoluteString + "/api/v1" + path) else {
            throw APIError.decoding("bad path \(path)")
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        if authenticated, let token = TokenStore.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.offline
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.decoding("no HTTP response")
        }

        if http.statusCode == 401, authenticated, !isRetry {
            if await refreshTokens() {
                return try await send(
                    path: path, method: method, body: body, as: type,
                    authenticated: authenticated, isRetry: true
                )
            }
            await onAuthFailure?()
            throw APIError.unauthorized
        }

        guard (200 ..< 300).contains(http.statusCode) else {
            throw APIError.server(status: http.statusCode, message: Self.message(from: data, status: http.statusCode))
        }

        // 204 and other empty bodies still need to satisfy the return type.
        if data.isEmpty, let empty = NoContent() as? T {
            return empty
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(String(describing: error))
        }
    }

    /// Nest returns `{ message: string | string[] }` on failures.
    private static func message(from data: Data, status: Int) -> String {
        struct Failure: Decodable {
            let message: MessageValue?

            enum MessageValue: Decodable {
                case single(String)
                case many([String])

                init(from decoder: Decoder) throws {
                    let container = try decoder.singleValueContainer()
                    if let one = try? container.decode(String.self) {
                        self = .single(one)
                    } else {
                        self = .many((try? container.decode([String].self)) ?? [])
                    }
                }

                var text: String {
                    switch self {
                    case let .single(value): return value
                    case let .many(values): return values.joined(separator: "; ")
                    }
                }
            }
        }
        if let failure = try? JSONDecoder().decode(Failure.self, from: data),
           let text = failure.message?.text, !text.isEmpty {
            return text
        }
        return "The server returned an error (\(status))."
    }

    private func refreshTokens() async -> Bool {
        guard let refreshToken = TokenStore.shared.refreshToken else { return false }
        struct Body: Encodable { let refreshToken: String }
        do {
            let tokens: AuthTokens = try await send(
                path: "/auth/refresh",
                method: "POST",
                body: Body(refreshToken: refreshToken),
                as: AuthTokens.self,
                authenticated: false,
                isRetry: true
            )
            TokenStore.shared.save(tokens)
            return true
        } catch {
            TokenStore.shared.clear()
            return false
        }
    }
}

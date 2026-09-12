import Foundation

enum APIError: LocalizedError {
    case offline
    case server(String)
    case unauthorized

    var errorDescription: String? {
        switch self {
        case .offline: return "Can't reach patrol command."
        case .server(let m): return m
        case .unauthorized: return "Sign in to continue."
        }
    }
}

struct UserInfo: Codable, Equatable {
    var callsign: String
    var country: String
}

struct DailyBoardEntry: Codable, Identifiable {
    var userId: Int?
    var callsign: String
    var country: String
    var best: Int
    var runs: Int
    var bestTime: Double?
    var mode: String?
    var virtual: Bool?

    var id: String { "\(userId ?? 0)-\(callsign)-\(best)-\(mode ?? "")" }
}

struct DailyBoardMe: Codable {
    var rank: Int
    var best: Int
    var mode: String?
}

struct DailyBoard: Codable {
    var date: String
    var entries: [DailyBoardEntry]
    var me: DailyBoardMe?
}

struct MeResponse: Codable {
    var user: UserInfo
    var hasPassword: Bool?
}

struct LoginResponse: Codable {
    var token: String
    var user: UserInfo
    var isNew: Bool?
}

struct AppConfig: Codable {
    var googleClientId: String
}

actor APIClient {
    static let shared = APIClient()
    static let origin = URL(string: "https://surviveorion.com")!

    func dailyBoard(limit: Int = 50) async throws -> DailyBoard {
        try await request("GET", "/api/leaderboard/daily?mode=all&limit=\(limit)")
    }

    func me() async throws -> MeResponse {
        try await request("GET", "/api/me")
    }

    func login(callsign: String, password: String) async throws -> LoginResponse {
        try await request("POST", "/api/auth/login", body: [
            "callsign": callsign,
            "password": password,
        ])
    }

    func config() async throws -> AppConfig {
        try await request("GET", "/api/config")
    }

    func googleSignIn(idToken: String, country: String) async throws -> LoginResponse {
        try await request("POST", "/api/auth/google", body: [
            "idToken": idToken,
            "country": country,
        ])
    }

    func appleSignIn(identityToken: String, name: String?, country: String) async throws -> LoginResponse {
        var body: [String: String] = [
            "identityToken": identityToken,
            "country": country,
        ]
        if let name, !name.isEmpty { body["name"] = name }
        return try await request("POST", "/api/auth/apple", body: body)
    }

    func logout() async {
        _ = try? await requestEmpty("POST", "/api/auth/logout")
    }

    func deleteAccount() async throws {
        try await requestEmpty("DELETE", "/api/me")
    }

    private func request<T: Decodable>(_ method: String, _ path: String, body: [String: String]? = nil) async throws -> T {
        let data = try await send(method, path, body: body)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func requestEmpty(_ method: String, _ path: String) async throws {
        _ = try await send(method, path, body: nil)
    }

    private func send(_ method: String, _ path: String, body: [String: String]?) async throws -> Data {
        guard let url = URL(string: path, relativeTo: Self.origin) else { throw APIError.offline }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = KeychainStore.token {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(body)
        }
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            if code == 401 { throw APIError.unauthorized }
            if code >= 400 {
                let err = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
                throw APIError.server(err ?? "request failed (\(code))")
            }
            return data
        } catch let e as APIError {
            throw e
        } catch {
            throw APIError.offline
        }
    }
}

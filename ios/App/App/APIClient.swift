import Foundation

enum APIError: LocalizedError {
    case offline
    case server(String)
    case unauthorized
    case forbidden(String)

    var errorDescription: String? {
        switch self {
        case .offline: return "Can't reach patrol command."
        case .server(let m): return m
        case .unauthorized: return "Sign in to continue."
        case .forbidden(let m): return m
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
    var pendingFriends: Int?
    var joinedAt: Double?
    var clipInbox: Bool?
    var tier: String?
    var premiumActive: Bool?
}

struct LoginResponse: Codable {
    var token: String
    var user: UserInfo
    var isNew: Bool?
}

struct AppConfig: Codable {
    var googleClientId: String
}

struct DailyHistoryEntry: Codable, Identifiable {
    var date: String
    var best: Int
    var bestTime: Double
    var runs: Int
    var rank: Int?

    var id: String { date }
}

struct DailyHistoryResponse: Codable {
    var entries: [DailyHistoryEntry]
}

struct MutatorDay: Codable, Identifiable {
    var date: String
    var name: String
    var subline: String?
    var names: [String]?

    var id: String { date }
}

struct MutatorRangeResponse: Codable {
    var entries: [MutatorDay]
    var today: String?
    var horizon: Int?
}

struct FriendsResponse: Codable {
    var friends: [FriendRow]
    var incoming: [FriendRow]
    var outgoing: [FriendRow]
}

struct FriendRow: Codable, Identifiable {
    var userId: Int?
    var callsign: String
    var country: String
    var best: Int?
    var bestTime: Double?
    var runs: Int?

    var id: String { callsign }
}

struct FriendsBoardResponse: Codable {
    var date: String?
    var entries: [FriendRow]
}

struct FriendActivity: Codable, Identifiable {
    var callsign: String
    var country: String?
    var score: Int?
    var timeSurvived: Double?
    var createdAt: Double?

    var id: String { "\(callsign)-\(createdAt ?? 0)-\(score ?? 0)" }
}

struct FriendActivityResponse: Codable {
    var activity: [FriendActivity]
}

struct PremiumReportResponse: Codable {
    var ok: Bool?
    var tier: String?
    var premiumActive: Bool?
    var premiumUntil: Double?
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
        try await request("POST", "/api/auth/login", json: [
            "callsign": callsign,
            "password": password,
        ])
    }

    func config() async throws -> AppConfig {
        try await request("GET", "/api/config")
    }

    func googleSignIn(idToken: String, country: String) async throws -> LoginResponse {
        try await request("POST", "/api/auth/google", json: [
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
        return try await request("POST", "/api/auth/apple", json: body)
    }

    func logout() async {
        _ = try? await requestEmpty("POST", "/api/auth/logout")
    }

    func deleteAccount() async throws {
        try await requestEmpty("DELETE", "/api/me")
    }

    func dailyHistory(from: String, to: String) async throws -> DailyHistoryResponse {
        try await request("GET", "/api/me/daily-history?from=\(from)&to=\(to)")
    }

    func patrolMutators(from: String, to: String) async throws -> MutatorRangeResponse {
        try await request("GET", "/api/patrol-mutators?from=\(from)&to=\(to)")
    }

    func sendFeedback(message: String, email: String?, context: String) async throws {
        var body: [String: String] = ["message": message, "context": context]
        if let email, !email.isEmpty { body["email"] = email }
        try await requestEmpty("POST", "/api/feedback", json: body)
    }

    func friends() async throws -> FriendsResponse {
        try await request("GET", "/api/friends")
    }

    func friendsBoard(date: String) async throws -> FriendsBoardResponse {
        try await request("GET", "/api/friends/leaderboard?date=\(date)")
    }

    func friendActivity() async throws -> FriendActivityResponse {
        try await request("GET", "/api/friends/activity")
    }

    func requestFriend(callsign: String) async throws {
        try await requestEmpty("POST", "/api/friends/request", json: ["callsign": callsign])
    }

    func acceptFriend(callsign: String) async throws {
        try await requestEmpty("POST", "/api/friends/accept", json: ["callsign": callsign])
    }

    func removeFriend(callsign: String) async throws {
        try await requestEmpty("POST", "/api/friends/remove", json: ["callsign": callsign])
    }

    func reportPremium(signedTransaction: String) async throws -> PremiumReportResponse {
        try await request("POST", "/api/me/premium", json: ["signedTransaction": signedTransaction])
    }

    func uploadClip(video: Data, sidecar: String, basename: String, ext: String) async throws {
        let boundary = "orion-\(UUID().uuidString)"
        var body = Data()
        func part(_ name: String, filename: String?, type: String?, data: Data) {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            if let filename {
                body.append("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
            } else {
                body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n".data(using: .utf8)!)
            }
            if let type {
                body.append("Content-Type: \(type)\r\n".data(using: .utf8)!)
            }
            body.append("\r\n".data(using: .utf8)!)
            body.append(data)
            body.append("\r\n".data(using: .utf8)!)
        }
        part("basename", filename: nil, type: nil, data: Data(basename.utf8))
        part("sidecar", filename: "\(basename).json", type: "application/json", data: Data(sidecar.utf8))
        part("video", filename: "\(basename).\(ext)", type: ext == "mp4" ? "video/mp4" : "video/webm", data: video)
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        _ = try await send("POST", "/api/clip-inbox", raw: body, contentType: "multipart/form-data; boundary=\(boundary)")
    }

    private func request<T: Decodable>(_ method: String, _ path: String, json: [String: String]? = nil) async throws -> T {
        let data = try await send(method, path, json: json)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func requestEmpty(_ method: String, _ path: String, json: [String: String]? = nil) async throws {
        _ = try await send(method, path, json: json)
    }

    private func send(
        _ method: String,
        _ path: String,
        json: [String: String]? = nil,
        raw: Data? = nil,
        contentType: String? = nil
    ) async throws -> Data {
        guard let url = URL(string: path, relativeTo: Self.origin) else { throw APIError.offline }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = KeychainStore.token {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let raw {
            req.setValue(contentType ?? "application/octet-stream", forHTTPHeaderField: "Content-Type")
            req.httpBody = raw
        } else if let json {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(json)
        }
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            if code == 401 { throw APIError.unauthorized }
            if code == 403 {
                let err = (try? JSONDecoder().decode([String: String].self, from: data))
                throw APIError.forbidden(err?["error"] ?? "not allowed")
            }
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

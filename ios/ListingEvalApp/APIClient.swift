import Foundation

enum EvalAPIError: LocalizedError {
    case invalidBaseURL
    case badStatus(Int, String)
    case rejected(String)

    var errorDescription: String? {
        switch self {
        case .invalidBaseURL:
            return "Invalid server URL."
        case .badStatus(let status, let message):
            let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
            let preview = trimmed.count > 240 ? "\(trimmed.prefix(240))..." : trimmed
            if status == 401 || status == 403 {
                return "The server rejected the royal seal. Check the token and try again."
            }
            if preview.isEmpty {
                return "Server returned \(status)."
            }
            return "Server returned \(status): \(preview)"
        case .rejected(let message):
            let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? "The server rejected the request." : trimmed
        }
    }
}

private protocol MediEvalOKResponse {
    var ok: Bool { get }
}

private struct MediEvalBasicOKResponse: Decodable, MediEvalOKResponse {
    let ok: Bool
    let error: String?
}

private struct MediEvalErrorResponse: Decodable {
    let error: String?
}

extension EvalDeckResponse: MediEvalOKResponse {}
extension EvalSummaryResponse: MediEvalOKResponse {}
extension GameProfileResponse: MediEvalOKResponse {}
extension GameLeaderboardResponse: MediEvalOKResponse {}

private func mediEvalServerMessage(from data: Data) -> String {
    if let body = try? JSONDecoder().decode(MediEvalErrorResponse.self, from: data),
       let error = body.error?.trimmingCharacters(in: .whitespacesAndNewlines),
       !error.isEmpty {
        return error
    }
    return String(data: data, encoding: .utf8) ?? ""
}

private func decodeMediEvalResponse<T: Decodable & MediEvalOKResponse>(_ type: T.Type, from data: Data) throws -> T {
    let decoded = try JSONDecoder().decode(T.self, from: data)
    guard decoded.ok else {
        throw EvalAPIError.rejected(mediEvalServerMessage(from: data))
    }
    return decoded
}

func mediEvalErrorMessage(_ error: Error, serviceName: String = "server") -> String {
    if let apiError = error as? EvalAPIError {
        return apiError.localizedDescription
    }

    if let urlError = error as? URLError {
        switch urlError.code {
        case .cannotFindHost, .cannotConnectToHost, .networkConnectionLost, .notConnectedToInternet, .timedOut:
            return "Cannot reach the \(serviceName). For Local Demo, run `npm run demo` on your Mac first. On a physical iPhone, use the Mac's Wi-Fi IP address and allow Local Network access."
        case .appTransportSecurityRequiresSecureConnection:
            return "iOS blocked this non-local HTTP connection. Use HTTPS for deployed services, or use the bundled Local Demo on your local network."
        case .unsupportedURL, .badURL:
            return "The \(serviceName) URL is not valid."
        default:
            return urlError.localizedDescription
        }
    }

    if error is DecodingError {
        return "The \(serviceName) replied, but not with the MediEval API shape. Check that the URL points to the dashboard or game service."
    }

    return error.localizedDescription
}

func mediEvalShouldQueueSubmissionFailure(_ error: Error) -> Bool {
    if let apiError = error as? EvalAPIError {
        switch apiError {
        case .invalidBaseURL, .rejected:
            return false
        case .badStatus(let status, _):
            return status == 408 || status == 429 || status >= 500
        }
    }

    if let urlError = error as? URLError {
        switch urlError.code {
        case .badURL, .unsupportedURL, .appTransportSecurityRequiresSecureConnection:
            return false
        default:
            return true
        }
    }

    return false
}

private func mediEvalLooksLocalHost(_ host: String) -> Bool {
    let normalized = host
        .trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
        .lowercased()
    if normalized == "localhost" || normalized == "::1" || normalized == "127.0.0.1" {
        return true
    }
    if normalized.hasPrefix("192.168.") || normalized.hasPrefix("10.") {
        return true
    }
    let parts = normalized.split(separator: ".").compactMap { Int($0) }
    if parts.count == 4 && parts[0] == 172 && (16...31).contains(parts[1]) {
        return true
    }
    return false
}

private func mediEvalHostCandidate(from authority: String) -> String {
    if authority.hasPrefix("["),
       let endIndex = authority.firstIndex(of: "]") {
        return String(authority[authority.index(after: authority.startIndex)..<endIndex])
    }
    return authority
        .split(separator: ":", maxSplits: 1)
        .first
        .map(String.init) ?? authority
}

func mediEvalNormalizedBaseURL(from rawValue: String) -> URL? {
    let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }

    var candidate = trimmed
    if !candidate.contains("://") {
        let authority = candidate.split(separator: "/", maxSplits: 1).first.map(String.init) ?? candidate
        let host = mediEvalHostCandidate(from: authority)
        let scheme = mediEvalLooksLocalHost(host) ? "http" : "https"
        candidate = "\(scheme)://\(candidate)"
    }

    guard var components = URLComponents(string: candidate),
          let scheme = components.scheme?.lowercased(),
          ["http", "https"].contains(scheme),
          let host = components.host,
          !host.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        return nil
    }
    components.scheme = scheme
    components.path = ""
    components.query = nil
    components.fragment = nil
    return components.url
}

func mediEvalNormalizedBaseURLString(from rawValue: String) -> String? {
    guard let url = mediEvalNormalizedBaseURL(from: rawValue) else { return nil }
    let text = url.absoluteString
    return text.hasSuffix("/") ? String(text.dropLast()) : text
}

struct EvalAPIClient {
    let baseURL: URL
    let token: String
    let runId: String?
    var projectId: String? = nil
    var accountUserId: String? = nil

    func fetchCards(reviewer: String, limit: Int = 20, page: Int = 1, reviewState: String = "unreviewed") async throws -> EvalDeckResponse {
        let url = makeURL(path: "/api/mobile/eval/cards", queryItems: [
            URLQueryItem(name: "reviewer", value: reviewer),
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "page", value: String(max(1, page))),
            URLQueryItem(name: "reviewState", value: reviewState)
        ])
        let request = authorizedRequest(url: url)
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
        return try decodeMediEvalResponse(EvalDeckResponse.self, from: data)
    }

    func fetchSummary(reviewer: String) async throws -> EvalSummary {
        let url = makeURL(path: "/api/mobile/eval/summary", queryItems: [
            URLQueryItem(name: "reviewer", value: reviewer)
        ])
        let request = authorizedRequest(url: url)
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
        return try decodeMediEvalResponse(EvalSummaryResponse.self, from: data).summary
    }

    func submitResult(_ payload: EvalResultPayload) async throws {
        if let accountUserId {
            guard payload.userId == accountUserId,
                  payload.projectId == projectId,
                  payload.runId == runId,
                  payload.serverURL == baseURL.absoluteString else {
                throw EvalAPIError.rejected("This queued review belongs to another account, server, or batch.")
            }
        }
        let url = makeURL(path: "/api/mobile/eval/results", queryItems: [], runIdOverride: payload.runId)
        var request = authorizedRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONEncoder().encode(payload)
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
        _ = try decodeMediEvalResponse(MediEvalBasicOKResponse.self, from: data)
    }

    private func makeURL(path: String, queryItems: [URLQueryItem], runIdOverride: String? = nil) -> URL {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        components.path = path
        let effectiveRunId = runIdOverride ?? runId
        let trimmedRunId = effectiveRunId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        var finalQueryItems = trimmedRunId.isEmpty
            ? queryItems
            : queryItems + [URLQueryItem(name: "runId", value: trimmedRunId)]
        if let projectId, !projectId.isEmpty {
            finalQueryItems.append(URLQueryItem(name: "projectId", value: projectId))
        }
        components.queryItems = finalQueryItems.isEmpty ? nil : finalQueryItems
        return components.url!
    }

    private func authorizedRequest(url: URL) -> URLRequest {
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        request.setValue("application/json", forHTTPHeaderField: "accept")
        return request
    }

    private func validate(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard (200..<300).contains(http.statusCode) else {
            throw EvalAPIError.badStatus(http.statusCode, mediEvalServerMessage(from: data))
        }
    }
}

protocol MediEvalResultSubmitting {
    func submitResult(_ payload: EvalResultPayload) async throws
}

extension EvalAPIClient: MediEvalResultSubmitting {}

struct GameVerdictPayload: Codable {
    let eventId: String
    let reviewer: String
    let cardId: String
    let answer: EvalAnswer
    let correction: EvalCorrection?
    let priority: String
    let confidence: Double?
    let sourceKey: String
    let claimTemplate: String
    let durationMs: Int?
    let clientGeneratedAt: String
}

struct GameProfileResponse: Decodable {
    let ok: Bool
    let profile: GameProfile
}

struct GameLeaderboardResponse: Decodable {
    let ok: Bool
    let leaderboard: [GameLeaderboardEntry]
}

struct GameProfile: Codable {
    let reviewer: String
    let reviewerKey: String
    let rank: String
    let rankProgress: Double
    let xp: Int
    let gold: Int
    let streakDays: Int
    let totalVerdicts: Int
    let correctionCount: Int
    let answerCounts: GameAnswerCounts
    let today: GameTodayProgress
    let dailyQuests: [GameDailyQuest]
    let updatedAt: String?
}

struct GameLeaderboardEntry: Codable, Identifiable {
    let place: Int
    let reviewer: String
    let reviewerKey: String
    let rank: String
    let rankProgress: Double
    let xp: Int
    let gold: Int
    let streakDays: Int
    let totalVerdicts: Int
    let correctionCount: Int
    let answerCounts: GameAnswerCounts
    let today: GameTodayProgress
    let dailyQuests: [GameDailyQuest]
    let updatedAt: String?

    var id: String { "\(place)-\(reviewerKey)" }
}

struct GameAnswerCounts: Codable {
    let yes: Int
    let no: Int
    let unsure: Int
    let badQuestion: Int
    let skip: Int
}

struct GameTodayProgress: Codable {
    let verdicts: Int
    let corrections: Int
    let lowConfidence: Int
}

struct GameDailyQuest: Codable, Identifiable {
    let key: String
    let title: String
    let detail: String
    let progress: Int
    let target: Int
    let complete: Bool

    var id: String { key }
}

protocol MediEvalGameVerdictSubmitting {
    func submitVerdict(_ payload: GameVerdictPayload) async throws
}

struct MediEvalGameAPIClient {
    let baseURL: URL
    let token: String

    func fetchProfile(reviewer: String) async throws -> GameProfile {
        let url = makeURL(path: "/api/game/profile", queryItems: [
            URLQueryItem(name: "reviewer", value: reviewer)
        ])
        let request = authorizedRequest(url: url)
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
        return try decodeMediEvalResponse(GameProfileResponse.self, from: data).profile
    }

    func fetchLeaderboard(limit: Int = 10) async throws -> [GameLeaderboardEntry] {
        let url = makeURL(path: "/api/game/leaderboard", queryItems: [
            URLQueryItem(name: "limit", value: String(limit))
        ])
        let request = authorizedRequest(url: url)
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
        return try decodeMediEvalResponse(GameLeaderboardResponse.self, from: data).leaderboard
    }

    func submitVerdict(_ payload: GameVerdictPayload) async throws {
        let url = makeURL(path: "/api/game/verdicts", queryItems: [])
        var request = authorizedRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONEncoder().encode(payload)
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
        _ = try decodeMediEvalResponse(MediEvalBasicOKResponse.self, from: data)
    }

    private func makeURL(path: String, queryItems: [URLQueryItem]) -> URL {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        components.path = path
        components.queryItems = queryItems.isEmpty ? nil : queryItems
        return components.url!
    }

    private func authorizedRequest(url: URL) -> URLRequest {
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        request.setValue("application/json", forHTTPHeaderField: "accept")
        return request
    }

    private func validate(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard (200..<300).contains(http.statusCode) else {
            throw EvalAPIError.badStatus(http.statusCode, mediEvalServerMessage(from: data))
        }
    }
}

extension MediEvalGameAPIClient: MediEvalGameVerdictSubmitting {}

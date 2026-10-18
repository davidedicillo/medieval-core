import Foundation

@main
struct PlatformClientSmoke {
    static func main() async throws {
        let environment = ProcessInfo.processInfo.environment
        guard let address = environment["MEDIEVAL_CLIENT_TEST_URL"], let url = URL(string: address),
              let token = environment["MEDIEVAL_CLIENT_TEST_TOKEN"],
              let userId = environment["MEDIEVAL_CLIENT_TEST_USER"],
              let projectId = environment["MEDIEVAL_CLIENT_TEST_PROJECT"],
              let batchId = environment["MEDIEVAL_CLIENT_TEST_BATCH"] else {
            fatalError("Missing native client test configuration")
        }
        let client = EvalAPIClient(baseURL: url, token: token, runId: batchId, projectId: projectId, accountUserId: userId)
        let deck = try await client.fetchCards(reviewer: "ignored-client-name")
        guard let card = deck.cards.first else { fatalError("Expected an available card") }
        let payload = EvalResultPayload(eventId: "native-client-smoke", runId: batchId,
            projectId: projectId, userId: userId, serverURL: url.absoluteString,
            cardId: card.cardId, reviewer: "ignored-client-name", answer: .yes,
            correction: nil, notes: "Native Swift client", durationMs: 2000,
            clientGeneratedAt: ISO8601DateFormatter().string(from: Date()))
        try await client.submitResult(payload)
        let nextDeck = try await client.fetchCards(reviewer: "ignored-client-name")
        guard nextDeck.total == deck.total - 1 else { fatalError("Native submission did not advance the deck") }
        let wrongClient = EvalAPIClient(baseURL: url, token: token, runId: batchId, projectId: projectId, accountUserId: "different-user")
        do {
            try await wrongClient.submitResult(payload)
            fatalError("A queued review must not be sent by another account")
        } catch EvalAPIError.rejected { }
        print("Native account API smoke passed")
    }
}

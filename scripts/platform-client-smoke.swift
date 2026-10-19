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
        let quality = try await client.fetchQuality(reviewer: "ignored-client-name")
        guard quality.settings.calibration == "optional" else { fatalError("Calibration must be optional by default") }
        let consistencyCards = try await client.fetchQualityCards(reviewer: "ignored-client-name", kind: "consistency")
        guard let consistency = consistencyCards.first, consistency.quality?.kind == "consistency" else { fatalError("Expected a consistency quest") }
        let checkPayload = EvalResultPayload(eventId: "native-consistency", runId: batchId,
            projectId: projectId, userId: userId, serverURL: url.absoluteString,
            cardId: consistency.cardId, reviewer: "ignored-client-name", answer: .yes,
            correction: nil, notes: "", durationMs: 1000,
            clientGeneratedAt: ISO8601DateFormatter().string(from: Date()))
        let feedback = try await client.submitQualityResult(checkPayload)
        guard feedback.consistent == true, feedback.verifiedQualityBonus == 0 else { fatalError("Consistency feedback is not a correctness reward") }
        let latestQuality = try await client.fetchQuality(reviewer: "ignored-client-name")
        guard latestQuality.consistency.count == 1 else { fatalError("Quality stats did not update") }
        let wrongClient = EvalAPIClient(baseURL: url, token: token, runId: batchId, projectId: projectId, accountUserId: "different-user")
        do {
            try await wrongClient.submitResult(payload)
            fatalError("A queued review must not be sent by another account")
        } catch EvalAPIError.rejected { }
        do {
            _ = try await wrongClient.submitQualityResult(checkPayload)
            fatalError("A quality quest must not be sent by another account")
        } catch EvalAPIError.rejected { }
        print("Native account API smoke passed")
    }
}

import Foundation

func expect(_ condition: @autoclosure () -> Bool, _ message: String, line: UInt = #line) {
    guard condition() else {
        fatalError("line \(line): \(message)")
    }
}

func evalPayload(
    eventId: String?,
    cardId: String,
    answer: EvalAnswer = .no,
    correction: EvalCorrection? = nil
) -> EvalResultPayload {
    EvalResultPayload(
        eventId: eventId,
        cardId: cardId,
        reviewer: "Bundle Smoke",
        answer: answer,
        correction: correction,
        notes: "",
        durationMs: 1000,
        clientGeneratedAt: "2026-06-23T20:00:00Z"
    )
}

func gamePayload(eventId: String, cardId: String) -> GameVerdictPayload {
    GameVerdictPayload(
        eventId: eventId,
        reviewer: "Bundle Smoke",
        cardId: cardId,
        answer: .no,
        correction: EvalCorrection(correctAnswer: "Truth", reasonTags: ["wrong_item"]),
        priority: "high",
        confidence: 0.2,
        sourceKey: "dailySale:demo",
        claimTemplate: "component_title_or_label",
        durationMs: 1000,
        clientGeneratedAt: "2026-06-23T20:00:00Z"
    )
}

struct FakeEvalResultSubmitter: MediEvalResultSubmitting {
    let failuresByEventId: [String: Error]

    func submitResult(_ payload: EvalResultPayload) async throws {
        let eventId = payload.eventId ?? ""
        if let error = failuresByEventId[eventId] {
            throw error
        }
    }
}

struct FakeGameVerdictSubmitter: MediEvalGameVerdictSubmitting {
    let failuresByEventId: [String: Error]

    func submitVerdict(_ payload: GameVerdictPayload) async throws {
        if let error = failuresByEventId[payload.eventId] {
            throw error
        }
    }
}

struct EnqueueDuringFlushSubmitter: MediEvalResultSubmitting {
    let onSubmit: @MainActor () -> Void
    func submitResult(_ payload: EvalResultPayload) async throws { await onSubmit() }
}

@main
struct OutboxStorageSmoke {
    @MainActor
    static func main() async {
        let tempDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("medieval-outbox-smoke-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: tempDirectory) }

        let evalURL = tempDirectory.appendingPathComponent("eval-result-outbox.json")
        let gameURL = tempDirectory.appendingPathComponent("medieval-game-outbox.json")
        let reviewedURL = tempDirectory.appendingPathComponent("reviewed-card-guard.json")

        let evalOutbox = OutboxStore(fileURL: evalURL)
        let first = evalPayload(
            eventId: "eval-event-1",
            cardId: "card-1",
            correction: EvalCorrection(correctAnswer: "Original truth", reasonTags: ["wrong_item"])
        )
        let replacement = evalPayload(
            eventId: "eval-event-1",
            cardId: "card-1",
            correction: EvalCorrection(correctAnswer: "Updated truth", reasonTags: ["wrong_item"])
        )
        evalOutbox.enqueue(first, gamePayload: gamePayload(eventId: "game:eval-event-1", cardId: "card-1"))
        evalOutbox.enqueue(replacement, gamePayload: nil)

        expect(evalOutbox.items.count == 1, "duplicate eval event should replace instead of append")
        expect(evalOutbox.pendingCardIds == ["card-1"], "pending card ids should include queued eval")
        expect(evalOutbox.items[0].payload.correction?.correctAnswer == "Updated truth", "replacement payload should be durable")
        expect(evalOutbox.items[0].gamePayload?.eventId == "game:eval-event-1", "existing game payload should be preserved")

        let reloadedEvalOutbox = OutboxStore(fileURL: evalURL)
        expect(reloadedEvalOutbox.items.count == 1, "eval outbox should reload from disk")
        expect(reloadedEvalOutbox.items[0].payload.eventId == "eval-event-1", "reloaded eval event id should match")

        let evalFlushURL = tempDirectory.appendingPathComponent("flush-eval-outbox.json")
        let evalFlushOutbox = OutboxStore(fileURL: evalFlushURL)
        evalFlushOutbox.enqueue(
            evalPayload(eventId: "sent-eval-event", cardId: "card-accepted"),
            gamePayload: gamePayload(eventId: "game:sent-eval-event", cardId: "card-accepted")
        )
        evalFlushOutbox.enqueue(
            evalPayload(eventId: "transient-eval-event", cardId: "card-transient"),
            gamePayload: gamePayload(eventId: "game:transient-eval-event", cardId: "card-transient")
        )
        evalFlushOutbox.enqueue(
            evalPayload(eventId: "hard-eval-event", cardId: "card-hard"),
            gamePayload: gamePayload(eventId: "game:hard-eval-event", cardId: "card-hard")
        )
        let evalFlush = await evalFlushOutbox.flush(using: FakeEvalResultSubmitter(failuresByEventId: [
            "transient-eval-event": URLError(.timedOut),
            "hard-eval-event": EvalAPIError.badStatus(401, "bad token")
        ]))
        expect(evalFlush.sentCount == 1, "eval flush should count accepted evals")
        expect(evalFlush.acceptedGamePayloads.map(\.eventId) == ["game:sent-eval-event"], "eval flush should release game rewards only for accepted evals")
        expect(evalFlush.retainedCount == 2, "eval flush should retain failed evals")
        expect(evalFlush.hardFailure != nil, "eval flush should report hard dashboard failures")
        expect(
            evalFlushOutbox.items.map { $0.payload.eventId ?? "" } == ["transient-eval-event", "hard-eval-event"],
            "eval flush should preserve failed evals in order"
        )

        let fallbackOutbox = OutboxStore(fileURL: tempDirectory.appendingPathComponent("fallback-eval-outbox.json"))
        fallbackOutbox.enqueue(evalPayload(eventId: nil, cardId: "card-2", answer: .yes))
        fallbackOutbox.enqueue(evalPayload(eventId: nil, cardId: "card-2", answer: .unsure))
        expect(fallbackOutbox.items.count == 1, "eventless payloads should dedupe by card id")
        expect(fallbackOutbox.items[0].payload.answer == .unsure, "eventless duplicate should keep latest payload")

        let scopedURL = tempDirectory.appendingPathComponent("scoped-eval-outbox.json")
        let scopedOutbox = OutboxStore(fileURL: scopedURL)
        scopedOutbox.enqueue(first, scope: "server-a|alice|project-a|batch-a")
        scopedOutbox.enqueue(first, scope: "server-a|bob|project-a|batch-a")
        scopedOutbox.enqueue(first, scope: "server-b|alice|project-a|batch-a")
        scopedOutbox.enqueue(first, scope: "server-a|alice|project-a|batch-b")
        scopedOutbox.enqueue(first)
        expect(scopedOutbox.items.count == 5, "matching event IDs in different accounts, servers, and batches must stay separate")
        let scopedReloaded = OutboxStore(fileURL: scopedURL)
        expect(scopedReloaded.pendingCardIds(scope: "server-a|alice|project-a|batch-a") == ["card-1"], "pending cards must be scoped")
        let scopedFlush = await scopedReloaded.flush(using: FakeEvalResultSubmitter(failuresByEventId: [:]), scope: "server-a|alice|project-a|batch-a")
        expect(scopedFlush.sentCount == 1, "flush must only submit the current account and batch")
        expect(scopedReloaded.items.count == 4, "other accounts, batches, servers, and legacy submissions must remain queued")

        let changingQueue = OutboxStore(fileURL: tempDirectory.appendingPathComponent("changing-queue.json"))
        changingQueue.enqueue(first, scope: "account")
        let changingResult = await changingQueue.flush(using: EnqueueDuringFlushSubmitter(onSubmit: {
            changingQueue.enqueue(evalPayload(eventId: "new-during-flush", cardId: "new-card"), scope: "account")
        }), scope: "account")
        expect(changingResult.sentCount == 1, "the original snapshot should be sent")
        expect(changingQueue.items.first?.payload.eventId == "new-during-flush", "reviews enqueued during a flush must not be lost")

        let gameOutbox = GameOutboxStore(fileURL: gameURL)
        gameOutbox.enqueue(gamePayload(eventId: "game-event-1", cardId: "card-3"))
        gameOutbox.enqueue(gamePayload(eventId: "game-event-1", cardId: "card-3"))
        gameOutbox.enqueue(gamePayload(eventId: "game-event-2", cardId: "card-4"))
        expect(gameOutbox.items.count == 2, "game outbox should dedupe by event id")

        let reloadedGameOutbox = GameOutboxStore(fileURL: gameURL)
        expect(reloadedGameOutbox.items.map(\.payload.eventId) == ["game-event-1", "game-event-2"], "game outbox should reload unique events in order")

        let successFlushURL = tempDirectory.appendingPathComponent("success-game-outbox.json")
        let successFlushOutbox = GameOutboxStore(fileURL: successFlushURL)
        successFlushOutbox.enqueue(gamePayload(eventId: "success-game-event", cardId: "card-5"))
        let successFlush = await successFlushOutbox.flush(using: FakeGameVerdictSubmitter(failuresByEventId: [:]))
        expect(successFlush.sentCount == 1, "successful game flush should count sent events")
        expect(successFlush.retainedCount == 0, "successful game flush should retain no events")
        expect(successFlush.hardFailure == nil, "successful game flush should not report a hard failure")
        expect(successFlushOutbox.items.isEmpty, "successful game flush should clear queue")

        let failureFlushURL = tempDirectory.appendingPathComponent("failure-game-outbox.json")
        let failureFlushOutbox = GameOutboxStore(fileURL: failureFlushURL)
        failureFlushOutbox.enqueue(gamePayload(eventId: "sent-game-event", cardId: "card-6"))
        failureFlushOutbox.enqueue(gamePayload(eventId: "transient-game-event", cardId: "card-7"))
        failureFlushOutbox.enqueue(gamePayload(eventId: "hard-game-event", cardId: "card-8"))
        let failureFlush = await failureFlushOutbox.flush(using: FakeGameVerdictSubmitter(failuresByEventId: [
            "transient-game-event": URLError(.timedOut),
            "hard-game-event": EvalAPIError.badStatus(401, "bad token")
        ]))
        expect(failureFlush.sentCount == 1, "mixed game flush should count sent events")
        expect(failureFlush.retainedCount == 2, "mixed game flush should retain failed events")
        expect(failureFlush.hardFailure != nil, "mixed game flush should report hard guild failures")
        expect(
            failureFlushOutbox.items.map(\.payload.eventId) == ["transient-game-event", "hard-game-event"],
            "mixed game flush should preserve failed events in order"
        )

        let reviewedStore = ReviewedCardStore(fileURL: reviewedURL, maxRecords: 3)
        reviewedStore.mark(cardId: "reviewed-card-1", reviewer: "Davide", serviceKey: "https://dashboard.example")
        reviewedStore.mark(cardId: "reviewed-card-2", reviewer: "Davide", serviceKey: "https://dashboard.example")
        reviewedStore.mark(cardId: "reviewed-card-1", reviewer: "Davide", serviceKey: "https://dashboard.example")
        expect(reviewedStore.records.count == 2, "reviewed card guard should dedupe by service, reviewer, and card")
        expect(
            reviewedStore.contains(cardId: "reviewed-card-1", reviewer: " DAVIDE ", serviceKey: "https://dashboard.example"),
            "reviewed card guard should normalize reviewer scope"
        )
        expect(
            !reviewedStore.contains(cardId: "reviewed-card-1", reviewer: "Another Reviewer", serviceKey: "https://dashboard.example"),
            "reviewed card guard should keep reviewers separate"
        )
        expect(
            !reviewedStore.contains(cardId: "reviewed-card-1", reviewer: "Davide", serviceKey: "https://other-dashboard.example"),
            "reviewed card guard should keep dashboard scopes separate"
        )

        let reloadedReviewedStore = ReviewedCardStore(fileURL: reviewedURL, maxRecords: 3)
        expect(
            reloadedReviewedStore.reviewedCardIds(reviewer: "Davide", serviceKey: "https://dashboard.example") == ["reviewed-card-1", "reviewed-card-2"],
            "reviewed card guard should reload persisted records"
        )

        print("Outbox storage smoke passed")
    }
}

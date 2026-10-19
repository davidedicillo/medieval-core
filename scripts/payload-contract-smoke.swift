import Foundation

func expect(_ condition: @autoclosure () -> Bool, _ message: String, line: UInt = #line) {
    guard condition() else {
        fatalError("line \(line): \(message)")
    }
}

func jsonObject<T: Encodable>(_ value: T, line: UInt = #line) -> [String: Any] {
    do {
        let data = try JSONEncoder().encode(value)
        let object = try JSONSerialization.jsonObject(with: data)
        guard let dictionary = object as? [String: Any] else {
            fatalError("line \(line): encoded value was not a JSON object")
        }
        return dictionary
    } catch {
        fatalError("line \(line): failed to encode JSON: \(error)")
    }
}

func expectString(_ object: [String: Any], _ key: String, _ expected: String, line: UInt = #line) {
    expect(object[key] as? String == expected, "\(key) should equal \(expected)", line: line)
}

func expectNumber(_ object: [String: Any], _ key: String, _ expected: Double, line: UInt = #line) {
    guard let actual = object[key] as? NSNumber else {
        fatalError("line \(line): \(key) should be numeric")
    }
    expect(abs(actual.doubleValue - expected) < 0.000_001, "\(key) should equal \(expected)", line: line)
}

func expectCorrection(_ value: Any?, correctAnswer: String, reasonTags: [String], line: UInt = #line) {
    guard let correction = value as? [String: Any] else {
        fatalError("line \(line): correction should be a JSON object")
    }
    expect(correction["correctAnswer"] as? String == correctAnswer, "correction.correctAnswer should match", line: line)
    expect(correction["reasonTags"] as? [String] == reasonTags, "correction.reasonTags should match", line: line)
}

@main
struct PayloadContractSmoke {
    static func main() {
        let textEvidence = Data("{\"source\":\"record\",\"detail\":\"Text-only evidence\"}".utf8)
        let evidence = try! JSONDecoder().decode(EvidenceSnippet.self, from: textEvidence)
        expect(evidence.imagePositions.isEmpty, "text-only evidence must not require image positions")
        expect(evidence.confidence == nil, "evidence confidence is optional")
        let correction = EvalCorrection(
            correctAnswer: "Charging cable",
            reasonTags: ["wrong_item", "unsupported_by_image"]
        )

        let evalPayload = EvalResultPayload(
            eventId: "eval-event-1",
            runId: "demo-run-1",
            cardId: "bec_card_1",
            reviewer: "Davide",
            answer: .badQuestion,
            correction: correction,
            notes: "Needs a clearer prompt",
            durationMs: 1234,
            clientGeneratedAt: "2026-06-23T20:00:00.000Z"
        )
        let evalJSON = jsonObject(evalPayload)
        expectString(evalJSON, "eventId", "eval-event-1")
        expectString(evalJSON, "runId", "demo-run-1")
        expectString(evalJSON, "cardId", "bec_card_1")
        expectString(evalJSON, "reviewer", "Davide")
        expectString(evalJSON, "answer", "bad_question")
        expectString(evalJSON, "notes", "Needs a clearer prompt")
        expectString(evalJSON, "clientGeneratedAt", "2026-06-23T20:00:00.000Z")
        expectNumber(evalJSON, "durationMs", 1234)
        expectCorrection(evalJSON["correction"], correctAnswer: "Charging cable", reasonTags: ["wrong_item", "unsupported_by_image"])

        let gamePayload = GameVerdictPayload(
            eventId: "game:eval-event-1",
            reviewer: "Davide",
            cardId: "bec_card_1",
            answer: .no,
            correction: correction,
            priority: "high",
            confidence: 0.2,
            sourceKey: "dailySale:ebay:123",
            claimTemplate: "component_title_or_label",
            durationMs: 1234,
            clientGeneratedAt: "2026-06-23T20:00:00.000Z"
        )
        let gameJSON = jsonObject(gamePayload)
        expectString(gameJSON, "eventId", "game:eval-event-1")
        expectString(gameJSON, "answer", "no")
        expectString(gameJSON, "priority", "high")
        expectString(gameJSON, "sourceKey", "dailySale:ebay:123")
        expectString(gameJSON, "claimTemplate", "component_title_or_label")
        expectNumber(gameJSON, "confidence", 0.2)
        expectCorrection(gameJSON["correction"], correctAnswer: "Charging cable", reasonTags: ["wrong_item", "unsupported_by_image"])

        let profileJSON = """
        {
          "ok": true,
          "profile": {
            "reviewer": "Davide",
            "reviewerKey": "davide",
            "rank": "Squire",
            "rankProgress": 0.42,
            "xp": 420,
            "gold": 99,
            "streakDays": 3,
            "totalVerdicts": 25,
            "correctionCount": 4,
            "answerCounts": {
              "yes": 10,
              "no": 8,
              "unsure": 3,
              "badQuestion": 2,
              "skip": 2
            },
            "today": {
              "verdicts": 5,
              "corrections": 1,
              "lowConfidence": 3
            },
            "dailyQuests": [
              {
                "key": "torch_lit",
                "title": "Keep the torch lit",
                "detail": "Judge 10 claims today",
                "progress": 5,
                "target": 10,
                "complete": false
              }
            ],
            "updatedAt": "2026-06-23T20:00:00.000Z"
          }
        }
        """.data(using: .utf8)!
        let profile = try! JSONDecoder().decode(GameProfileResponse.self, from: profileJSON).profile
        expect(profile.answerCounts.badQuestion == 2, "badQuestion count should decode from game service profile")
        expect(profile.today.lowConfidence == 3, "low-confidence quest progress should decode")
        expect(profile.dailyQuests.first?.key == "torch_lit", "daily quest should decode")

        let leaderboardJSON = """
        {
          "ok": true,
          "leaderboard": [
            {
              "place": 1,
              "reviewer": "Davide",
              "reviewerKey": "davide",
              "rank": "Squire",
              "rankProgress": 0.42,
              "xp": 420,
              "gold": 99,
              "streakDays": 3,
              "totalVerdicts": 25,
              "correctionCount": 4,
              "answerCounts": {
                "yes": 10,
                "no": 8,
                "unsure": 3,
                "badQuestion": 2,
                "skip": 2
              },
              "today": {
                "verdicts": 5,
                "corrections": 1,
                "lowConfidence": 3
              },
              "dailyQuests": [],
              "updatedAt": null
            }
          ]
        }
        """.data(using: .utf8)!
        let leaderboard = try! JSONDecoder().decode(GameLeaderboardResponse.self, from: leaderboardJSON).leaderboard
        expect(leaderboard.first?.id == "1-davide", "leaderboard entry id should be stable")

        expect(mediEvalShouldQueueSubmissionFailure(URLError(.timedOut)), "timed-out submissions should queue")
        expect(mediEvalShouldQueueSubmissionFailure(EvalAPIError.badStatus(503, "maintenance")), "server failures should queue")
        expect(mediEvalShouldQueueSubmissionFailure(EvalAPIError.badStatus(429, "slow down")), "rate limits should queue")
        expect(!mediEvalShouldQueueSubmissionFailure(EvalAPIError.badStatus(401, "bad token")), "bad tokens should not queue silently")
        expect(!mediEvalShouldQueueSubmissionFailure(EvalAPIError.badStatus(400, "unknown card")), "permanent dashboard rejections should not queue silently")
        expect(!mediEvalShouldQueueSubmissionFailure(URLError(.badURL)), "bad URLs should not queue silently")
        expect(EvalAPIError.badStatus(403, "Complete qualification in Training Grounds before reviewing this batch.").localizedDescription.contains("Training Grounds"), "qualification guidance must not be replaced with a token error")

        let qualityCardJSON = Data("""
        {"schemaVersion":"eval-card.v1","cardId":"quality:owned-quest","cardType":"binary_claim","question":"Is this supported?","claim":{"template":"support","path":"answer","value":"blue"},"sourceKey":"example","quality":{"assignmentId":"owned-quest","kind":"qualification","rubricVersion":"2","rubric":"Use source evidence."}}
        """.utf8)
        let qualityCard = try! JSONDecoder().decode(EvalCard.self, from: qualityCardJSON)
        expect(qualityCard.quality?.kind == "qualification", "quality quests must decode without reference answers")
        let roundTrip = try! JSONDecoder().decode(EvalCard.self, from: JSONEncoder().encode(qualityCard))
        expect(roundTrip.quality?.rubricVersion == "2", "quality metadata must survive persistence")

        print("Payload contract smoke passed")
    }
}

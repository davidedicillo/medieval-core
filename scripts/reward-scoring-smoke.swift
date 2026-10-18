import Foundation

func assertReward(
    _ actual: MediEvalReward,
    xp: Int,
    gold: Int,
    correctionPresent: Bool,
    line: UInt = #line
) {
    let expected = MediEvalReward(xp: xp, gold: gold, correctionPresent: correctionPresent)
    guard actual == expected else {
        fatalError("line \(line): reward \(actual) did not match \(expected)")
    }
}

func expect(_ condition: @autoclosure () -> Bool, _ message: String, line: UInt = #line) {
    guard condition() else {
        fatalError("line \(line): \(message)")
    }
}

struct RewardFixture {
    let answer: EvalAnswer
    let correction: EvalCorrection?
    let priority: String?
    let confidence: Double?
    let xp: Int
    let gold: Int
    let correctionPresent: Bool
}

@main
struct RewardScoringSmoke {
    static func main() {
        let fixtures = [
            RewardFixture(answer: .yes, correction: nil, priority: "high", confidence: 0.2, xp: 19, gold: 3, correctionPresent: false),
            RewardFixture(answer: .yes, correction: nil, priority: "medium", confidence: 0.5, xp: 14, gold: 3, correctionPresent: false),
            RewardFixture(answer: .yes, correction: nil, priority: "low", confidence: 0.65, xp: 10, gold: 3, correctionPresent: false),
            RewardFixture(answer: .no, correction: EvalCorrection(correctAnswer: "Charging cable", reasonTags: ["wrong_item"]), priority: "high", confidence: 0.2, xp: 27, gold: 5, correctionPresent: true),
            RewardFixture(answer: .no, correction: EvalCorrection(correctAnswer: "  ", reasonTags: ["wrong_item"]), priority: "medium", confidence: nil, xp: 20, gold: 5, correctionPresent: true),
            RewardFixture(answer: .no, correction: EvalCorrection(correctAnswer: "  ", reasonTags: ["  "]), priority: "low", confidence: 0.9, xp: 10, gold: 3, correctionPresent: false),
            RewardFixture(answer: .unsure, correction: nil, priority: nil, confidence: 0.34, xp: 11, gold: 1, correctionPresent: false),
            RewardFixture(answer: .badQuestion, correction: nil, priority: "medium", confidence: 0.5, xp: 12, gold: 1, correctionPresent: false),
            RewardFixture(answer: .skip, correction: nil, priority: nil, confidence: nil, xp: 2, gold: 0, correctionPresent: false),
            RewardFixture(answer: .skip, correction: nil, priority: "high", confidence: 0.2, xp: 11, gold: 0, correctionPresent: false)
        ]

        for fixture in fixtures {
            assertReward(
                MediEvalRewardScoring.score(
                    answer: fixture.answer,
                    correction: fixture.correction,
                    priority: fixture.priority,
                    confidence: fixture.confidence
                ),
                xp: fixture.xp,
                gold: fixture.gold,
                correctionPresent: fixture.correctionPresent
            )
        }

        expect(!mediEvalCorrectionIsActionable(correctAnswer: "", reasonTags: []), "blank correction should not be actionable")
        expect(!mediEvalCorrectionIsActionable(correctAnswer: "   ", reasonTags: ["   "]), "whitespace-only correction should not be actionable")
        expect(mediEvalCorrectionIsActionable(correctAnswer: "Charging cable", reasonTags: []), "correct answer should make correction actionable")
        expect(mediEvalCorrectionIsActionable(correctAnswer: "", reasonTags: ["wrong_item"]), "reason tag should make correction actionable")

        print("Reward scoring smoke passed")
    }
}

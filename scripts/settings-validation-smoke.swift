import Foundation

func expect(_ condition: @autoclosure () -> Bool, _ message: String, line: UInt = #line) {
    guard condition() else {
        fatalError("line \(line): \(message)")
    }
}

func smokeCard(template: String, question: String = "Is the original claim correct?") -> EvalCard {
    EvalCard(
        schemaVersion: "1",
        cardId: "smoke-\(template)",
        cardType: "binary_claim",
        question: question,
        claim: EvalClaim(
            template: template,
            path: "analysis.smoke",
            value: "Smoke claim"
        ),
        sourceKey: "smoke-source",
        priority: "high",
        confidence: 0.42,
        listing: ListingInfo(
            title: "Smoke listing",
            url: "https://example.com/listing",
            price: "$1.00",
            marketplace: "smoke"
        ),
        images: [],
        analysisContext: AnalysisContext(
            summary: "",
            model: "smoke-model",
            provider: "smoke",
            analysisStage: "smoke",
            warnings: []
        ),
        evidence: []
    )
}

@main
struct SettingsValidationSmoke {
    @MainActor
    static func main() {
        let defaults = UserDefaults.standard
        let keys = ["baseURL", "reviewerName", "token", "gameURL", "gameToken", "usesLegacyConnection"]
        let previousValues = Dictionary(uniqueKeysWithValues: keys.map { ($0, defaults.object(forKey: $0)) })
        defer {
            for key in keys {
                if let value = previousValues[key] ?? nil {
                    defaults.set(value, forKey: key)
                } else {
                    defaults.removeObject(forKey: key)
                }
            }
        }

        for key in keys {
            defaults.removeObject(forKey: key)
        }

        expect(
            AppSettings.shouldAutoUseLocalDemoBackend(
                environment: ["MEDIEVAL_USE_LOCAL_DEMO": "true"],
                arguments: []
            ),
            "Local Demo launch environment should opt into demo settings"
        )
        expect(
            AppSettings.shouldAutoUseLocalDemoBackend(
                environment: [:],
                arguments: ["MediEval", "--medieval-use-local-demo"]
            ),
            "Local Demo launch argument should opt into demo settings"
        )
        expect(
            !AppSettings.shouldAutoUseLocalDemoBackend(environment: [:], arguments: ["MediEval"]),
            "Local Demo launch opt-in should be off by default"
        )

        let settings = AppSettings()
        expect(!settings.usesLegacyConnection, "new installations should start with account sign-in")
        settings.usesLegacyConnection = true
        settings.baseURLString = "http://127.0.0.1:5199"
        settings.token = "demo-token"
        settings.reviewerName = "   "
        expect(settings.dashboardSetupProblem() == "Add your guild name so verdicts stay separate.", "blank reviewer should block dashboard setup")

        settings.reviewerName = " Davide "
        expect(settings.dashboardSetupProblem() == nil, "trimmed reviewer should allow dashboard setup")
        expect(settings.reviewer == "Davide", "reviewer should trim whitespace")

        settings.gameURLString = "http://127.0.0.1:5199"
        settings.gameToken = "demo-token"
        settings.reviewerName = ""
        expect(settings.guildSetupProblem() == "Add your guild name before syncing rewards.", "blank reviewer should block guild setup")

        let simulatorDemoReady = settings.useLocalDemoBackend(loopbackURLAllowed: true)
        expect(simulatorDemoReady, "Local Demo should be ready when loopback URLs are allowed")
        expect(settings.reviewer == "Davide", "Local Demo should fill a reviewer when blank")
        expect(settings.baseURLString == "http://127.0.0.1:5199", "Local Demo should fill simulator dashboard URL")
        expect(settings.gameURLString == "http://127.0.0.1:5199", "Local Demo should fill simulator guild URL")
        expect(settings.dashboardSetupProblem() == nil, "Local Demo should satisfy dashboard setup")
        expect(settings.guildSetupProblem() == nil, "Local Demo should satisfy guild setup")

        settings.baseURLString = "http://127.0.0.1:5199"
        settings.gameURLString = "http://localhost:5199"
        let physicalDemoNeedsURL = settings.useLocalDemoBackend(loopbackURLAllowed: false)
        expect(!physicalDemoNeedsURL, "physical-device Local Demo should not keep loopback URLs")
        expect(settings.baseURLString.isEmpty, "physical-device Local Demo should clear loopback dashboard URL")
        expect(settings.gameURLString.isEmpty, "physical-device Local Demo should clear loopback guild URL")
        expect(settings.token == "demo-token", "physical-device Local Demo should still fill dashboard token")
        expect(settings.gameToken == "demo-token", "physical-device Local Demo should still fill guild token")

        settings.baseURLString = "http://192.168.1.42:5199"
        settings.gameURLString = "http://192.168.1.42:5199"
        let physicalDemoReady = settings.useLocalDemoBackend(loopbackURLAllowed: false)
        expect(physicalDemoReady, "physical-device Local Demo should accept an existing Wi-Fi URL")
        expect(settings.baseURLString == "http://192.168.1.42:5199", "physical-device Local Demo should preserve dashboard Wi-Fi URL")
        expect(settings.gameURLString == "http://192.168.1.42:5199", "physical-device Local Demo should preserve guild Wi-Fi URL")

        let variantCard = smokeCard(template: "variant_signal")
        expect(variantCard.displayQuestion == "Does the evidence show this variant signal?", "variant prompt should ask about visible evidence")
        expect(variantCard.claimDisplayLabel == "Claimed evidence", "variant claim label should avoid implying a variant name")
        expect(variantCard.correctionFieldLabel == "Correct visible evidence", "variant correction field should ask for evidence")
        expect(variantCard.correctionFieldPlaceholder.contains("Legacy Edition"), "variant correction placeholder should provide evidence-style wording")

        let itemCard = smokeCard(template: "component_title_or_label")
        expect(itemCard.displayQuestion == "Is this included item correctly identified?", "item prompt should ask about an included item")
        expect(itemCard.correctionFieldLabel == "Correct item name", "item correction field should ask for the item name")

        let titleCard = smokeCard(template: "component_game_title")
        expect(titleCard.displayQuestion == "Is this game title correct?", "game title prompt should stay title-specific")
        expect(titleCard.correctionFieldLabel == "Correct game title", "game title correction should stay title-specific")

        let genericCard = EvalCard(
            schemaVersion: "eval-card.v1",
            cardId: "generic-subject",
            cardType: "binary_claim",
            question: "Is the extracted color correct?",
            claim: EvalClaim(template: "attribute_color", path: "attributes.color", value: "blue"),
            sourceKey: "generic:subject",
            priority: "medium",
            confidence: nil,
            subject: EvalSubject(
                title: "Catalog item 123",
                subtitle: "Attribute extraction",
                url: "https://example.com/items/123",
                source: "catalog"
            ),
            media: [
                EvalMedia(url: "https://example.com/items/123.jpg", type: "image", label: "Source image", position: 1, source: "catalog")
            ]
        )
        expect(genericCard.subjectDisplayTitle == "Catalog item 123", "generic subject title should drive display")
        expect(genericCard.subjectDisplaySubtitle == "Attribute extraction", "generic subject subtitle should drive display")
        expect(genericCard.subjectURLString == "https://example.com/items/123", "generic subject URL should drive display")
        expect(genericCard.images.count == 1, "generic image media should populate review images")

        print("Settings validation smoke passed")
    }
}

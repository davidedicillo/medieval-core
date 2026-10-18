import Foundation

func expect(_ condition: @autoclosure () -> Bool, _ message: String, line: UInt = #line) {
    guard condition() else {
        fatalError("line \(line): \(message)")
    }
}

func smokeCard(_ cardId: String, template: String = "component_game_title") -> EvalCard {
    EvalCard(
        schemaVersion: "listing-content-eval-card.v1",
        cardId: cardId,
        cardType: "binary_claim",
        question: "Is this claim correct?",
        claim: EvalClaim(
            template: template,
            path: "analysis.components[0].gameTitle",
            value: "Smoke Quest"
        ),
        sourceKey: "dailySale:smoke:\(cardId)",
        priority: "high",
        confidence: 0.42,
        listing: ListingInfo(
            title: "Smoke listing",
            url: "https://example.com/smoke",
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

func smokeDeck(page: Int, pageCount: Int, cards: [EvalCard]) -> EvalDeckResponse {
    EvalDeckResponse(
        ok: true,
        cards: cards,
        page: page,
        pageSize: 20,
        pageCount: pageCount,
        total: cards.count,
        unfilteredTotal: cards.count,
        reviewer: "Davide",
        reviewState: "unreviewed"
    )
}

@main
struct DeckPagingSmoke {
    @MainActor
    static func main() async {
        let hidden = smokeCard("hidden-card")
        let visible = smokeCard("visible-card")

        var scannedPages: [Int] = []
        let laterPageCards = try! await mediEvalFreshDeckCards(
            maxPagesToScan: 5,
            fetchPage: { page in
                scannedPages.append(page)
                if page == 1 {
                    return smokeDeck(page: page, pageCount: 3, cards: [hidden])
                }
                if page == 2 {
                    return smokeDeck(page: page, pageCount: 3, cards: [visible])
                }
                return smokeDeck(page: page, pageCount: 3, cards: [])
            },
            includeCard: { card in card.cardId != hidden.cardId }
        )
        expect(scannedPages == [1, 2], "deck loader should request page 2 when page 1 is locally hidden")
        expect(laterPageCards.map(\.cardId) == ["visible-card"], "deck loader should return fresh cards from later pages")

        scannedPages = []
        let firstPageCards = try! await mediEvalFreshDeckCards(
            maxPagesToScan: 5,
            fetchPage: { page in
                scannedPages.append(page)
                return smokeDeck(page: page, pageCount: 4, cards: [visible])
            },
            includeCard: { _ in true }
        )
        expect(scannedPages == [1], "deck loader should stop once page 1 has usable cards")
        expect(firstPageCards.map(\.cardId) == ["visible-card"], "deck loader should keep usable first-page cards")

        scannedPages = []
        let cappedCards = try! await mediEvalFreshDeckCards(
            maxPagesToScan: 2,
            fetchPage: { page in
                scannedPages.append(page)
                return smokeDeck(page: page, pageCount: 10, cards: [hidden])
            },
            includeCard: { _ in false }
        )
        expect(scannedPages == [1, 2], "deck loader should respect the local scan cap")
        expect(cappedCards.isEmpty, "deck loader should return empty only after scanned pages have no usable cards")

        print("Deck paging smoke passed")
    }
}

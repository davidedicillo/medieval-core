import Foundation
import SwiftUI

struct EvalDeckResponse: Decodable {
    let ok: Bool
    let cards: [EvalCard]
    let page: Int
    let pageSize: Int
    let pageCount: Int
    let total: Int
    let unfilteredTotal: Int
    let reviewer: String
    let reviewState: String
}

struct EvalSummaryResponse: Decodable {
    let ok: Bool
    let summary: EvalSummary
}

struct EvalSummary: Decodable {
    let runId: String
    let batchId: String?
    let reviewer: String
    let totalCards: Int
    let reviewedCards: Int
    let pendingCards: Int
    let totalResultRows: Int
    let lastReviewedAt: String?
    let byPriority: [String: PrioritySummary]

    var displayBatchId: String {
        batchId ?? runId
    }
}

struct PrioritySummary: Decodable {
    let total: Int
    let reviewed: Int
    let pending: Int
}

struct EvalCard: Identifiable, Codable {
    let schemaVersion: String
    let cardId: String
    let cardType: String
    let question: String
    let claim: EvalClaim
    let sourceKey: String
    let priority: String
    let confidence: Double?
    let subject: EvalSubject?
    let listing: ListingInfo?
    let images: [EvalImage]
    let media: [EvalMedia]
    let analysisContext: AnalysisContext
    let evidence: [EvidenceSnippet]

    var id: String { cardId }

    init(
        schemaVersion: String,
        cardId: String,
        cardType: String,
        question: String,
        claim: EvalClaim,
        sourceKey: String,
        priority: String,
        confidence: Double?,
        subject: EvalSubject? = nil,
        listing: ListingInfo? = nil,
        images: [EvalImage] = [],
        media: [EvalMedia] = [],
        analysisContext: AnalysisContext = .empty,
        evidence: [EvidenceSnippet] = []
    ) {
        self.schemaVersion = schemaVersion
        self.cardId = cardId
        self.cardType = cardType
        self.question = question
        self.claim = claim
        self.sourceKey = sourceKey
        self.priority = priority
        self.confidence = confidence
        self.subject = subject
        self.listing = listing
        self.media = media
        self.images = images.isEmpty ? media.compactMap(EvalImage.init(media:)) : images
        self.analysisContext = analysisContext
        self.evidence = evidence
    }

    enum CodingKeys: String, CodingKey {
        case schemaVersion
        case cardId
        case cardType
        case question
        case claim
        case sourceKey
        case priority
        case confidence
        case subject
        case listing
        case images
        case media
        case analysisContext
        case evidence
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try container.decode(String.self, forKey: .schemaVersion)
        cardId = try container.decode(String.self, forKey: .cardId)
        cardType = try container.decode(String.self, forKey: .cardType)
        question = try container.decode(String.self, forKey: .question)
        claim = try container.decode(EvalClaim.self, forKey: .claim)
        sourceKey = try container.decode(String.self, forKey: .sourceKey)
        priority = try container.decodeIfPresent(String.self, forKey: .priority) ?? "medium"
        confidence = try container.decodeIfPresent(Double.self, forKey: .confidence)
        subject = try container.decodeIfPresent(EvalSubject.self, forKey: .subject)
        listing = try container.decodeIfPresent(ListingInfo.self, forKey: .listing)
        let decodedImages = try container.decodeIfPresent([EvalImage].self, forKey: .images) ?? []
        media = try container.decodeIfPresent([EvalMedia].self, forKey: .media) ?? []
        images = decodedImages.isEmpty ? media.compactMap(EvalImage.init(media:)) : decodedImages
        analysisContext = try container.decodeIfPresent(AnalysisContext.self, forKey: .analysisContext) ?? .empty
        evidence = try container.decodeIfPresent([EvidenceSnippet].self, forKey: .evidence) ?? []
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(schemaVersion, forKey: .schemaVersion)
        try container.encode(cardId, forKey: .cardId)
        try container.encode(cardType, forKey: .cardType)
        try container.encode(question, forKey: .question)
        try container.encode(claim, forKey: .claim)
        try container.encode(sourceKey, forKey: .sourceKey)
        try container.encode(priority, forKey: .priority)
        try container.encodeIfPresent(confidence, forKey: .confidence)
        try container.encodeIfPresent(subject, forKey: .subject)
        try container.encodeIfPresent(listing, forKey: .listing)
        try container.encode(images, forKey: .images)
        if !media.isEmpty {
            try container.encode(media, forKey: .media)
        }
        try container.encode(analysisContext, forKey: .analysisContext)
        try container.encode(evidence, forKey: .evidence)
    }
}

@MainActor
func mediEvalFreshDeckCards(
    maxPagesToScan: Int,
    fetchPage: (Int) async throws -> EvalDeckResponse,
    includeCard: (EvalCard) -> Bool
) async throws -> [EvalCard] {
    var freshCards: [EvalCard] = []
    var page = 1
    var pageCount = 1
    let scanLimit = max(1, maxPagesToScan)

    repeat {
        let deck = try await fetchPage(page)
        freshCards.append(contentsOf: deck.cards.filter(includeCard))
        pageCount = max(1, deck.pageCount)
        page += 1
    } while freshCards.isEmpty && page <= pageCount && page <= scanLimit

    return freshCards
}

struct EvalClaim: Codable {
    let template: String
    let path: String
    let value: String
}

struct ListingInfo: Codable {
    let title: String
    let url: String
    let price: String
    let marketplace: String
}

struct EvalSubject: Codable {
    let title: String
    let subtitle: String?
    let url: String?
    let source: String?
    let metadata: [String: String]?

    init(
        title: String,
        subtitle: String? = nil,
        url: String? = nil,
        source: String? = nil,
        metadata: [String: String]? = nil
    ) {
        self.title = title
        self.subtitle = subtitle
        self.url = url
        self.source = source
        self.metadata = metadata
    }
}

struct EvalImage: Codable, Identifiable {
    let url: String
    let position: Int
    let source: String

    init(url: String, position: Int, source: String) {
        self.url = url
        self.position = position
        self.source = source
    }

    init?(media: EvalMedia) {
        guard media.isImage else { return nil }
        self.url = media.url
        self.position = media.position ?? 1
        self.source = media.source ?? media.label ?? "media"
    }

    var id: String { "\(position)-\(url)" }
}

struct EvalMedia: Codable, Identifiable {
    let url: String
    let type: String?
    let label: String?
    let position: Int?
    let source: String?

    init(
        url: String,
        type: String? = "image",
        label: String? = nil,
        position: Int? = nil,
        source: String? = nil
    ) {
        self.url = url
        self.type = type
        self.label = label
        self.position = position
        self.source = source
    }

    var id: String { "\(position ?? 0)-\(url)" }

    var isImage: Bool {
        let normalizedType = type?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? "image"
        return normalizedType.isEmpty || normalizedType == "image"
    }
}

struct AnalysisContext: Codable {
    let summary: String
    let model: String
    let provider: String
    let analysisStage: String
    let warnings: [String]

    static let empty = AnalysisContext()

    init(
        summary: String = "",
        model: String = "",
        provider: String = "",
        analysisStage: String = "",
        warnings: [String] = []
    ) {
        self.summary = summary
        self.model = model
        self.provider = provider
        self.analysisStage = analysisStage
        self.warnings = warnings
    }

    enum CodingKeys: String, CodingKey {
        case summary
        case model
        case provider
        case analysisStage
        case warnings
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        summary = try container.decodeIfPresent(String.self, forKey: .summary) ?? ""
        model = try container.decodeIfPresent(String.self, forKey: .model) ?? ""
        provider = try container.decodeIfPresent(String.self, forKey: .provider) ?? ""
        analysisStage = try container.decodeIfPresent(String.self, forKey: .analysisStage) ?? ""
        warnings = try container.decodeIfPresent([String].self, forKey: .warnings) ?? []
    }
}

struct EvidenceSnippet: Codable, Identifiable {
    let source: String
    let detail: String
    let confidence: Double?
    let imagePositions: [String]

    init(source: String, detail: String, confidence: Double? = nil, imagePositions: [String] = []) {
        self.source = source
        self.detail = detail
        self.confidence = confidence
        self.imagePositions = imagePositions
    }

    private enum CodingKeys: String, CodingKey { case source, detail, confidence, imagePositions }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        source = try container.decode(String.self, forKey: .source)
        detail = try container.decode(String.self, forKey: .detail)
        confidence = try container.decodeIfPresent(Double.self, forKey: .confidence)
        imagePositions = try container.decodeIfPresent([String].self, forKey: .imagePositions) ?? []
    }

    var id: String { "\(source)-\(detail)-\(imagePositions.joined(separator: ","))" }
}

enum EvalAnswer: String, Codable, CaseIterable {
    case yes
    case no
    case unsure
    case badQuestion = "bad_question"
    case skip

    var title: String {
        switch self {
        case .yes: return "Aye"
        case .no: return "Nay"
        case .unsure: return "Hmm"
        case .badQuestion: return "Cursed"
        case .skip: return "Pass"
        }
    }

    var symbolName: String {
        switch self {
        case .yes: return "checkmark.circle.fill"
        case .no: return "xmark.circle.fill"
        case .unsure: return "questionmark.circle"
        case .badQuestion: return "exclamationmark.bubble"
        case .skip: return "forward.fill"
        }
    }

    var tint: Color {
        switch self {
        case .yes: return .green
        case .no: return .red
        case .unsure: return .orange
        case .badQuestion: return .purple
        case .skip: return .gray
        }
    }
}

struct EvalResultPayload: Codable {
    let eventId: String?
    let runId: String?
    let projectId: String?
    let userId: String?
    let workspaceId: String?
    let serverURL: String?
    let cardId: String
    let reviewer: String
    let answer: EvalAnswer
    let correction: EvalCorrection?
    let notes: String
    let durationMs: Int?
    let clientGeneratedAt: String

    init(
        eventId: String?,
        runId: String? = nil,
        projectId: String? = nil,
        userId: String? = nil,
        workspaceId: String? = nil,
        serverURL: String? = nil,
        cardId: String,
        reviewer: String,
        answer: EvalAnswer,
        correction: EvalCorrection?,
        notes: String,
        durationMs: Int?,
        clientGeneratedAt: String
    ) {
        self.eventId = eventId
        self.runId = runId
        self.projectId = projectId
        self.userId = userId
        self.workspaceId = workspaceId
        self.serverURL = serverURL
        self.cardId = cardId
        self.reviewer = reviewer
        self.answer = answer
        self.correction = correction
        self.notes = notes
        self.durationMs = durationMs
        self.clientGeneratedAt = clientGeneratedAt
    }
}

extension EvalCard {
    var subjectDisplayTitle: String {
        firstNonEmpty(subject?.title, listing?.title, claim.value, sourceKey) ?? "Untitled eval subject"
    }

    var subjectDisplaySubtitle: String? {
        if let subtitle = firstNonEmpty(subject?.subtitle) {
            return subtitle
        }

        let listingBits = [listing?.price, listing?.marketplace]
            .compactMap { firstNonEmpty($0) }
        return listingBits.isEmpty ? firstNonEmpty(subject?.source) : listingBits.joined(separator: " · ")
    }

    var subjectURLString: String? {
        firstNonEmpty(subject?.url, listing?.url)
    }

    private func firstNonEmpty(_ values: String?...) -> String? {
        for value in values {
            let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !trimmed.isEmpty {
                return trimmed
            }
        }
        return nil
    }
}

struct EvalCorrection: Codable {
    let correctAnswer: String
    let reasonTags: [String]

    var isActionable: Bool {
        mediEvalCorrectionIsActionable(correctAnswer: correctAnswer, reasonTags: reasonTags)
    }
}

func mediEvalCorrectionIsActionable(correctAnswer: String, reasonTags: [String]) -> Bool {
    let trimmedAnswer = correctAnswer.trimmingCharacters(in: .whitespacesAndNewlines)
    let hasReasonTag = reasonTags.contains {
        !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    return !trimmedAnswer.isEmpty || hasReasonTag
}

struct MediEvalReward: Equatable {
    let xp: Int
    let gold: Int
    let correctionPresent: Bool
}

enum MediEvalRewardScoring {
    static func score(
        answer: EvalAnswer,
        correction: EvalCorrection?,
        priority: String?,
        confidence: Double?
    ) -> MediEvalReward {
        let correctionPresent = answer == .no && hasCorrection(correction)
        let base = baseReward(answer: answer)
        return MediEvalReward(
            xp: base.xp + priorityBonus(priority) + confidenceBonus(confidence) + (correctionPresent ? 8 : 0),
            gold: base.gold + (correctionPresent ? 2 : 0),
            correctionPresent: correctionPresent
        )
    }

    static func hasCorrection(_ correction: EvalCorrection?) -> Bool {
        guard let correction else { return false }
        return correction.isActionable
    }

    private static func baseReward(answer: EvalAnswer) -> (xp: Int, gold: Int) {
        switch answer {
        case .yes, .no: return (10, 3)
        case .unsure: return (6, 1)
        case .badQuestion: return (8, 1)
        case .skip: return (2, 0)
        }
    }

    private static func priorityBonus(_ priority: String?) -> Int {
        switch priority?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "high": return 4
        case "medium": return 2
        default: return 0
        }
    }

    private static func confidenceBonus(_ confidence: Double?) -> Int {
        guard let confidence else { return 0 }
        if confidence < 0.35 { return 5 }
        if confidence < 0.65 { return 2 }
        return 0
    }
}

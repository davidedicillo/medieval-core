import Foundation
import Combine

struct OutboxItem: Codable, Identifiable {
    let id: UUID
    let payload: EvalResultPayload
    let gamePayload: GameVerdictPayload?
    let scope: String?

    init(id: UUID = UUID(), payload: EvalResultPayload, gamePayload: GameVerdictPayload? = nil, scope: String? = nil) {
        self.id = id
        self.payload = payload
        self.gamePayload = gamePayload
        self.scope = scope
    }
}

struct EvalOutboxFlushResult {
    let acceptedGamePayloads: [GameVerdictPayload]
    let acceptedCardIds: [String]
    let sentCount: Int
    let retainedCount: Int
    let hardFailure: Error?
}

struct ReviewedCardRecord: Codable, Identifiable {
    let id: String
    let cardId: String
    let reviewerKey: String
    let serviceKey: String
    let reviewedAt: String

    init(cardId: String, reviewerKey: String, serviceKey: String, reviewedAt: String) {
        self.id = "\(serviceKey)|\(reviewerKey)|\(cardId)"
        self.cardId = cardId
        self.reviewerKey = reviewerKey
        self.serviceKey = serviceKey
        self.reviewedAt = reviewedAt
    }
}

@MainActor
final class OutboxStore: ObservableObject {
    @Published private(set) var items: [OutboxItem] = []

    private let fileURL: URL
    private var isFlushing = false

    init(fileURL: URL? = nil) {
        if let fileURL {
            self.fileURL = fileURL
        } else {
            let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
            self.fileURL = directory.appendingPathComponent("eval-result-outbox.json")
        }
        load()
    }

    func enqueue(_ payload: EvalResultPayload, gamePayload: GameVerdictPayload? = nil, scope: String? = nil) {
        if let existingIndex = items.firstIndex(where: { $0.scope == scope && Self.isSamePayload($0.payload, payload) }) {
            items[existingIndex] = OutboxItem(id: items[existingIndex].id, payload: payload, gamePayload: gamePayload ?? items[existingIndex].gamePayload, scope: scope)
            save()
            return
        }
        items.append(OutboxItem(payload: payload, gamePayload: gamePayload, scope: scope))
        save()
    }

    var pendingCardIds: Set<String> {
        Set(items.map(\.payload.cardId))
    }

    func pendingCardIds(scope: String?) -> Set<String> {
        Set(items.filter { $0.scope == scope }.map(\.payload.cardId))
    }

    func flush<Client: MediEvalResultSubmitting>(using client: Client, scope: String? = nil) async -> EvalOutboxFlushResult {
        guard !items.isEmpty, !isFlushing else {
            return EvalOutboxFlushResult(acceptedGamePayloads: [], acceptedCardIds: [], sentCount: 0, retainedCount: 0, hardFailure: nil)
        }
        isFlushing = true
        defer { isFlushing = false }
        let snapshot = items
        var acceptedItemIds = Set<UUID>()
        var acceptedGamePayloads: [GameVerdictPayload] = []
        var acceptedCardIds: [String] = []
        var sentCount = 0
        var hardFailure: Error?
        for item in snapshot {
            guard item.scope == scope else { continue }
            do {
                try await client.submitResult(item.payload)
                sentCount += 1
                acceptedItemIds.insert(item.id)
                acceptedCardIds.append(item.payload.cardId)
                if let gamePayload = item.gamePayload {
                    acceptedGamePayloads.append(gamePayload)
                }
            } catch {
                if hardFailure == nil, !mediEvalShouldQueueSubmissionFailure(error) {
                    hardFailure = error
                }
            }
        }
        items.removeAll { acceptedItemIds.contains($0.id) }
        save()
        return EvalOutboxFlushResult(
            acceptedGamePayloads: acceptedGamePayloads,
            acceptedCardIds: acceptedCardIds,
            sentCount: sentCount,
            retainedCount: items.filter { $0.scope == scope }.count,
            hardFailure: hardFailure
        )
    }

    private func load() {
        guard let data = try? Data(contentsOf: fileURL) else { return }
        items = Self.normalized((try? JSONDecoder().decode([OutboxItem].self, from: data)) ?? [])
        save()
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(items) else { return }
        try? data.write(to: fileURL, options: [.atomic])
    }

    private static func normalized(_ loadedItems: [OutboxItem]) -> [OutboxItem] {
        var normalizedItems: [OutboxItem] = []
        for item in loadedItems {
            guard !item.payload.cardId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
            if let existingIndex = normalizedItems.firstIndex(where: { $0.scope == item.scope && isSamePayload($0.payload, item.payload) }) {
                let existing = normalizedItems[existingIndex]
                normalizedItems[existingIndex] = OutboxItem(
                    id: existing.id,
                    payload: item.payload,
                    gamePayload: item.gamePayload ?? existing.gamePayload,
                    scope: item.scope
                )
            } else {
                normalizedItems.append(item)
            }
        }
        return normalizedItems
    }

    private static func isSamePayload(_ lhs: EvalResultPayload, _ rhs: EvalResultPayload) -> Bool {
        let leftEventId = lhs.eventId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let rightEventId = rhs.eventId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !leftEventId.isEmpty && !rightEventId.isEmpty {
            return leftEventId == rightEventId
        }
        return lhs.cardId == rhs.cardId
    }
}

@MainActor
final class ReviewedCardStore: ObservableObject {
    @Published private(set) var records: [ReviewedCardRecord] = []

    private let fileURL: URL
    private let maxRecords: Int

    init(fileURL: URL? = nil, maxRecords: Int = 5_000) {
        self.maxRecords = max(100, maxRecords)
        if let fileURL {
            self.fileURL = fileURL
        } else {
            let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
            self.fileURL = directory.appendingPathComponent("reviewed-card-guard.json")
        }
        load()
    }

    func mark(cardId: String, reviewer: String, serviceKey: String, reviewedAt: String = ISO8601DateFormatter().string(from: Date())) {
        let normalizedCardId = cardId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedCardId.isEmpty else { return }
        let record = ReviewedCardRecord(
            cardId: normalizedCardId,
            reviewerKey: Self.normalizedKey(reviewer),
            serviceKey: Self.normalizedKey(serviceKey),
            reviewedAt: reviewedAt
        )
        if let existingIndex = records.firstIndex(where: { $0.id == record.id }) {
            records[existingIndex] = record
        } else {
            records.append(record)
        }
        trimAndSave()
    }

    func mark(cardIds: [String], reviewer: String, serviceKey: String, reviewedAt: String = ISO8601DateFormatter().string(from: Date())) {
        for cardId in cardIds {
            mark(cardId: cardId, reviewer: reviewer, serviceKey: serviceKey, reviewedAt: reviewedAt)
        }
    }

    func reviewedCardIds(reviewer: String, serviceKey: String) -> Set<String> {
        let reviewerKey = Self.normalizedKey(reviewer)
        let normalizedServiceKey = Self.normalizedKey(serviceKey)
        return Set(records
            .filter { $0.reviewerKey == reviewerKey && $0.serviceKey == normalizedServiceKey }
            .map(\.cardId))
    }

    func contains(cardId: String, reviewer: String, serviceKey: String) -> Bool {
        reviewedCardIds(reviewer: reviewer, serviceKey: serviceKey).contains(cardId)
    }

    private func load() {
        guard let data = try? Data(contentsOf: fileURL) else { return }
        let loaded = (try? JSONDecoder().decode([ReviewedCardRecord].self, from: data)) ?? []
        records = Self.normalized(loaded, maxRecords: maxRecords)
        save()
    }

    private func trimAndSave() {
        records = Self.normalized(records, maxRecords: maxRecords)
        save()
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(records) else { return }
        try? data.write(to: fileURL, options: [.atomic])
    }

    private static func normalized(_ loadedRecords: [ReviewedCardRecord], maxRecords: Int) -> [ReviewedCardRecord] {
        var byId: [String: ReviewedCardRecord] = [:]
        for record in loadedRecords {
            let cardId = record.cardId.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cardId.isEmpty else { continue }
            let normalized = ReviewedCardRecord(
                cardId: cardId,
                reviewerKey: normalizedKey(record.reviewerKey),
                serviceKey: normalizedKey(record.serviceKey),
                reviewedAt: record.reviewedAt
            )
            byId[normalized.id] = normalized
        }
        return byId.values
            .sorted { $0.reviewedAt < $1.reviewedAt }
            .suffix(maxRecords)
            .sorted { $0.reviewedAt < $1.reviewedAt }
    }

    private static func normalizedKey(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
}

struct GameOutboxItem: Codable, Identifiable {
    let id: UUID
    let payload: GameVerdictPayload

    init(id: UUID = UUID(), payload: GameVerdictPayload) {
        self.id = id
        self.payload = payload
    }
}

struct GameOutboxFlushResult {
    let sentCount: Int
    let retainedCount: Int
    let hardFailure: Error?
}

@MainActor
final class GameOutboxStore: ObservableObject {
    @Published private(set) var items: [GameOutboxItem] = []

    private let fileURL: URL

    init(fileURL: URL? = nil) {
        if let fileURL {
            self.fileURL = fileURL
        } else {
            let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
            self.fileURL = directory.appendingPathComponent("medieval-game-outbox.json")
        }
        load()
    }

    func enqueue(_ payload: GameVerdictPayload) {
        guard !items.contains(where: { $0.payload.eventId == payload.eventId }) else { return }
        items.append(GameOutboxItem(payload: payload))
        save()
    }

    func flush<Client: MediEvalGameVerdictSubmitting>(using client: Client) async -> GameOutboxFlushResult {
        guard !items.isEmpty else {
            return GameOutboxFlushResult(sentCount: 0, retainedCount: 0, hardFailure: nil)
        }
        var remaining: [GameOutboxItem] = []
        var sentCount = 0
        var hardFailure: Error?
        for item in items {
            do {
                try await client.submitVerdict(item.payload)
                sentCount += 1
            } catch {
                remaining.append(item)
                if hardFailure == nil, !mediEvalShouldQueueSubmissionFailure(error) {
                    hardFailure = error
                }
            }
        }
        items = remaining
        save()
        return GameOutboxFlushResult(sentCount: sentCount, retainedCount: remaining.count, hardFailure: hardFailure)
    }

    private func load() {
        guard let data = try? Data(contentsOf: fileURL) else { return }
        items = Self.normalized((try? JSONDecoder().decode([GameOutboxItem].self, from: data)) ?? [])
        save()
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(items) else { return }
        try? data.write(to: fileURL, options: [.atomic])
    }

    private static func normalized(_ loadedItems: [GameOutboxItem]) -> [GameOutboxItem] {
        var seenEventIds = Set<String>()
        var normalizedItems: [GameOutboxItem] = []
        for item in loadedItems {
            let eventId = item.payload.eventId.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !eventId.isEmpty, !seenEventIds.contains(eventId) else { continue }
            seenEventIds.insert(eventId)
            normalizedItems.append(item)
        }
        return normalizedItems
    }
}

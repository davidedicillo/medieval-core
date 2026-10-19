import SwiftUI

enum MediEvalMusicTrack: String, CaseIterable, Identifiable {
    case courtMinstrels = "court_minstrels"
    case dungeonScribe = "dungeon_scribe"
    case tavernJig = "tavern_jig"
    case castleFanfare = "castle_fanfare"
    case arcadeScribe = "arcade_scribe"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .courtMinstrels: return "Court Minstrels"
        case .dungeonScribe: return "Dungeon Scribe"
        case .tavernJig: return "Tavern Quest Jig"
        case .castleFanfare: return "Castle Fanfare"
        case .arcadeScribe: return "Arcade Scribe"
        }
    }

    var detail: String {
        switch self {
        case .courtMinstrels: return "Most medieval, light, and judge-friendly."
        case .dungeonScribe: return "Darker and calmer for long review sessions."
        case .tavernJig: return "Bouncier, fun, and very quest-board."
        case .castleFanfare: return "Heroic, bright, and more title-screen."
        case .arcadeScribe: return "The original chiptune loop."
        }
    }

    var assetName: String {
        switch self {
        case .courtMinstrels: return "MediEvalMusicCourtMinstrels"
        case .dungeonScribe: return "MediEvalMusicDungeonScribe"
        case .tavernJig: return "MediEvalMusicTavernJig"
        case .castleFanfare: return "MediEvalMusicCastleFanfare"
        case .arcadeScribe: return "MediEvalChiptuneLoop"
        }
    }

    static let defaultTrack: MediEvalMusicTrack = .courtMinstrels
}

final class AppSettings: ObservableObject {
    @Published var usesLegacyConnection: Bool {
        didSet { defaults.set(usesLegacyConnection, forKey: "usesLegacyConnection") }
    }
    @Published var projectIdString = ""
    @Published var accountUserId: String?
    @Published var accountDisplayName = ""
    @Published var accountWorkspaceId: String?
    @Published var accountSessionToken = ""
    @Published var baseURLString: String {
        didSet { defaults.set(baseURLString, forKey: Keys.baseURL) }
    }
    @Published var reviewerName: String {
        didSet { defaults.set(reviewerName, forKey: Keys.reviewerName) }
    }
    @Published var runIdString: String {
        didSet { defaults.set(runIdString, forKey: Keys.runId) }
    }
    @Published var token: String {
        didSet { defaults.set(token, forKey: Keys.token) }
    }
    @Published var gameURLString: String {
        didSet { defaults.set(gameURLString, forKey: Keys.gameURL) }
    }
    @Published var gameToken: String {
        didSet { defaults.set(gameToken, forKey: Keys.gameToken) }
    }
    @Published var isMusicEnabled: Bool {
        didSet { defaults.set(isMusicEnabled, forKey: Keys.isMusicEnabled) }
    }
    @Published var musicTrackId: String {
        didSet { defaults.set(musicTrackId, forKey: Keys.musicTrackId) }
    }

    private let defaults = UserDefaults.standard

    private enum Keys {
        static let baseURL = "baseURL"
        static let reviewerName = "reviewerName"
        static let runId = "runId"
        static let token = "token"
        static let gameURL = "gameURL"
        static let gameToken = "gameToken"
        static let isMusicEnabled = "isMusicEnabled"
        static let musicTrackId = "musicTrackId"
    }

    init() {
        usesLegacyConnection = defaults.bool(forKey: "usesLegacyConnection")
        baseURLString = defaults.string(forKey: Keys.baseURL) ?? ""
        reviewerName = defaults.string(forKey: Keys.reviewerName) ?? ""
        runIdString = defaults.string(forKey: Keys.runId) ?? ""
        token = defaults.string(forKey: Keys.token) ?? ""
        gameURLString = defaults.string(forKey: Keys.gameURL) ?? ""
        gameToken = defaults.string(forKey: Keys.gameToken) ?? ""
        isMusicEnabled = defaults.object(forKey: Keys.isMusicEnabled) == nil
            ? true
            : defaults.bool(forKey: Keys.isMusicEnabled)
        let savedMusicTrackId = defaults.string(forKey: Keys.musicTrackId) ?? ""
        musicTrackId = MediEvalMusicTrack(rawValue: savedMusicTrackId)?.rawValue
            ?? MediEvalMusicTrack.defaultTrack.rawValue

        if Self.shouldAutoUseLocalDemoBackend() {
            useLocalDemoBackend(loopbackURLAllowed: true)
        }
    }

    static func shouldAutoUseLocalDemoBackend(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        arguments: [String] = ProcessInfo.processInfo.arguments
    ) -> Bool {
        if ["1", "true", "yes"].contains(environment["MEDIEVAL_USE_LOCAL_DEMO"]?.lowercased() ?? "") {
            return true
        }
        return arguments.contains("--medieval-use-local-demo")
    }

    private static var shouldUseLoopbackForLocalDemo: Bool {
        #if targetEnvironment(simulator)
        return true
        #else
        return false
        #endif
    }

    @discardableResult
    func useLocalDemoBackend(loopbackURLAllowed: Bool? = nil) -> Bool {
        usesLegacyConnection = true
        clearAccountConnection()
        let shouldFillLoopbackURL = loopbackURLAllowed ?? Self.shouldUseLoopbackForLocalDemo
        if shouldFillLoopbackURL {
            baseURLString = "http://127.0.0.1:5199"
            gameURLString = "http://127.0.0.1:5199"
        } else {
            baseURLString = Self.preservedPhysicalDeviceDemoURL(baseURLString)
            gameURLString = Self.preservedPhysicalDeviceDemoURL(gameURLString)
        }
        runIdString = ""
        token = "demo-token"
        gameToken = "demo-token"
        if reviewerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            reviewerName = "Davide"
        }
        return shouldFillLoopbackURL || !baseURLString.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private static func preservedPhysicalDeviceDemoURL(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }
        guard let host = mediEvalNormalizedBaseURL(from: trimmed)?.host?.lowercased() else { return trimmed }
        if host == "localhost" || host == "127.0.0.1" || host == "::1" {
            return ""
        }
        return trimmed
    }

    var reviewer: String {
        if let accountUserId { return accountUserId }
        let trimmed = reviewerName.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "anonymous" : trimmed
    }

    var reviewerDisplayName: String {
        accountUserId == nil ? reviewer : accountDisplayName
    }

    var reviewScope: String {
        [mediEvalNormalizedBaseURLString(from: baseURLString) ?? baseURLString,
         accountUserId ?? "legacy", projectIdString, pinnedRunId ?? "default"].joined(separator: "|")
    }

    var outboxScope: String? { usesLegacyConnection ? nil : reviewScope }

    func clearAccountConnection() {
        accountUserId = nil
        accountWorkspaceId = nil
        accountDisplayName = ""
        accountSessionToken = ""
        projectIdString = ""
    }

    var pinnedRunId: String? {
        let trimmed = runIdString.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    var client: EvalAPIClient? {
        guard let url = mediEvalNormalizedBaseURL(from: baseURLString),
              !dashboardToken.isEmpty else {
            return nil
        }
        return EvalAPIClient(baseURL: url, token: dashboardToken, runId: pinnedRunId,
                             projectId: projectIdString.isEmpty ? nil : projectIdString,
                             accountUserId: accountUserId)
    }

    var gameClient: MediEvalGameAPIClient? {
        guard usesLegacyConnection else { return nil }
        guard let url = mediEvalNormalizedBaseURL(from: gameURLString),
              !gameServiceToken.isEmpty else {
            return nil
        }
        return MediEvalGameAPIClient(baseURL: url, token: gameServiceToken)
    }

    var dashboardToken: String {
        if !usesLegacyConnection { return accountSessionToken }
        return token.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var gameServiceToken: String {
        gameToken.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var musicTrack: MediEvalMusicTrack {
        MediEvalMusicTrack(rawValue: musicTrackId) ?? .defaultTrack
    }

    func normalizeDashboardURLIfPossible() {
        if let normalized = mediEvalNormalizedBaseURLString(from: baseURLString) {
            baseURLString = normalized
        }
    }

    func normalizeGameURLIfPossible() {
        if let normalized = mediEvalNormalizedBaseURLString(from: gameURLString) {
            gameURLString = normalized
        }
    }

    func dashboardSetupProblem() -> String? {
        if baseURLString.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "Add an eval backend URL first."
        }
        if mediEvalNormalizedBaseURL(from: baseURLString) == nil {
            return "Use a valid http or https eval backend URL."
        }
        if reviewerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "Add your guild name so verdicts stay separate."
        }
        if dashboardToken.isEmpty {
            return "Add the royal seal from the dashboard."
        }
        return nil
    }

    func guildSetupProblem() -> String? {
        if gameURLString.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "Add the guild backend URL first."
        }
        if mediEvalNormalizedBaseURL(from: gameURLString) == nil {
            return "Use a valid http or https guild backend URL."
        }
        if reviewerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "Add your guild name before syncing rewards."
        }
        if gameServiceToken.isEmpty {
            return "Add the guild backend token."
        }
        return nil
    }
}

enum MediEvalTheme {
    static let parchment = Color(red: 0.98, green: 0.92, blue: 0.78)
    static let parchmentLight = Color(red: 1.0, green: 0.97, blue: 0.88)
    static let ink = Color(red: 0.16, green: 0.11, blue: 0.08)
    static let mutedInk = Color(red: 0.45, green: 0.39, blue: 0.32)
    static let stone = Color(red: 0.44, green: 0.47, blue: 0.52)
    static let stoneDark = Color(red: 0.22, green: 0.25, blue: 0.30)
    static let royal = Color(red: 0.12, green: 0.29, blue: 0.56)
    static let gold = Color(red: 0.91, green: 0.65, blue: 0.16)
    static let danger = Color(red: 0.86, green: 0.18, blue: 0.20)
    static let forest = Color(red: 0.17, green: 0.57, blue: 0.29)
    static let ember = Color(red: 0.92, green: 0.49, blue: 0.15)
    static let sky = Color(red: 0.77, green: 0.88, blue: 0.96)
}

extension View {
    @ViewBuilder
    func mediEvalURLFieldStyle() -> some View {
        #if os(iOS)
        self
            .keyboardType(.URL)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .textFieldStyle(.roundedBorder)
        #else
        self
            .autocorrectionDisabled()
            .textFieldStyle(.roundedBorder)
        #endif
    }

    @ViewBuilder
    func mediEvalTextFieldStyle() -> some View {
        #if os(iOS)
        self
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .textFieldStyle(.roundedBorder)
        #else
        self
            .autocorrectionDisabled()
            .textFieldStyle(.roundedBorder)
        #endif
    }

    @ViewBuilder
    func mediEvalInlineNavigationTitle() -> some View {
        #if os(iOS)
        self.navigationBarTitleDisplayMode(.inline)
        #else
        self
        #endif
    }

    @ViewBuilder
    func mediEvalHideNavigationBar() -> some View {
        #if os(iOS)
        self.toolbar(.hidden, for: .navigationBar)
        #else
        self
        #endif
    }

    @ViewBuilder
    func mediEvalPageTabViewStyle() -> some View {
        #if os(iOS)
        self.tabViewStyle(.page)
        #else
        self
        #endif
    }

    @ViewBuilder
    func mediEvalHiddenPageTabViewStyle() -> some View {
        #if os(iOS)
        self.tabViewStyle(.page(indexDisplayMode: .never))
        #else
        self
        #endif
    }

    @ViewBuilder
    func mediEvalImageViewerPresentation<Content: View>(
        isPresented: Binding<Bool>,
        @ViewBuilder content: @escaping () -> Content
    ) -> some View {
        #if os(iOS)
        self.fullScreenCover(isPresented: isPresented, content: content)
        #else
        self.sheet(isPresented: isPresented, content: content)
        #endif
    }
}

@MainActor
final class GameProgressStore: ObservableObject {
    @Published private(set) var totalVerdicts: Int
    @Published private(set) var xp: Int
    @Published private(set) var gold: Int
    @Published private(set) var streak: Int
    @Published private(set) var correctionCount: Int
    @Published private(set) var lastActiveDay: String
    @Published private(set) var serverProfile: GameProfile?

    private let defaults = UserDefaults.standard

    private enum Keys {
        static let totalVerdicts = "game.totalVerdicts"
        static let xp = "game.xp"
        static let gold = "game.gold"
        static let streak = "game.streak"
        static let correctionCount = "game.correctionCount"
        static let lastActiveDay = "game.lastActiveDay"
    }

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    init() {
        totalVerdicts = defaults.integer(forKey: Keys.totalVerdicts)
        xp = defaults.integer(forKey: Keys.xp)
        gold = defaults.integer(forKey: Keys.gold)
        streak = defaults.integer(forKey: Keys.streak)
        correctionCount = defaults.integer(forKey: Keys.correctionCount)
        lastActiveDay = defaults.string(forKey: Keys.lastActiveDay) ?? ""
        serverProfile = nil
    }

    var rankTitle: String {
        if let serverProfile { return serverProfile.rank }
        switch xp {
        case 0..<250: return "Page"
        case 250..<1000: return "Squire"
        case 1000..<3000: return "Knight"
        default: return "Guild Scribe"
        }
    }

    var nextRankProgress: Double {
        if let serverProfile { return serverProfile.rankProgress }
        switch xp {
        case 0..<250: return Double(xp) / 250
        case 250..<1000: return Double(xp - 250) / 750
        case 1000..<3000: return Double(xp - 1000) / 2000
        default: return 1
        }
    }

    var syncedFromServer: Bool {
        serverProfile != nil
    }

    func sync(profile: GameProfile) {
        serverProfile = profile
        totalVerdicts = profile.totalVerdicts
        xp = profile.xp
        gold = profile.gold
        streak = profile.streakDays
        correctionCount = profile.correctionCount
        defaults.set(totalVerdicts, forKey: Keys.totalVerdicts)
        defaults.set(xp, forKey: Keys.xp)
        defaults.set(gold, forKey: Keys.gold)
        defaults.set(streak, forKey: Keys.streak)
        defaults.set(correctionCount, forKey: Keys.correctionCount)
    }

    func record(answer: EvalAnswer, correction: EvalCorrection?, card: EvalCard?) {
        let reward = MediEvalRewardScoring.score(
            answer: answer,
            correction: correction,
            priority: card?.priority,
            confidence: card?.confidence
        )
        updateStreak()
        totalVerdicts += 1
        xp += reward.xp
        gold += reward.gold
        if reward.correctionPresent {
            correctionCount += 1
            defaults.set(correctionCount, forKey: Keys.correctionCount)
        }
        defaults.set(totalVerdicts, forKey: Keys.totalVerdicts)
        defaults.set(xp, forKey: Keys.xp)
        defaults.set(gold, forKey: Keys.gold)
    }

    private func updateStreak() {
        let today = Self.dayFormatter.string(from: Date())
        guard lastActiveDay != today else { return }
        let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: Date())
            .map { Self.dayFormatter.string(from: $0) } ?? ""
        streak = lastActiveDay == yesterday ? max(1, streak + 1) : 1
        lastActiveDay = today
        defaults.set(streak, forKey: Keys.streak)
        defaults.set(lastActiveDay, forKey: Keys.lastActiveDay)
    }
}

struct ListingEvalRootView: View {
    @EnvironmentObject private var settings: AppSettings
    @EnvironmentObject private var account: PlatformAccountStore
    @State private var didEvaluateInitialSetup = false
    @State private var isShowingInitialSetup = false

    var body: some View {
        NavigationStack {
            if !settings.usesLegacyConnection {
                if account.user != nil, account.isReviewing {
                    DeckView().id(settings.reviewScope)
                } else {
                    PlatformAccountView()
                }
            } else if shouldShowInitialSetup {
                SettingsView(onDashboardReady: {
                    isShowingInitialSetup = false
                })
            } else {
                DeckView()
            }
        }
        .onAppear {
            guard !didEvaluateInitialSetup else { return }
            isShowingInitialSetup = settings.dashboardSetupProblem() != nil
            didEvaluateInitialSetup = true
        }
        .onOpenURL { if account.receive($0) { settings.usesLegacyConnection = false } }
        .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
            if let url = activity.webpageURL, account.receive(url) { settings.usesLegacyConnection = false }
        }
        .alert("Connect to Platform?", isPresented: Binding(get: { account.proposedConnection != nil }, set: { if !$0 { account.proposedConnection = nil } }), presenting: account.proposedConnection) { url in
            Button("Connect") { settings.clearAccountConnection(); settings.usesLegacyConnection = false; account.applyConnection(url) }
            Button("Cancel", role: .cancel) { account.proposedConnection = nil }
        } message: { url in
            let target = url.scheme == "medieval"
                ? URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "server" })?.value
                : url.absoluteString
            Text(target.flatMap(URL.init(string:))?.host ?? "New server")
        }
    }

    private var shouldShowInitialSetup: Bool {
        didEvaluateInitialSetup ? isShowingInitialSetup : settings.dashboardSetupProblem() != nil
    }
}

struct SettingsView: View {
    @EnvironmentObject private var settings: AppSettings
    @Environment(\.dismiss) private var dismiss
    @State private var dashboardCheck: ConnectionCheckState = .idle
    @State private var guildCheck: ConnectionCheckState = .idle

    let showsDoneButton: Bool
    let onDashboardReady: (() -> Void)?

    init(showsDoneButton: Bool = false, onDashboardReady: (() -> Void)? = nil) {
        self.showsDoneButton = showsDoneButton
        self.onDashboardReady = onDashboardReady
    }

    var body: some View {
        ZStack {
            MediEvalBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 8) {
                        Image("MediEvalLogo")
                            .resizable()
                            .interpolation(.none)
                            .scaledToFit()
                            .frame(width: 190, height: 70, alignment: .leading)
                            .accessibilityLabel("MediEval")

                        Text("Join the guild. Judge the evals.")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(MediEvalTheme.mutedInk)

                        Text("Set the eval backend, your guild name, and the shared access token.")
                            .font(.callout)
                            .foregroundStyle(MediEvalTheme.mutedInk)

                        Button {
                            let urlsReady = settings.useLocalDemoBackend()
                            if urlsReady {
                                dashboardCheck = .idle
                                guildCheck = .idle
                            } else {
                                dashboardCheck = .failure("Paste the Wi-Fi URL printed by `npm run demo:lan`.")
                                guildCheck = .failure("Use the same Wi-Fi URL for the guild backend.")
                            }
                        } label: {
                            MediEvalActionButtonLabel(title: "Use Local Demo", systemImage: "wand.and.stars")
                        }
                        .buttonStyle(.plain)
                    }
                    .themedPanel()

                    VStack(alignment: .leading, spacing: 14) {
                        ThemedFieldLabel(title: "Castle gate", detail: "Eval backend URL")
                        TextField("https://bits.ngrok.app", text: $settings.baseURLString)
                            .mediEvalURLFieldStyle()

                        ThemedFieldLabel(title: "Quest scroll", detail: "Eval Batch ID optional")
                        TextField("partner-test-1", text: $settings.runIdString)
                            .mediEvalTextFieldStyle()

                        ThemedFieldLabel(title: "Guild name", detail: "Reviewer")
                        TextField("Davide", text: $settings.reviewerName)
                            .mediEvalTextFieldStyle()

                        ThemedFieldLabel(title: "Royal seal", detail: "Token")
                        SecureField("Eval backend token", text: $settings.token)
                            .mediEvalTextFieldStyle()

                        ConnectionCheckButton(
                            title: "Test eval backend",
                            systemImage: "network",
                            state: dashboardCheck,
                            action: {
                                Task { await testDashboardConnection() }
                            }
                        )
                    }
                    .themedPanel()

                    VStack(alignment: .leading, spacing: 14) {
                        ThemedFieldLabel(title: "Court minstrels")
                        Toggle(isOn: $settings.isMusicEnabled) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(settings.isMusicEnabled ? "Minstrels playing" : "Minstrels resting")
                                    .font(.headline.weight(.black))
                                Text("Music during quest judging.")
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(MediEvalTheme.mutedInk)
                            }
                        }
                        .tint(MediEvalTheme.gold)

                        Picker("Tune", selection: $settings.musicTrackId) {
                            ForEach(MediEvalMusicTrack.allCases) { track in
                                Text(track.title).tag(track.rawValue)
                            }
                        }
                        .pickerStyle(.menu)
                        .disabled(!settings.isMusicEnabled)

                        Text(settings.musicTrack.detail)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(MediEvalTheme.mutedInk)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .themedPanel()

                    VStack(alignment: .leading, spacing: 14) {
                        ThemedFieldLabel(title: "Guild backend", detail: "Optional game service")
                        Text("Use this when your Coolify MediEval service is live. The eval app still works if these are blank.")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(MediEvalTheme.mutedInk)
                            .fixedSize(horizontal: false, vertical: true)
                        TextField("https://medieval.example.com", text: $settings.gameURLString)
                            .mediEvalURLFieldStyle()
                        SecureField("MediEval game token", text: $settings.gameToken)
                            .mediEvalTextFieldStyle()

                        ConnectionCheckButton(
                            title: "Test guild backend",
                            systemImage: "shield.checkered",
                            state: guildCheck,
                            action: {
                                Task { await testGuildConnection() }
                            }
                        )
                    }
                    .themedPanel()

                    if !showsDoneButton {
                        Button {
                            if let problem = settings.dashboardSetupProblem() {
                                dashboardCheck = .failure(problem)
                            } else {
                                onDashboardReady?()
                            }
                        } label: {
                            MediEvalActionButtonLabel(
                                title: "Enter Quest Board",
                                systemImage: "flag.checkered",
                                isEnabled: settings.dashboardSetupProblem() == nil,
                                height: 50
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(18)
            }
        }
        .navigationTitle("Settings")
        .mediEvalInlineNavigationTitle()
        .toolbar {
            if showsDoneButton {
                #if os(iOS)
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
                #else
                ToolbarItem {
                    Button("Done") {
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
                #endif
            }
        }
        .onChange(of: settings.baseURLString) { _, _ in
            dashboardCheck = .idle
        }
        .onChange(of: settings.runIdString) { _, _ in
            dashboardCheck = .idle
        }
        .onChange(of: settings.token) { _, _ in
            dashboardCheck = .idle
        }
        .onChange(of: settings.gameURLString) { _, _ in
            guildCheck = .idle
        }
        .onChange(of: settings.gameToken) { _, _ in
            guildCheck = .idle
        }
        .onChange(of: settings.reviewerName) { _, _ in
            dashboardCheck = .idle
            guildCheck = .idle
        }
    }

    private func testDashboardConnection() async {
        dashboardCheck = .checking("Opening castle gate...")
        settings.normalizeDashboardURLIfPossible()
        if let problem = settings.dashboardSetupProblem() {
            dashboardCheck = .failure(problem)
            return
        }
        guard let client = settings.client else {
            dashboardCheck = .failure("Check the eval backend URL and royal seal.")
            return
        }
        do {
            let summary = try await client.fetchSummary(reviewer: settings.reviewer)
            dashboardCheck = .success("\(summary.pendingCards) pending · \(summary.reviewedCards) judged · \(summary.totalCards) total\n\(summary.displayBatchId)")
            onDashboardReady?()
        } catch {
            dashboardCheck = .failure(mediEvalErrorMessage(error, serviceName: "castle gate"))
        }
    }

    private func testGuildConnection() async {
        guildCheck = .checking("Checking the guild ledger...")
        settings.normalizeGameURLIfPossible()
        if let problem = settings.guildSetupProblem() {
            guildCheck = .failure(problem)
            return
        }
        guard let gameClient = settings.gameClient else {
            guildCheck = .failure("Check the guild backend URL and token.")
            return
        }
        do {
            let profile = try await gameClient.fetchProfile(reviewer: settings.reviewer)
            guildCheck = .success("\(profile.rank) · \(profile.xp) XP · \(profile.gold) gold")
        } catch {
            guildCheck = .failure(mediEvalErrorMessage(error, serviceName: "guild backend"))
        }
    }
}

enum ConnectionCheckState {
    case idle
    case checking(String)
    case success(String)
    case failure(String)

    var message: String {
        switch self {
        case .idle: return "No scout sent yet"
        case .checking(let message): return message
        case .success(let message): return message
        case .failure(let message): return message
        }
    }

    var iconName: String {
        switch self {
        case .idle: return "circle"
        case .checking: return "hourglass"
        case .success: return "checkmark.seal.fill"
        case .failure: return "exclamationmark.triangle.fill"
        }
    }

    var tint: Color {
        switch self {
        case .idle: return MediEvalTheme.stone
        case .checking: return MediEvalTheme.royal
        case .success: return MediEvalTheme.forest
        case .failure: return MediEvalTheme.danger
        }
    }

    var isChecking: Bool {
        if case .checking = self { return true }
        return false
    }
}

struct ConnectionCheckButton: View {
    let title: String
    let systemImage: String
    let state: ConnectionCheckState
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: action) {
                MediEvalActionButtonLabel(
                    title: title,
                    systemImage: systemImage,
                    isEnabled: !state.isChecking,
                    height: 46
                )
            }
            .buttonStyle(.plain)
            .disabled(state.isChecking)

            HStack(spacing: 8) {
                Image(systemName: state.iconName)
                    .foregroundStyle(state.tint)
                    .frame(width: 18)
                Text(state.message)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(MediEvalTheme.mutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(10)
        .background(MediEvalTheme.parchmentLight.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(state.tint.opacity(0.28), lineWidth: 1.3))
    }
}

struct MediEvalActionButtonLabel: View {
    let title: String
    var systemImage: String?
    var isEnabled = true
    var height: CGFloat = 48
    var fontSize: CGFloat = 15
    var enabledFaceColor = MediEvalTheme.royal

    var body: some View {
        let faceColor = isEnabled ? enabledFaceColor : MediEvalTheme.stone

        HStack(spacing: 9) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: fontSize + 1, weight: .black))
            }
            Text(title)
                .font(.custom("Menlo-Bold", size: fontSize))
                .lineLimit(1)
                .minimumScaleFactor(0.72)
        }
        .foregroundStyle(MediEvalTheme.parchmentLight)
        .frame(maxWidth: .infinity, minHeight: height)
        .padding(.horizontal, 12)
        .background {
            ZStack {
                PixelParchmentPanelBackground(notch: 7)
                    .fill(MediEvalTheme.ink.opacity(isEnabled ? 0.42 : 0.22))
                    .offset(y: 3)
                PixelParchmentPanelBackground(notch: 7)
                    .fill(faceColor)
                PixelParchmentPanelBackground(notch: 7)
                    .stroke(MediEvalTheme.gold.opacity(isEnabled ? 0.82 : 0.32), lineWidth: 2)
                PixelParchmentPanelBackground(notch: 7)
                    .stroke(.white.opacity(isEnabled ? 0.22 : 0.08), lineWidth: 1)
                    .offset(y: -1)
            }
        }
        .contentShape(PixelParchmentPanelBackground(notch: 7))
        .opacity(isEnabled ? 1 : 0.72)
    }
}

struct ThemedFieldLabel: View {
    let title: String
    let detail: String?

    init(title: String, detail: String? = nil) {
        self.title = title
        self.detail = detail
    }

    var body: some View {
        HStack(spacing: 6) {
            Text(title)
                .font(.headline)
            if let detail {
                Text(detail)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(MediEvalTheme.royal)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(MediEvalTheme.sky.opacity(0.65))
                    .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
            }
        }
        .foregroundStyle(MediEvalTheme.ink)
    }
}

struct DeckView: View {
    @EnvironmentObject private var settings: AppSettings
    @EnvironmentObject private var account: PlatformAccountStore
    @Environment(\.scenePhase) private var scenePhase
    @EnvironmentObject private var outbox: OutboxStore
    @StateObject private var gameOutbox = GameOutboxStore()
    @StateObject private var reviewedCards = ReviewedCardStore()
    @StateObject private var progress = GameProgressStore()

    @State private var cards: [EvalCard] = []
    @State private var summary: EvalSummary?
    @State private var isLoading = false
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var submittedCount = 0
    @State private var cardStartedAt = Date()
    @State private var isShowingSettings = false
    @State private var isShowingGuildHall = false
    @State private var isShowingTraining = false
    @State private var qualityFeedbackMessage: String?
    @State private var correctionCard: EvalCard?
    @State private var leaderboard: [GameLeaderboardEntry] = []
    @State private var isSyncingCouriers = false
    @State private var courierStatusMessage: String?
    @State private var mascotTipIndex = -1
    @State private var mascotMessage = "Welcome back, my liege."
    @State private var isShowingMascotTip = false
    @State private var hasQueuedInitialMascotTip = false
    @State private var mascotTipDismissWorkItem: DispatchWorkItem?

    private let deckPageLimit = 20
    private let maxDeckPagesToScan = 5
    private static let mascotTips = [
        "A keen eye earns gold.",
        "Doubt is a fine lantern.",
        "Truth, ho!",
        "No claim escapes the guild.",
        "Aye, inspect the pixels."
    ]

    private var currentCard: EvalCard? {
        cards.first
    }

    private var reviewedTotal: Int {
        (summary?.reviewedCards ?? 0) + submittedCount
    }

    private var dashboardReviewScope: String {
        settings.reviewScope
    }

    var body: some View {
        ZStack {
            MediEvalBackground()
            VStack(spacing: 0) {
                header
                if let errorMessage { ErrorBanner(message: errorMessage) }
                if let qualityFeedbackMessage {
                    Text(qualityFeedbackMessage).font(.callout).padding().background(MediEvalTheme.parchmentLight)
                }
                Group {
                    if isLoading && cards.isEmpty {
                        LoadingQuestView()
                    } else if let card = currentCard {
                        ScrollView {
                            VStack(spacing: 14) {
                                if let rubric = card.reviewRubric, !rubric.text.isEmpty {
                                    Text("Rubric \(rubric.version): \(rubric.text)").font(.callout).padding().background(MediEvalTheme.parchmentLight)
                                }
                                if let quality = card.quality {
                                    Text(quality.kind == "consistency" ? "Consistency quest · compare your judgment over time" : "Reference check · rubric \(quality.rubricVersion)").font(.callout).padding().background(MediEvalTheme.parchmentLight)
                                }
                                SwipeableQuestCard(card: card, isSubmitting: isSubmitting) { answer in
                                    chooseAnswer(answer)
                                }
                            }
                            .padding(.horizontal, 14)
                            .padding(.top, 0)
                            .padding(.bottom, 22)
                        }
                        .refreshable {
                            await refresh()
                        }
                        .disabled(isSubmitting)
                    } else {
                        EmptyDeckView(refresh: {
                            Task { await refresh() }
                        })
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task {
            await refresh()
        }
        .sheet(isPresented: $isShowingSettings) {
            NavigationStack {
                SettingsView(showsDoneButton: true)
            }
            .environmentObject(settings)
        }
        .sheet(isPresented: $isShowingTraining, onDismiss: { Task { await refresh() } }) {
            QualityTrainingView().environmentObject(settings)
        }
        .sheet(isPresented: $isShowingGuildHall) {
            GuildHallView(
                summary: summary,
                submittedCount: submittedCount,
                reviewer: settings.reviewer,
                outboxCount: outbox.items.count,
                gameOutboxCount: gameOutbox.items.count,
                progress: progress,
                leaderboard: leaderboard,
                isSyncingCouriers: isSyncingCouriers,
                courierStatusMessage: courierStatusMessage,
                syncCouriers: {
                    Task { await syncCouriers() }
                }
            )
            .presentationDetents([.medium, .large])
        }
        .sheet(item: $correctionCard) { card in
            CorrectionSheet(card: card) { correction in
                correctionCard = nil
                Task { await submit(.no, correction: correction) }
            }
            .presentationDetents([.medium, .large])
        }
        .onAppear {
            queueInitialMascotTipIfNeeded()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, !settings.usesLegacyConnection {
                Task {
                    do { try await account.refresh(); if account.isReviewing { await refresh() } }
                    catch { errorMessage = error.localizedDescription }
                }
            }
        }
        .onReceive(Timer.publish(every: 36, on: .main, in: .common).autoconnect()) { _ in
            showNextMascotTip()
        }
        .mediEvalHideNavigationBar()
    }

    @MainActor
    private func refresh() async {
        guard let client = settings.client else { return }
        let scope = dashboardReviewScope
        let reviewer = settings.reviewer
        let outboxScope = settings.outboxScope
        isLoading = true
        defer { isLoading = false }
        errorMessage = nil
        let evalFlush = await outbox.flush(using: client, scope: outboxScope)
        reviewedCards.mark(cardIds: evalFlush.acceptedCardIds, reviewer: reviewer, serviceKey: scope)
        guard scope == dashboardReviewScope, !Task.isCancelled else { return }
        _ = await submitAcceptedGameVerdicts(evalFlush.acceptedGamePayloads)
        if let hardFailure = evalFlush.hardFailure {
            let message = evalFailureMessage(for: hardFailure, count: evalFlush.retainedCount)
            courierStatusMessage = message
            errorMessage = message
        }
        await refreshGameProfile()
        do {
            async let deckResponse = fetchFreshCards(using: client)
            async let summaryResponse = client.fetchSummary(reviewer: settings.reviewer)
            let (freshCards, latestSummary) = try await (deckResponse, summaryResponse)
            guard scope == dashboardReviewScope, !Task.isCancelled else { return }
            cards = freshCards
            summary = latestSummary
            submittedCount = 0
            cardStartedAt = Date()
        } catch {
            errorMessage = mediEvalErrorMessage(error, serviceName: "castle gate")
        }
    }

    private func chooseAnswer(_ answer: EvalAnswer) {
        guard !isSubmitting else { return }
        if answer == .no, let currentCard, currentCard.quality == nil {
            correctionCard = currentCard
        } else {
            Task { await submit(answer) }
        }
    }

    @MainActor
    private func syncCouriers() async {
        guard !isSyncingCouriers else { return }
        isSyncingCouriers = true
        defer { isSyncingCouriers = false }

        let evalBefore = outbox.items.count
        let gameBefore = gameOutbox.items.count
        var gameSent = 0
        var hardFailureMessages: [String] = []

        if let client = settings.client {
            let scope = dashboardReviewScope
            let reviewer = settings.reviewer
            let evalFlush = await outbox.flush(using: client, scope: settings.outboxScope)
            reviewedCards.mark(cardIds: evalFlush.acceptedCardIds, reviewer: reviewer, serviceKey: scope)
            guard scope == dashboardReviewScope, !Task.isCancelled else { return }
            if let hardFailure = evalFlush.hardFailure {
                hardFailureMessages.append(evalFailureMessage(for: hardFailure, count: evalFlush.retainedCount))
            }
            gameSent += await submitAcceptedGameVerdicts(evalFlush.acceptedGamePayloads)
            do {
                async let deckResponse = fetchFreshCards(using: client)
                async let summaryResponse = client.fetchSummary(reviewer: settings.reviewer)
                let (freshCards, latestSummary) = try await (deckResponse, summaryResponse)
                guard scope == dashboardReviewScope, !Task.isCancelled else { return }
                cards = freshCards
                summary = latestSummary
                submittedCount = 0
            } catch {
                errorMessage = mediEvalErrorMessage(error, serviceName: "castle gate")
            }
        }

        if let gameClient = settings.gameClient {
            let gameFlush = await gameOutbox.flush(using: gameClient)
            gameSent += gameFlush.sentCount
            if let hardFailure = gameFlush.hardFailure {
                hardFailureMessages.append(guildFailureMessage(for: hardFailure, count: gameFlush.retainedCount))
            }
            async let profileResponse = gameClient.fetchProfile(reviewer: settings.reviewer)
            async let leaderboardResponse = gameClient.fetchLeaderboard(limit: 10)
            if let (profile, latestLeaderboard) = try? await (profileResponse, leaderboardResponse) {
                progress.sync(profile: profile)
                leaderboard = latestLeaderboard
            }
        }

        let evalSent = max(0, evalBefore - outbox.items.count)
        gameSent = max(gameSent, max(0, gameBefore - gameOutbox.items.count))
        let hardFailureMessage = hardFailureMessages.joined(separator: " ")
        if evalSent + gameSent > 0 {
            let sentParts = [
                evalSent > 0 ? "\(evalSent) eval" : nil,
                gameSent > 0 ? "\(gameSent) guild" : nil
            ].compactMap { $0 }
            if gameOutbox.items.count > 0 {
                courierStatusMessage = "Sent \(sentParts.joined(separator: " and ")) courier\(evalSent + gameSent == 1 ? "" : "s"). Guild rewards still sealed."
            } else {
                courierStatusMessage = "Sent \(sentParts.joined(separator: " and ")) courier\(evalSent + gameSent == 1 ? "" : "s")."
            }
            if !hardFailureMessage.isEmpty {
                courierStatusMessage = "\(courierStatusMessage ?? "") \(hardFailureMessage)"
            }
        } else if !hardFailureMessage.isEmpty {
            courierStatusMessage = hardFailureMessage
        } else if outbox.items.count + gameOutbox.items.count > 0 {
            courierStatusMessage = "Couriers still sealed. Check the castle gate or guild backend."
        } else {
            courierStatusMessage = "No sealed couriers waiting."
        }
    }

    @MainActor
    private func refreshGameProfile() async {
        guard let gameClient = settings.gameClient else {
            leaderboard = []
            return
        }
        let flushResult = await gameOutbox.flush(using: gameClient)
        if let hardFailure = flushResult.hardFailure {
            courierStatusMessage = guildFailureMessage(for: hardFailure, count: flushResult.retainedCount)
        }
        async let profileResponse = gameClient.fetchProfile(reviewer: settings.reviewer)
        async let leaderboardResponse = gameClient.fetchLeaderboard(limit: 10)
        if let (profile, latestLeaderboard) = try? await (profileResponse, leaderboardResponse) {
            progress.sync(profile: profile)
            leaderboard = latestLeaderboard
        }
    }

    @MainActor
    private func submit(_ answer: EvalAnswer, correction: EvalCorrection? = nil) async {
        guard let card = currentCard, let client = settings.client else { return }
        let submittingScope = dashboardReviewScope
        let submittingOutboxScope = settings.outboxScope
        let submittingReviewer = settings.reviewer
        let legacy = settings.usesLegacyConnection
        isSubmitting = true
        errorMessage = nil
        let generatedAt = ISO8601DateFormatter().string(from: Date())
        let payload = EvalResultPayload(
            eventId: UUID().uuidString,
            runId: settings.pinnedRunId,
            projectId: client.projectId,
            userId: settings.accountUserId,
            workspaceId: settings.accountWorkspaceId,
            serverURL: settings.accountUserId == nil ? nil : client.baseURL.absoluteString,
            cardId: card.cardId,
            reviewer: settings.reviewer,
            answer: answer,
            correction: correction,
            notes: "",
            durationMs: Int(Date().timeIntervalSince(cardStartedAt) * 1000),
            clientGeneratedAt: generatedAt,
            rubricVersion: card.reviewRubric?.version ?? card.quality?.rubricVersion
        )
        let gamePayload = gameVerdictPayload(card: card, payload: payload)
        var evalAccepted = false
        do {
            if card.quality != nil {
                let feedback = try await client.submitQualityResult(payload)
                guard submittingScope == dashboardReviewScope, !Task.isCancelled else { isSubmitting = false; return }
                qualityFeedbackMessage = feedback.message + (feedback.verifiedQualityBonus > 0 ? " +\(feedback.verifiedQualityBonus) Quality XP." : "")
            } else {
                try await client.submitResult(payload)
                submittedCount += 1
            }
            reviewedCards.mark(cardId: card.cardId, reviewer: submittingReviewer, serviceKey: submittingScope)
            evalAccepted = true
        } catch {
            if mediEvalShouldQueueSubmissionFailure(error) {
                outbox.enqueue(payload, gamePayload: legacy && card.quality == nil ? gamePayload : nil, scope: submittingOutboxScope)
                courierStatusMessage = "Sealed one eval verdict for later."
            } else {
                errorMessage = mediEvalErrorMessage(error, serviceName: "castle gate")
                isSubmitting = false
                return
            }
        }
        guard submittingScope == dashboardReviewScope, !Task.isCancelled else { isSubmitting = false; return }
        if card.quality == nil { progress.record(answer: answer, correction: correction, card: card) }
        if evalAccepted && legacy && card.quality == nil {
            Task { @MainActor in
                let sent = await submitAcceptedGameVerdicts([gamePayload])
                if sent > 0 {
                    await refreshGameProfile()
                }
            }
        }
        cards.removeFirst()
        cardStartedAt = Date()
        isSubmitting = false
        if cards.isEmpty {
            await refresh()
        }
    }

    private func fetchFreshCards(using client: EvalAPIClient) async throws -> [EvalCard] {
        let hiddenCardIds = locallyHiddenCardIds()
        return try await mediEvalFreshDeckCards(
            maxPagesToScan: maxDeckPagesToScan,
            fetchPage: { page in
                try await client.fetchCards(
                    reviewer: settings.reviewer,
                    limit: deckPageLimit,
                    page: page
                )
            },
            includeCard: { card in
                if card.reviewRubric != nil { return !outbox.pendingCardIds(scope: settings.outboxScope).contains(card.cardId) }
                return !hiddenCardIds.contains(card.cardId)
            }
        )
    }

    private func locallyHiddenCardIds() -> Set<String> {
        outbox.pendingCardIds(scope: settings.outboxScope).union(
            reviewedCards.reviewedCardIds(reviewer: settings.reviewer, serviceKey: dashboardReviewScope)
        )
    }

    private func gameVerdictPayload(card: EvalCard, payload: EvalResultPayload) -> GameVerdictPayload {
        let payloadEventId = payload.eventId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let fallbackEventId = "\(settings.reviewer):\(payload.cardId):\(payload.clientGeneratedAt)"
        return GameVerdictPayload(
            eventId: "game:\(payloadEventId.isEmpty ? fallbackEventId : payloadEventId)",
            reviewer: settings.reviewer,
            cardId: payload.cardId,
            answer: payload.answer,
            correction: payload.correction,
            priority: card.priority,
            confidence: card.confidence,
            sourceKey: card.sourceKey,
            claimTemplate: card.claim.template,
            durationMs: payload.durationMs,
            clientGeneratedAt: payload.clientGeneratedAt
        )
    }

    @MainActor
    private func submitAcceptedGameVerdicts(_ payloads: [GameVerdictPayload]) async -> Int {
        guard !payloads.isEmpty else { return 0 }
        guard let gameClient = settings.gameClient else {
            for gamePayload in payloads {
                gameOutbox.enqueue(gamePayload)
            }
            courierStatusMessage = payloads.count == 1
                ? "Sealed one guild reward until the backend is configured."
                : "Sealed \(payloads.count) guild rewards until the backend is configured."
            return 0
        }
        var sentCount = 0
        for gamePayload in payloads {
            do {
                try await gameClient.submitVerdict(gamePayload)
                sentCount += 1
            } catch {
                gameOutbox.enqueue(gamePayload)
                courierStatusMessage = mediEvalShouldQueueSubmissionFailure(error)
                    ? "Sealed one guild reward for later."
                    : guildFailureMessage(for: error, count: 1)
            }
        }
        return sentCount
    }

    private func guildFailureMessage(for error: Error, count: Int) -> String {
        let rewardText = count == 1 ? "reward stays sealed" : "\(max(count, 1)) rewards stay sealed"
        return "Guild reward could not sync; \(rewardText). Fix Settings, then retry. \(mediEvalErrorMessage(error, serviceName: "guild backend"))"
    }

    private func evalFailureMessage(for error: Error, count: Int) -> String {
        let verdictText = count == 1 ? "verdict stays sealed" : "\(max(count, 1)) verdicts stay sealed"
        return "Eval courier could not sync; \(verdictText). Fix Settings, then retry. \(mediEvalErrorMessage(error, serviceName: "castle gate"))"
    }

    private var header: some View {
        VStack(spacing: 5) {
            HStack(alignment: .center, spacing: 10) {
                Button {
                    if settings.usesLegacyConnection { isShowingSettings = true }
                    else { account.isReviewing = false }
                } label: {
                    Image("MediEvalLogo")
                        .resizable()
                        .interpolation(.none)
                        .scaledToFit()
                        .frame(width: 172, height: 62, alignment: .leading)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(settings.usesLegacyConnection ? "Settings" : "My Batches")
                .disabled(isSubmitting || isSyncingCouriers || isLoading)
                .layoutPriority(1)

                Spacer(minLength: 6)

                Button {
                    isShowingGuildHall = true
                } label: {
                    HeaderMascotButton(
                        message: mascotMessage,
                        isShowingMessage: isShowingMascotTip
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Guild Hall")
            }

            GuildHUD(
                pending: summary?.pendingCards ?? cards.count,
                reviewed: reviewedTotal,
                reviewer: settings.reviewerDisplayName,
                progress: progress
            )
            Button("Training Grounds & Consistency") { isShowingTraining = true }
                .font(.subheadline.bold()).foregroundStyle(MediEvalTheme.parchmentLight)
                .disabled(isSubmitting || isLoading || isSyncingCouriers)
            if !settings.usesLegacyConnection {
                Menu {
                    ForEach(account.batches) { batch in
                        Button("\(batch.name) - \(batch.projectName)") { account.connect(batch, settings: settings) }
                    }
                    Button("All Batches") { account.isReviewing = false }
                } label: {
                    Label(account.selectedBatch?.name ?? "My Batches", systemImage: "chevron.up.chevron.down")
                        .font(.subheadline.bold()).foregroundStyle(MediEvalTheme.parchmentLight)
                        .lineLimit(1).frame(maxWidth: .infinity)
                }.disabled(isSubmitting || isLoading || isSyncingCouriers)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 2)
        .padding(.bottom, 5)
        .background {
            Color.black.opacity(0.18)
            .ignoresSafeArea(edges: .top)
        }
    }

    private func queueInitialMascotTipIfNeeded() {
        guard !hasQueuedInitialMascotTip else { return }
        hasQueuedInitialMascotTip = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            showMascotTip("Welcome back, my liege.", duration: 3.8)
        }
    }

    private func showNextMascotTip() {
        mascotTipIndex = (mascotTipIndex + 1) % Self.mascotTips.count
        showMascotTip(Self.mascotTips[mascotTipIndex])
    }

    private func showMascotTip(_ message: String, duration: TimeInterval = 3.6) {
        mascotTipDismissWorkItem?.cancel()
        mascotMessage = message
        withAnimation(.spring(response: 0.28, dampingFraction: 0.78)) {
            isShowingMascotTip = true
        }

        let dismissWorkItem = DispatchWorkItem {
            withAnimation(.easeInOut(duration: 0.22)) {
                isShowingMascotTip = false
            }
        }
        mascotTipDismissWorkItem = dismissWorkItem
        DispatchQueue.main.asyncAfter(deadline: .now() + duration, execute: dismissWorkItem)
    }
}

struct HeaderMascotButton: View {
    let message: String
    let isShowingMessage: Bool
    @State private var isWalking = false
    @State private var isReturning = false
    @State private var walkFrameIndex = 0
    @State private var walkOffset: CGFloat = 0
    @State private var hasQueuedInitialWalk = false

    private let walkFrames = [
        "MediEvalSirWrongalotWalk1",
        "MediEvalSirWrongalotWalk2",
        "MediEvalSirWrongalotWalk3",
        "MediEvalSirWrongalotWalk4",
        "MediEvalSirWrongalotWalk5",
        "MediEvalSirWrongalotWalk6"
    ]
    private let frameTimer = Timer.publish(every: 0.14, on: .main, in: .common).autoconnect()
    private let walkTimer = Timer.publish(every: 90, on: .main, in: .common).autoconnect()

    private var mascotImageName: String {
        isWalking ? walkFrames[walkFrameIndex % walkFrames.count] : "MediEvalSirWrongalot"
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            if isShowingMessage {
                Text(message)
                    .font(.custom("Menlo-Bold", size: 8))
                    .foregroundStyle(MediEvalTheme.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.72)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .frame(width: 102)
                    .frame(minHeight: 32)
                    .background {
                        PixelSpeechBubbleBackground()
                            .fill(MediEvalTheme.parchmentLight)
                            .overlay {
                                PixelSpeechBubbleBackground()
                                    .stroke(MediEvalTheme.gold.opacity(0.76), lineWidth: 1.5)
                            }
                            .shadow(color: .black.opacity(0.3), radius: 0, x: 0, y: 2)
                    }
                    .offset(x: -24, y: -25)
                    .transition(.scale(scale: 0.88, anchor: .bottomTrailing).combined(with: .opacity))
            }

            Image(mascotImageName)
                .resizable()
                .interpolation(.none)
                .scaledToFit()
                .frame(width: 52, height: 52)
                .scaleEffect(x: isWalking && isReturning ? -1 : 1, y: 1, anchor: .center)
                .offset(x: walkOffset)
                .accessibilityHidden(true)
        }
        .frame(width: 122, height: 66, alignment: .bottomTrailing)
        .onReceive(frameTimer) { _ in
            guard isWalking else { return }
            walkFrameIndex = (walkFrameIndex + 1) % walkFrames.count
        }
        .onReceive(walkTimer) { _ in
            startWalkCycle()
        }
        .onAppear {
            queueInitialWalkIfNeeded()
        }
    }

    private func queueInitialWalkIfNeeded() {
        guard !hasQueuedInitialWalk else { return }
        hasQueuedInitialWalk = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 6.5) {
            startWalkCycle()
        }
    }

    private func startWalkCycle() {
        guard !isWalking else { return }
        walkFrameIndex = 0
        isReturning = false
        isWalking = true

        withAnimation(.linear(duration: 2.4)) {
            walkOffset = -58
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) {
            isReturning = true
            withAnimation(.linear(duration: 2.4)) {
                walkOffset = 0
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 4.9) {
            isWalking = false
            isReturning = false
            walkFrameIndex = 0
            walkOffset = 0
        }
    }
}

struct GuildHUD: View {
    let pending: Int
    let reviewed: Int
    let reviewer: String
    @ObservedObject var progress: GameProgressStore

    var body: some View {
        ZStack {
            Image("MediEvalSummaryHUD")
                .resizable()
                .interpolation(.none)
                .scaledToFit()

            HStack(spacing: 0) {
                HUDValue(value: "\(pending)", label: "Quests")
                HUDValue(value: "\(reviewed)", label: "Judged")
                HUDValue(value: "\(progress.gold)", label: "Gold")
                HUDValue(value: "\(progress.streak)", label: "Streak")
            }
            .padding(.horizontal, 11)
            .offset(y: 1)
        }
        .frame(height: 58)
    }
}

struct HUDValue: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(value)
                .font(.custom("Menlo-Bold", size: 14))
                .foregroundStyle(MediEvalTheme.parchmentLight)
                .lineLimit(1)
                .minimumScaleFactor(0.58)
            Text(label)
                .font(.custom("Menlo-Bold", size: 8))
                .foregroundStyle(MediEvalTheme.parchmentLight.opacity(0.78))
                .lineLimit(1)
                .minimumScaleFactor(0.52)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, 38)
        .padding(.trailing, 4)
    }
}

struct SpriteIconControl: View {
    let systemName: String
    let tint: Color

    var body: some View {
        ZStack {
            Image("MediEvalParchmentCard")
                .resizable(resizingMode: .stretch)
                .interpolation(.none)
            Image(systemName: systemName)
                .font(.headline.weight(.black))
                .foregroundStyle(tint)
                .shadow(color: .white.opacity(0.35), radius: 0, x: 0, y: 1)
        }
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
    }
}

struct SpritePlateText: View {
    let title: String
    let width: CGFloat
    let height: CGFloat

    init(_ title: String, width: CGFloat, height: CGFloat) {
        self.title = title
        self.width = width
        self.height = height
    }

    var body: some View {
        ZStack {
            Image("MediEvalStonePlate")
                .resizable(resizingMode: .stretch)
                .interpolation(.none)
            Text(title)
                .font(.caption.weight(.black))
                .fontDesign(.monospaced)
                .foregroundStyle(MediEvalTheme.parchmentLight)
                .lineLimit(1)
                .minimumScaleFactor(0.58)
                .padding(.horizontal, 12)
                .shadow(color: .black.opacity(0.7), radius: 0, x: 1, y: 1)
        }
        .frame(width: width, height: height)
        .accessibilityLabel(title)
    }
}

struct SpriteBannerText: View {
    let title: String
    let width: CGFloat
    let height: CGFloat

    init(_ title: String, width: CGFloat, height: CGFloat) {
        self.title = title
        self.width = width
        self.height = height
    }

    var body: some View {
        ZStack {
            Image("MediEvalSmallBanner")
                .resizable(resizingMode: .stretch)
                .interpolation(.none)
            Text(title)
                .font(.caption.weight(.black))
                .fontDesign(.monospaced)
                .foregroundStyle(MediEvalTheme.parchmentLight)
                .lineLimit(1)
                .minimumScaleFactor(0.68)
                .padding(.horizontal, 17)
                .shadow(color: .black.opacity(0.55), radius: 0, x: 1, y: 1)
                .offset(y: -1.5)
        }
        .frame(width: width, height: height)
        .accessibilityLabel(title)
    }
}

struct ErrorBanner: View {
    let message: String

    var body: some View {
        Label(message, systemImage: "exclamationmark.triangle.fill")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(MediEvalTheme.ember)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(MediEvalTheme.parchmentLight)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(MediEvalTheme.ember.opacity(0.4), lineWidth: 2))
    }
}

struct LoadingQuestView: View {
    var body: some View {
        SirWrongalotDialogueScene(
            title: "Summoning quests...",
            message: "Checking the guild board for fresh evals.",
            knightAsset: "MediEvalSirWrongalot",
            isLoading: true
        )
    }
}

struct SirWrongalotDialogueScene: View {
    let title: String
    let message: String
    var knightAsset = "MediEvalSirWrongalot"
    var isLoading = false
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 16) {
            Spacer(minLength: 18)

            ZStack(alignment: .bottomLeading) {
                SirWrongalotSpeechBubble(
                    title: title,
                    message: message,
                    isLoading: isLoading,
                    actionTitle: actionTitle,
                    action: action
                )
                .padding(.leading, 56)
                .padding(.bottom, 48)

                Image(knightAsset)
                    .resizable()
                    .interpolation(.none)
                    .scaledToFit()
                    .frame(width: 84, height: 84)
                    .offset(x: 5, y: 5)
                    .accessibilityHidden(true)
            }
            .frame(maxWidth: 360)
            .padding(.horizontal, 16)

            Spacer(minLength: 78)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct SirWrongalotSpeechBubble: View {
    let title: String
    let message: String
    var isLoading = false
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(title)
                    .font(.custom("Menlo-Bold", size: 15))
                    .foregroundStyle(MediEvalTheme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.76)

                if isLoading {
                    ProgressView()
                        .tint(MediEvalTheme.royal)
                        .scaleEffect(0.82)
                }
            }

            Text(message)
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .foregroundStyle(MediEvalTheme.mutedInk)
                .fixedSize(horizontal: false, vertical: true)

            if let actionTitle, let action {
                Button(action: action) {
                    ZStack {
                        Image("MediEvalSmallBanner")
                            .resizable(resizingMode: .stretch)
                            .interpolation(.none)
                        Text(actionTitle)
                            .font(.custom("Menlo-Bold", size: 12))
                            .foregroundStyle(MediEvalTheme.parchmentLight)
                            .lineLimit(1)
                            .minimumScaleFactor(0.76)
                            .shadow(color: .black.opacity(0.55), radius: 0, x: 1, y: 1)
                    }
                    .frame(height: 38)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
            }
        }
        .padding(.horizontal, 15)
        .padding(.vertical, 13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            ZStack(alignment: .bottomLeading) {
                PixelSpeechBubbleBackground()
                    .fill(MediEvalTheme.parchmentLight)
                    .shadow(color: .black.opacity(0.30), radius: 0, x: 0, y: 4)
                    .overlay {
                        PixelSpeechBubbleBackground()
                            .stroke(MediEvalTheme.gold.opacity(0.66), lineWidth: 2)
                    }
                    .overlay {
                        PixelSpeechBubbleBackground()
                            .stroke(MediEvalTheme.ink.opacity(0.18), lineWidth: 1)
                            .offset(y: 2)
                    }

                SpeechTail()
                    .fill(MediEvalTheme.parchmentLight)
                    .frame(width: 22, height: 15)
                    .overlay {
                        SpeechTail()
                            .stroke(MediEvalTheme.gold.opacity(0.66), lineWidth: 2)
                    }
                    .offset(x: -12, y: -15)
            }
        }
    }
}

struct PixelSpeechBubbleBackground: Shape {
    func path(in rect: CGRect) -> Path {
        let notch: CGFloat = 5
        let x0 = rect.minX
        let x1 = rect.maxX
        let y0 = rect.minY
        let y1 = rect.maxY

        var path = Path()
        path.move(to: CGPoint(x: x0 + notch, y: y0))
        path.addLine(to: CGPoint(x: x1 - notch, y: y0))
        path.addLine(to: CGPoint(x: x1 - notch, y: y0 + notch))
        path.addLine(to: CGPoint(x: x1, y: y0 + notch))
        path.addLine(to: CGPoint(x: x1, y: y1 - notch))
        path.addLine(to: CGPoint(x: x1 - notch, y: y1 - notch))
        path.addLine(to: CGPoint(x: x1 - notch, y: y1))
        path.addLine(to: CGPoint(x: x0 + notch, y: y1))
        path.addLine(to: CGPoint(x: x0 + notch, y: y1 - notch))
        path.addLine(to: CGPoint(x: x0, y: y1 - notch))
        path.addLine(to: CGPoint(x: x0, y: y0 + notch))
        path.addLine(to: CGPoint(x: x0 + notch, y: y0 + notch))
        path.closeSubpath()
        return path
    }
}

struct PixelParchmentPanelBackground: Shape {
    var notch: CGFloat = 8

    func path(in rect: CGRect) -> Path {
        let step = min(notch, min(rect.width, rect.height) * 0.12)
        let x0 = rect.minX
        let x1 = rect.maxX
        let y0 = rect.minY
        let y1 = rect.maxY

        var path = Path()
        path.move(to: CGPoint(x: x0 + step, y: y0))
        path.addLine(to: CGPoint(x: x1 - step, y: y0))
        path.addLine(to: CGPoint(x: x1 - step, y: y0 + step))
        path.addLine(to: CGPoint(x: x1, y: y0 + step))
        path.addLine(to: CGPoint(x: x1, y: y1 - step))
        path.addLine(to: CGPoint(x: x1 - step, y: y1 - step))
        path.addLine(to: CGPoint(x: x1 - step, y: y1))
        path.addLine(to: CGPoint(x: x0 + step, y: y1))
        path.addLine(to: CGPoint(x: x0 + step, y: y1 - step))
        path.addLine(to: CGPoint(x: x0, y: y1 - step))
        path.addLine(to: CGPoint(x: x0, y: y0 + step))
        path.addLine(to: CGPoint(x: x0 + step, y: y0 + step))
        path.closeSubpath()
        return path
    }
}

struct SpeechTail: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY * 0.82))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.closeSubpath()
        return path
    }
}

struct SwipeableQuestCard: View {
    let card: EvalCard
    let isSubmitting: Bool
    let onAnswer: (EvalAnswer) -> Void

    @State private var dragOffset: CGSize = .zero

    private let horizontalThreshold: CGFloat = 132
    private let swipeActivationHeight: CGFloat = 150

    var body: some View {
        EvalCardView(card: card, isSubmitting: isSubmitting, onAnswer: onAnswer)
            .offset(visualOffset)
            .rotationEffect(.degrees(Double(visualOffset.width / 28)))
            .overlay(alignment: .top) {
                if let previewAnswer {
                    SwipeVerdictBadge(answer: previewAnswer)
                        .padding(.top, 18)
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .animation(.spring(response: 0.28, dampingFraction: 0.78), value: visualOffset)
            .animation(.easeInOut(duration: 0.12), value: previewAnswer?.rawValue)
            .simultaneousGesture(
                DragGesture(minimumDistance: 22)
                    .onChanged { value in
                        guard !isSubmitting else { return }
                        guard canStartSwipe(at: value.startLocation) else {
                            dragOffset = .zero
                            return
                        }
                        dragOffset = value.translation
                    }
                    .onEnded { value in
                        guard !isSubmitting else {
                            dragOffset = .zero
                            return
                        }
                        guard canStartSwipe(at: value.startLocation) else {
                            dragOffset = .zero
                            return
                        }
                        if let selectedAnswer = answer(for: value.translation) {
                            animateDismiss(for: selectedAnswer)
                        } else {
                            dragOffset = .zero
                        }
                    }
            )
    }

    private var previewAnswer: EvalAnswer? {
        answer(for: dragOffset, preview: true)
    }

    private var visualOffset: CGSize {
        if isHorizontalVerdictDrag(dragOffset) {
            return CGSize(width: dragOffset.width, height: dragOffset.height * 0.12)
        }
        return .zero
    }

    private func answer(for translation: CGSize, preview: Bool = false) -> EvalAnswer? {
        let horizontalGate = preview ? horizontalThreshold * 0.48 : horizontalThreshold

        if translation.width > horizontalGate && isHorizontalVerdictDrag(translation) {
            return .yes
        }
        if translation.width < -horizontalGate && isHorizontalVerdictDrag(translation) {
            return .no
        }
        return nil
    }

    private func canStartSwipe(at location: CGPoint) -> Bool {
        location.y <= swipeActivationHeight
    }

    private func isHorizontalVerdictDrag(_ translation: CGSize) -> Bool {
        abs(translation.width) > abs(translation.height) * 1.7
    }

    private func animateDismiss(for selectedAnswer: EvalAnswer) {
        let target: CGSize
        switch selectedAnswer {
        case .yes:
            target = CGSize(width: 420, height: -24)
        case .no:
            target = CGSize(width: -420, height: -24)
        default:
            target = .zero
        }

        withAnimation(.spring(response: 0.24, dampingFraction: 0.78)) {
            dragOffset = target
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.16) {
            onAnswer(selectedAnswer)
            dragOffset = .zero
        }
    }
}

struct SwipeVerdictBadge: View {
    let answer: EvalAnswer

    var body: some View {
        Label(answer.title, systemImage: answer.symbolName)
            .font(.title3.weight(.black))
            .fontDesign(.rounded)
            .foregroundStyle(.white)
            .padding(.horizontal, 18)
            .padding(.vertical, 10)
            .background(answer.tint)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(MediEvalTheme.stoneDark.opacity(0.32), lineWidth: 2))
            .shadow(color: answer.tint.opacity(0.28), radius: 12, x: 0, y: 8)
            .accessibilityHidden(true)
    }
}

struct EvalCardView: View {
    let card: EvalCard
    let isSubmitting: Bool
    let onAnswer: (EvalAnswer) -> Void

    @State private var selectedImageIndex = 0
    @State private var isShowingImageViewer = false

    private let questCardAspectRatio: CGFloat = 990.0 / 1328.0

    var body: some View {
        VStack(spacing: 0) {
            SpriteBannerText(questRank.uppercased(), width: 184, height: 36)
                .offset(y: 17)
                .zIndex(1)

            GeometryReader { proxy in
                ZStack {
                    Image("MediEvalQuestCardPanel")
                        .resizable()
                        .interpolation(.none)
                        .scaledToFit()
                        .frame(width: proxy.size.width, height: proxy.size.height)
                        .shadow(color: .black.opacity(0.34), radius: 0, x: 0, y: 4)

                    VStack(spacing: 5) {
                        VStack(spacing: 2) {
                            Text("Judge This Eval")
                                .font(.custom("Copperplate-Bold", size: 22))
                                .foregroundStyle(MediEvalTheme.ink)
                            HStack(spacing: 5) {
                                Text(priorityLabel)
                                    .foregroundStyle(priorityColor)
                                Text("•")
                                    .foregroundStyle(MediEvalTheme.mutedInk)
                                Text(confidenceLabel)
                                    .foregroundStyle(MediEvalTheme.mutedInk)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.62)
                            }
                            .font(.system(size: 9, weight: .black, design: .rounded))
                            .textCase(.uppercase)
                        }

                        claimBox
                        imageCarousel
                        subjectBlock
                        answerRow
                    }
                    .padding(.horizontal, 22)
                    .padding(.top, 34)
                    .padding(.bottom, 28)
                    .frame(width: proxy.size.width, height: proxy.size.height)

                    moreMenu
                        .padding(.top, 32)
                        .padding(.trailing, 16)
                        .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topTrailing)
                }
            }
            .aspectRatio(questCardAspectRatio, contentMode: .fit)
        }
        .frame(maxWidth: 364)
        .onAppear {
            clampSelectedImageIndex()
        }
        .onChange(of: card.cardId) { _, _ in
            selectedImageIndex = 0
        }
        .onChange(of: card.images.count) { _, _ in
            clampSelectedImageIndex()
        }
        .mediEvalImageViewerPresentation(isPresented: $isShowingImageViewer) {
            MediEvalImageViewer(
                images: card.images,
                selectedIndex: $selectedImageIndex,
                isPresented: $isShowingImageViewer
            )
        }
    }

    private var priorityColor: Color {
        switch card.priority {
        case "high": return MediEvalTheme.danger
        case "low": return MediEvalTheme.stone
        default: return MediEvalTheme.ember
        }
    }

    private var questRank: String {
        switch card.priority {
        case "high": return "Boss quest"
        case "low": return "Scout quest"
        default: return "Knight quest"
        }
    }

    private var confidenceLabel: String {
        guard let confidence = card.confidence else { return "Needs review" }
        return "\(Int((confidence * 100).rounded()))% confidence"
    }

    private var priorityLabel: String {
        switch card.priority {
        case "high": return "High priority"
        case "low": return "Low priority"
        default: return "Priority"
        }
    }

    private var claimBox: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(card.claimDisplayLabel)
                .font(.custom("Menlo-Bold", size: 8))
                .foregroundStyle(MediEvalTheme.mutedInk)
            Text(card.claim.value)
                .font(.system(size: 15, weight: .black, design: .rounded))
                .foregroundStyle(MediEvalTheme.ink)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.55)
                .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 6)
        .frame(minHeight: 58)
        .background(MediEvalTheme.parchmentLight.opacity(0.58))
        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .stroke(MediEvalTheme.gold.opacity(0.48), lineWidth: 2)
        }
        .padding(.horizontal, 10)
    }

    private var simpleSlotShape: RoundedRectangle {
        RoundedRectangle(cornerRadius: 4, style: .continuous)
    }

    private var simpleSlotStroke: some View {
        simpleSlotShape
            .stroke(MediEvalTheme.gold.opacity(0.5), lineWidth: 2)
    }

    private var simpleSlotShadow: some View {
        simpleSlotShape
            .stroke(.black.opacity(0.16), lineWidth: 1)
            .offset(y: 2)
    }

    private var imageSlotBackground: some View {
        ZStack {
            Color(red: 0.36, green: 0.20, blue: 0.10)
            Image("MediEvalWoodPlanks")
                .resizable()
                .interpolation(.none)
                .scaledToFill()
                .opacity(0.92)
            LinearGradient(
                colors: [.white.opacity(0.08), .clear, .black.opacity(0.18)],
                startPoint: .top,
                endPoint: .bottom
            )
        }
    }

    private var imageSlotOverlay: some View {
        ZStack {
            simpleSlotStroke
            simpleSlotShadow
        }
    }

    private var imageCarousel: some View {
        ZStack {
            ZStack {
                imageSlotBackground
                if card.images.isEmpty {
                    ContentUnavailableView("No Images", systemImage: "photo")
                        .foregroundStyle(MediEvalTheme.mutedInk)
                } else if card.images.count == 1 {
                    listingImage(card.images[0], index: 0)
                } else {
                    TabView(selection: $selectedImageIndex) {
                        ForEach(Array(card.images.enumerated()), id: \.element.id) { index, image in
                            listingImage(image, index: index)
                                .tag(index)
                        }
                    }
                    .mediEvalHiddenPageTabViewStyle()
                }
            }
            .frame(maxWidth: .infinity, minHeight: 166, maxHeight: 166)
            .contentShape(Rectangle())
            .clipShape(simpleSlotShape)
            .overlay {
                imageSlotOverlay
                    .allowsHitTesting(false)
            }
            .simultaneousGesture(imagePagingGesture)
            .onTapGesture {
                openImageViewer()
            }

            if card.images.count > 1 {
                imagePagerControls
                    .allowsHitTesting(!isSubmitting)
            }

            Button {
                openImageViewer()
            } label: {
                Image("MediEvalZoomGlyph")
                    .resizable()
                    .interpolation(.none)
                    .scaledToFit()
                    .frame(width: 34, height: 34)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(card.images.isEmpty)
            .opacity(card.images.isEmpty ? 0.45 : 1)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
            .padding(.trailing, 12)
            .padding(.bottom, 10)
        }
        .padding(.horizontal, 10)
    }

    private var safeSelectedImageIndex: Int {
        guard !card.images.isEmpty else { return 0 }
        return min(max(selectedImageIndex, 0), card.images.count - 1)
    }

    private var imagePagingGesture: some Gesture {
        DragGesture(minimumDistance: 18)
            .onEnded { value in
                guard card.images.count > 1 else { return }
                guard abs(value.translation.width) > abs(value.translation.height) * 1.4 else { return }
                guard abs(value.translation.width) > 34 else { return }
                moveSelectedImage(by: value.translation.width < 0 ? 1 : -1)
            }
    }

    private var imagePagerControls: some View {
        ZStack {
            HStack {
                imagePagerButton(title: "<", delta: -1)
                Spacer()
                imagePagerButton(title: ">", delta: 1)
            }
            .padding(.horizontal, 9)

            Text("\(safeSelectedImageIndex + 1)/\(card.images.count)")
                .font(.custom("Menlo-Bold", size: 9))
                .foregroundStyle(MediEvalTheme.parchmentLight)
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background(Color.black.opacity(0.54))
                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(MediEvalTheme.gold.opacity(0.62), lineWidth: 1))
                .frame(maxHeight: .infinity, alignment: .bottom)
                .padding(.bottom, 12)
        }
    }

    private func imagePagerButton(title: String, delta: Int) -> some View {
        Button {
            moveSelectedImage(by: delta)
        } label: {
            Text(title)
                .font(.custom("Menlo-Bold", size: 18))
                .foregroundStyle(MediEvalTheme.parchmentLight)
                .frame(width: 28, height: 34)
                .background(Color.black.opacity(0.50))
                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(MediEvalTheme.gold.opacity(0.68), lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .disabled(isSubmitting)
    }

    private func listingImage(_ image: EvalImage, index: Int) -> some View {
        Group {
            if let url = URL(string: image.url) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .empty:
                        ProgressView()
                            .tint(MediEvalTheme.gold)
                    case .success(let loadedImage):
                        loadedImage
                            .resizable()
                            .scaledToFit()
                    case .failure:
                        ContentUnavailableView("Image Error", systemImage: "photo.badge.exclamationmark")
                            .foregroundStyle(MediEvalTheme.ember)
                    @unknown default:
                        EmptyView()
                    }
                }
            } else {
                ContentUnavailableView("Image Error", systemImage: "photo.badge.exclamationmark")
                    .foregroundStyle(MediEvalTheme.ember)
            }
        }
        .padding(10)
        .accessibilityLabel("Review image \(index + 1) of \(card.images.count)")
    }

    private func moveSelectedImage(by delta: Int) {
        guard card.images.count > 1 else { return }
        let count = card.images.count
        withAnimation(.easeInOut(duration: 0.16)) {
            selectedImageIndex = (safeSelectedImageIndex + delta + count) % count
        }
    }

    private func clampSelectedImageIndex() {
        selectedImageIndex = safeSelectedImageIndex
    }

    private func openImageViewer() {
        guard !card.images.isEmpty else { return }
        clampSelectedImageIndex()
        isShowingImageViewer = true
    }

    private var subjectBlock: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(card.subjectDisplayTitle)
                .font(.custom("Menlo-Bold", size: 10))
                .foregroundStyle(MediEvalTheme.ink)
                .lineLimit(2)
                .minimumScaleFactor(0.72)
            if let subtitle = card.subjectDisplaySubtitle {
                Text(subtitle)
                    .font(.custom("Menlo-Regular", size: 8))
                    .foregroundStyle(MediEvalTheme.mutedInk)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
            }
        }
        .padding(.horizontal, 12)
        .padding(.trailing, 26)
        .overlay(alignment: .trailing) {
            if let urlString = card.subjectURLString, let url = URL(string: urlString) {
                Link(destination: url) {
                    Image("MediEvalOpenGlyph")
                        .resizable()
                        .interpolation(.none)
                        .scaledToFit()
                        .frame(width: 24, height: 24)
                }
                .accessibilityLabel("Open eval subject")
            }
        }
    }

    private var answerRow: some View {
        HStack(alignment: .bottom, spacing: 24) {
            answerButton(.no)
            answerButton(.unsure)
            answerButton(.yes)
        }
        .padding(.horizontal, 14)
        .padding(.top, 7)
    }

    private func answerButton(_ answer: EvalAnswer) -> some View {
        Button {
            onAnswer(answer)
        } label: {
            VStack(spacing: 2) {
                Image(answerSpriteAssetName(answer))
                    .resizable()
                    .interpolation(.none)
                    .scaledToFit()
                    .frame(width: 64, height: 64)
                    .shadow(color: .black.opacity(0.34), radius: 0, x: 0, y: 3)
                Text(answer.title)
                    .font(.custom("Menlo-Bold", size: 11))
                    .foregroundStyle(MediEvalTheme.ink)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isSubmitting)
        .opacity(isSubmitting ? 0.55 : 1)
    }

    private var moreMenu: some View {
        Menu {
            Button {
                onAnswer(.badQuestion)
            } label: {
                Label(EvalAnswer.badQuestion.title, systemImage: EvalAnswer.badQuestion.symbolName)
            }
            Button {
                onAnswer(.skip)
            } label: {
                Label(EvalAnswer.skip.title, systemImage: EvalAnswer.skip.symbolName)
            }
        } label: {
            VStack(spacing: 2) {
                Image("MediEvalTabChest")
                    .resizable()
                    .interpolation(.none)
                    .scaledToFit()
                    .frame(width: 30, height: 30)
                    .shadow(color: .black.opacity(0.3), radius: 0, x: 0, y: 2)
            }
            .frame(width: 34, height: 34)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isSubmitting)
    }

    private func answerSpriteAssetName(_ answer: EvalAnswer) -> String {
        switch answer {
        case .yes: return "MediEvalShieldAye"
        case .no: return "MediEvalShieldNay"
        case .unsure: return "MediEvalShieldHmm"
        default: return "MediEvalShieldHmm"
        }
    }

    private var evidenceBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Evidence Chest", systemImage: "shippingbox.fill")
                .font(.headline.weight(.black))
                .foregroundStyle(MediEvalTheme.ink)
            ForEach(card.evidence.prefix(3)) { item in
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.source.isEmpty ? "evidence" : item.source)
                        .font(.caption.weight(.black))
                        .fontDesign(.monospaced)
                        .foregroundStyle(MediEvalTheme.royal)
                    Text(item.detail)
                        .font(.footnote)
                        .foregroundStyle(MediEvalTheme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(MediEvalTheme.parchmentLight.opacity(0.78))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }
        .themedPanel()
    }

    private var detailsBlock: some View {
        DisclosureGroup {
            VStack(alignment: .leading, spacing: 10) {
                if !card.analysisContext.summary.isEmpty {
                    Text(card.analysisContext.summary)
                        .font(.callout)
                        .foregroundStyle(MediEvalTheme.mutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
                ForEach(card.analysisContext.warnings.prefix(3), id: \.self) { warning in
                    Label(warning, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(MediEvalTheme.ember)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.top, 8)
        } label: {
            Text("Sage Notes")
                .font(.headline.weight(.black))
                .foregroundStyle(MediEvalTheme.ink)
        }
        .themedPanel()
    }
}

struct MediEvalImageViewer: View {
    let images: [EvalImage]
    @Binding var selectedIndex: Int
    @Binding var isPresented: Bool

    private var safeSelectedIndex: Int {
        guard !images.isEmpty else { return 0 }
        return min(max(selectedIndex, 0), images.count - 1)
    }

    var body: some View {
        ZStack {
            MediEvalBackground()
                .ignoresSafeArea()
            Color.black.opacity(0.42)
                .ignoresSafeArea()

            if images.isEmpty {
                ContentUnavailableView("No Images", systemImage: "photo")
                    .foregroundStyle(MediEvalTheme.parchmentLight)
            } else {
                TabView(selection: $selectedIndex) {
                    ForEach(Array(images.enumerated()), id: \.element.id) { index, image in
                        zoomedImage(image, index: index)
                            .tag(index)
                    }
                }
                .mediEvalHiddenPageTabViewStyle()
                .ignoresSafeArea()
            }

            VStack(spacing: 0) {
                viewerHeader
                Spacer()
                if images.count > 1 {
                    viewerFooter
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 10)
            .padding(.bottom, 18)
        }
        .onAppear {
            clampSelectedIndex()
        }
        .onChange(of: images.count) { _, _ in
            clampSelectedIndex()
        }
        .onChange(of: selectedIndex) { _, _ in
            clampSelectedIndex()
        }
    }

    private var viewerHeader: some View {
        HStack {
            SpriteBannerText(images.count > 1 ? "IMAGE \(safeSelectedIndex + 1) / \(images.count)" : "IMAGE", width: 184, height: 36)
            Spacer()
            Button {
                isPresented = false
            } label: {
                Text("X")
                    .font(.custom("Menlo-Bold", size: 18))
                    .foregroundStyle(MediEvalTheme.parchmentLight)
                    .frame(width: 42, height: 42)
                    .background(Color.black.opacity(0.58))
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(MediEvalTheme.gold.opacity(0.72), lineWidth: 2))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close image viewer")
        }
    }

    private var viewerFooter: some View {
        HStack(spacing: 16) {
            viewerStepButton(title: "<", delta: -1)
            Spacer()
            Text("\(safeSelectedIndex + 1)/\(images.count)")
                .font(.custom("Menlo-Bold", size: 12))
                .foregroundStyle(MediEvalTheme.parchmentLight)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color.black.opacity(0.56))
                .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 5).stroke(MediEvalTheme.gold.opacity(0.62), lineWidth: 1.5))
            Spacer()
            viewerStepButton(title: ">", delta: 1)
        }
    }

    private func viewerStepButton(title: String, delta: Int) -> some View {
        Button {
            moveSelectedImage(by: delta)
        } label: {
            Text(title)
                .font(.custom("Menlo-Bold", size: 22))
                .foregroundStyle(MediEvalTheme.parchmentLight)
                .frame(width: 48, height: 46)
                .background(Color.black.opacity(0.56))
                .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 5).stroke(MediEvalTheme.gold.opacity(0.72), lineWidth: 2))
        }
        .buttonStyle(.plain)
    }

    private func zoomedImage(_ image: EvalImage, index: Int) -> some View {
        ZStack {
            Color.clear
            if let url = URL(string: image.url) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .empty:
                        ProgressView()
                            .tint(MediEvalTheme.gold)
                            .scaleEffect(1.25)
                    case .success(let loadedImage):
                        loadedImage
                            .resizable()
                            .scaledToFit()
                    case .failure:
                        ContentUnavailableView("Image Error", systemImage: "photo.badge.exclamationmark")
                            .foregroundStyle(MediEvalTheme.ember)
                    @unknown default:
                        EmptyView()
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 76)
            } else {
                ContentUnavailableView("Image Error", systemImage: "photo.badge.exclamationmark")
                    .foregroundStyle(MediEvalTheme.ember)
            }
        }
        .accessibilityLabel("Zoomed review image \(index + 1) of \(images.count)")
    }

    private func moveSelectedImage(by delta: Int) {
        guard images.count > 1 else { return }
        let count = images.count
        withAnimation(.easeInOut(duration: 0.16)) {
            selectedIndex = (safeSelectedIndex + delta + count) % count
        }
    }

    private func clampSelectedIndex() {
        selectedIndex = safeSelectedIndex
    }
}

struct CorrectionSheet: View {
    let card: EvalCard
    let submit: (EvalCorrection?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var correctAnswer = ""
    @State private var selectedTags = Set<String>()

    private let reasonTags = [
        "wrong_title",
        "wrong_item",
        "unsupported_by_image",
        "unsupported_by_description",
        "ambiguous",
        "bad_question"
    ]

    private let tagLabels = [
        "wrong_title": "Wrong title",
        "wrong_item": "Wrong item",
        "unsupported_by_image": "Not visible",
        "unsupported_by_description": "Not in text",
        "ambiguous": "Murky evidence",
        "bad_question": "Cursed question"
    ]

    private var orderedSelectedTags: [String] {
        reasonTags.filter { selectedTags.contains($0) }
    }

    private var trimmedCorrectAnswer: String {
        correctAnswer.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canSubmitCorrection: Bool {
        mediEvalCorrectionIsActionable(correctAnswer: trimmedCorrectAnswer, reasonTags: orderedSelectedTags)
    }

    var body: some View {
        ZStack {
            MediEvalBackground()
            VStack(spacing: 0) {
                CorrectionSheetHeader {
                    dismiss()
                }

                ScrollView {
                    CorrectionParchmentCard {
                        VStack(alignment: .leading, spacing: 14) {
                            CorrectionIntro(card: card)

                            VStack(alignment: .leading, spacing: 8) {
                                Text(card.correctionFieldLabel)
                                    .font(.custom("Menlo-Bold", size: 15))
                                    .foregroundStyle(MediEvalTheme.ink)
                                TextField(card.correctionFieldPlaceholder, text: $correctAnswer, axis: .vertical)
                                    .lineLimit(1...4)
                                    .font(.body.weight(.semibold))
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 11)
                                    .background(.white.opacity(0.9))
                                    .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                                    .overlay(RoundedRectangle(cornerRadius: 7).stroke(MediEvalTheme.ink.opacity(0.18), lineWidth: 1.4))
                            }

                            VStack(alignment: .leading, spacing: 10) {
                                Text("Why is the claim incorrect?")
                                    .font(.custom("Menlo-Bold", size: 15))
                                    .foregroundStyle(MediEvalTheme.ink)
                                LazyVGrid(columns: [GridItem(.flexible(), spacing: 9), GridItem(.flexible(), spacing: 9)], alignment: .leading, spacing: 9) {
                                    ForEach(reasonTags, id: \.self) { tag in
                                        Button {
                                            if selectedTags.contains(tag) {
                                                selectedTags.remove(tag)
                                            } else {
                                                selectedTags.insert(tag)
                                            }
                                        } label: {
                                            CorrectionReasonTag(
                                                title: tagLabels[tag] ?? tag.replacingOccurrences(of: "_", with: " "),
                                                isSelected: selectedTags.contains(tag)
                                            )
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }

                            CorrectionSubmitButton(isEnabled: canSubmitCorrection) {
                                guard canSubmitCorrection else { return }
                                submit(EvalCorrection(correctAnswer: trimmedCorrectAnswer, reasonTags: orderedSelectedTags))
                                dismiss()
                            }
                            .padding(.top, 2)
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.top, 6)
                    .padding(.bottom, 26)
                }
            }
        }
    }
}

struct CorrectionSheetHeader: View {
    let dismiss: () -> Void

    var body: some View {
        ZStack {
            HStack {
                Button(action: dismiss) {
                    Image(systemName: "arrow.left")
                        .font(.system(size: 17, weight: .black))
                        .foregroundStyle(MediEvalTheme.ink)
                        .frame(width: 42, height: 38)
                        .background {
                            ZStack {
                                PixelParchmentPanelBackground(notch: 5)
                                    .fill(MediEvalTheme.ink.opacity(0.36))
                                    .offset(y: 2)
                                PixelParchmentPanelBackground(notch: 5)
                                    .fill(MediEvalTheme.parchment)
                                PixelParchmentPanelBackground(notch: 5)
                                    .stroke(MediEvalTheme.gold.opacity(0.82), lineWidth: 2)
                            }
                        }
                }
                .buttonStyle(.plain)
                Spacer()
            }

            SpriteBannerText("SCRIBE THE TRUTH", width: 238, height: 44)
                .accessibilityLabel("Scribe the Truth")
        }
        .padding(.horizontal, 18)
        .padding(.top, 18)
        .padding(.bottom, 6)
    }
}

struct CorrectionParchmentCard<Content: View>: View {
    @ViewBuilder let content: Content

    private let parchmentAspectRatio: CGFloat = 764.0 / 1181.0

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                Image("MediEvalCorrectionParchment")
                    .resizable()
                    .interpolation(.none)
                    .scaledToFit()
                    .frame(width: proxy.size.width, height: proxy.size.height)
                    .shadow(color: .black.opacity(0.22), radius: 0, x: 0, y: 5)

                content
                    .padding(.top, 34)
                    .padding(.horizontal, 28)
                    .padding(.bottom, 26)
                    .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topLeading)
            }
        }
        .aspectRatio(parchmentAspectRatio, contentMode: .fit)
    }
}

struct CorrectionIntro: View {
    let card: EvalCard

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack(alignment: .top, spacing: 12) {
                Image("MediEvalDameConfidensPose")
                    .resizable()
                    .interpolation(.none)
                    .scaledToFit()
                    .frame(width: 68, height: 76)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 4) {
                    Text("You chose Nay.")
                        .font(.headline.weight(.black))
                        .foregroundStyle(MediEvalTheme.danger)
                    Text("Let's set the record straight.")
                        .font(.callout.weight(.semibold))
                        .foregroundStyle(MediEvalTheme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 8)
            }

            Rectangle()
                .fill(MediEvalTheme.ink.opacity(0.16))
                .frame(height: 1)
                .overlay(alignment: .trailing) {
                    Image("MediEvalQuill")
                        .resizable()
                        .interpolation(.none)
                        .scaledToFit()
                        .frame(width: 34, height: 58)
                        .offset(y: -6)
                        .accessibilityHidden(true)
                }

            VStack(alignment: .leading, spacing: 7) {
                Text(card.displayQuestion)
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(MediEvalTheme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(card.claim.value)
                    .font(.system(size: 20, weight: .black, design: .rounded))
                    .foregroundStyle(MediEvalTheme.royal)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(MediEvalTheme.parchmentLight.opacity(0.58))
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(MediEvalTheme.gold.opacity(0.5), lineWidth: 1.5))
        }
    }
}

struct CorrectionReasonTag: View {
    let title: String
    let isSelected: Bool

    var body: some View {
        Text(title)
            .font(.caption.weight(.black))
            .lineLimit(1)
            .minimumScaleFactor(0.66)
            .foregroundStyle(isSelected ? MediEvalTheme.danger : MediEvalTheme.ink)
            .frame(maxWidth: .infinity, minHeight: 42)
            .padding(.horizontal, 8)
            .background {
                ZStack {
                    PixelParchmentPanelBackground(notch: 5)
                        .fill(MediEvalTheme.ink.opacity(0.18))
                        .offset(y: 2)
                    PixelParchmentPanelBackground(notch: 5)
                        .fill(isSelected ? MediEvalTheme.danger.opacity(0.13) : MediEvalTheme.parchmentLight.opacity(0.92))
                    PixelParchmentPanelBackground(notch: 5)
                        .stroke(isSelected ? MediEvalTheme.danger.opacity(0.68) : MediEvalTheme.gold.opacity(0.42), lineWidth: 1.5)
                }
            }
            .contentShape(PixelParchmentPanelBackground(notch: 5))
    }
}

struct CorrectionSubmitButton: View {
    let isEnabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .leading) {
                MediEvalActionButtonLabel(
                    title: "Send to Guild",
                    systemImage: "seal.fill",
                    isEnabled: isEnabled,
                    height: 50,
                    fontSize: 15,
                    enabledFaceColor: MediEvalTheme.danger
                )

                Image("MediEvalWaxSeal")
                    .resizable()
                    .interpolation(.none)
                    .scaledToFit()
                    .frame(width: 56, height: 66)
                    .offset(x: -13, y: 10)
                    .opacity(isEnabled ? 1 : 0.5)
                    .accessibilityHidden(true)
            }
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
    }
}

struct AnswerBar: View {
    let isSubmitting: Bool
    let submit: (EvalAnswer) -> Void

    var body: some View {
        VStack(spacing: 8) {
            if isSubmitting {
                ProgressView()
                    .controlSize(.small)
                    .tint(MediEvalTheme.royal)
            }
            HStack(spacing: 8) {
                answerPill(.no, prominent: true)
                answerPill(.unsure)
                answerPill(.yes, prominent: true)
                moreMenu
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background {
            ZStack {
                MediEvalTheme.stoneDark
                Image("MediEvalStoneFloorTile")
                    .resizable(resizingMode: .tile)
                    .interpolation(.none)
                    .opacity(0.36)
                Rectangle()
                    .fill(.black.opacity(0.08))
            }
            .ignoresSafeArea(edges: .bottom)
        }
        .overlay(alignment: .top) {
            Rectangle()
                .fill(MediEvalTheme.gold.opacity(0.42))
                .frame(height: 2)
        }
    }

    @ViewBuilder
    private func answerPill(_ answer: EvalAnswer, prominent: Bool = false) -> some View {
        Button {
            submit(answer)
        } label: {
            VStack(spacing: 2) {
                if let spriteName = answerSpriteAssetName(answer) {
                    Image(spriteName)
                        .resizable()
                        .interpolation(.none)
                        .scaledToFit()
                        .frame(width: prominent ? 64 : 58, height: prominent ? 64 : 58)
                        .shadow(color: .black.opacity(0.28), radius: 0, x: 0, y: 2)
                } else {
                    Image(systemName: answer.symbolName)
                        .font(.title2.weight(.black))
                }
                Text(answer.title)
                    .font(.caption.weight(.black))
                    .fontDesign(.rounded)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .foregroundStyle(answer == .unsure ? MediEvalTheme.gold : MediEvalTheme.parchmentLight)
            .frame(maxWidth: .infinity, minHeight: 82)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isSubmitting)
        .opacity(isSubmitting ? 0.55 : 1)
    }

    private func answerLabel(_ answer: EvalAnswer, foreground: Color) -> some View {
        HStack(spacing: 6) {
            if let spriteName = answerSpriteAssetName(answer) {
                Image(spriteName)
                    .resizable()
                    .interpolation(.none)
                    .scaledToFit()
                    .frame(width: 32, height: 32)
                    .accessibilityHidden(true)
            } else {
                Image(systemName: answer.symbolName)
            }
            Text(answer.title)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
        }
        .font(.headline.weight(.black))
        .foregroundStyle(foreground)
        .padding(.horizontal, 8)
    }

    private func answerSpriteAssetName(_ answer: EvalAnswer) -> String? {
        switch answer {
        case .yes: return "MediEvalShieldAye"
        case .no: return "MediEvalShieldNay"
        case .unsure: return "MediEvalShieldHmm"
        default: return nil
        }
    }

    private var moreMenu: some View {
        Menu {
            Button {
                submit(.badQuestion)
            } label: {
                Label(EvalAnswer.badQuestion.title, systemImage: EvalAnswer.badQuestion.symbolName)
            }
            Button {
                submit(.skip)
            } label: {
                Label(EvalAnswer.skip.title, systemImage: EvalAnswer.skip.symbolName)
            }
        } label: {
            VStack(spacing: 2) {
                ZStack {
                    Image("MediEvalTabChest")
                        .resizable()
                        .interpolation(.none)
                        .scaledToFit()
                    Image(systemName: "ellipsis")
                        .font(.caption.weight(.black))
                        .foregroundStyle(MediEvalTheme.parchmentLight)
                        .offset(y: 6)
                }
                .frame(width: 58, height: 58)
                Text("More")
                    .font(.caption.weight(.black))
                    .fontDesign(.rounded)
                    .foregroundStyle(MediEvalTheme.parchmentLight)
            }
            .frame(width: 58, height: 82)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isSubmitting)
        .accessibilityLabel("More answers")
    }
}

struct QualityTrainingView: View {
    @EnvironmentObject private var settings: AppSettings
    @Environment(\.dismiss) private var dismiss
    @State private var snapshot: QualitySnapshot?
    @State private var card: EvalCard?
    @State private var kind = "practice"
    @State private var message = ""
    @State private var feedback = ""
    @State private var busy = false
    @State private var eventId = UUID().uuidString

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Training Grounds").font(.title.bold())
                    Text("Calibration is optional unless your batch owner requires qualification. Solo experts can review directly.")
                    if let snapshot {
                        Text("Mode: \(snapshot.settings.mode) · Calibration: \(snapshot.settings.calibration)")
                        Text("Rubric \(snapshot.settings.rubricVersion): \(snapshot.settings.rubric)")
                        Text(snapshot.qualificationRequired ? "Qualification required for this batch" : "Direct review available")
                        if snapshot.qualification.available > 0 || snapshot.qualification.attempted > 0 {
                            Text("Qualification: \(snapshot.qualification.status.replacingOccurrences(of: "_", with: " ")) · \(snapshot.qualification.attempted)/\(snapshot.qualification.required)")
                        }
                        if let accuracy = snapshot.qualification.accuracy {
                            Text("Reference agreement: \(Int(accuracy * 100))%")
                        }
                        Text("Reference checks: \(snapshot.checks.matched)/\(snapshot.checks.count) matched")
                        Text("Consistency: \(snapshot.consistency.matched)/\(snapshot.consistency.count) repeated judgments matched")
                        Text("Quality XP: \(snapshot.qualityXP) · earned from independent reference checks and qualification")
                        Text("Consistency measures repeatability, not independent correctness. XP measures participation.").font(.caption)
                    }
                    Picker("Quest type", selection: $kind) {
                        Text("Practice").tag("practice")
                        Text("Qualification").tag("qualification")
                        Text("Reference check").tag("check")
                        Text("Consistency").tag("consistency")
                    }.disabled(busy)
                    Button("Next quest") { Task { await nextQuest() } }.disabled(busy)
                    if !message.isEmpty { Text(message).foregroundStyle(.secondary) }
                    if !feedback.isEmpty { Text(feedback).padding().background(MediEvalTheme.parchmentLight) }
                    if let card {
                        Text("Rubric \(card.quality?.rubricVersion ?? ""): \(card.quality?.rubric ?? "")").font(.callout)
                        EvalCardView(card: card, isSubmitting: busy) { answer in
                            Task { await submit(answer) }
                        }.id(card.cardId)
                    }
                }.padding()
            }
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .task(id: settings.reviewScope) { await reload() }
            .onChange(of: kind) { _, _ in card = nil; feedback = ""; message = "" }
        }
    }

    @MainActor private func reload() async {
        card = nil
        guard let client = settings.client else { return }
        let scope = settings.reviewScope
        do {
            let latest = try await client.fetchQuality(reviewer: settings.reviewer)
            guard scope == settings.reviewScope else { return }
            snapshot = latest
        } catch EvalAPIError.badStatus(404, _) {
            message = "This backend does not offer Training Grounds. Connect to the eval API or run the web demo."
        } catch { message = mediEvalErrorMessage(error) }
    }

    @MainActor private func nextQuest() async {
        guard !busy, let client = settings.client else { return }
        busy = true
        defer { busy = false }
        let scope = settings.reviewScope
        do {
            let cards = try await client.fetchQualityCards(reviewer: settings.reviewer, kind: kind)
            guard scope == settings.reviewScope else { return }
            card = cards.first
            eventId = UUID().uuidString
            feedback = ""
            message = card == nil ? "No unseen quests available. Your batch owner can add reference examples. Consistency quests become available after regular reviews." : ""
        } catch { message = mediEvalErrorMessage(error) }
    }

    @MainActor private func submit(_ answer: EvalAnswer) async {
        guard !busy, let card, let client = settings.client else { return }
        busy = true
        defer { busy = false }
        let scope = settings.reviewScope
        let payload = EvalResultPayload(eventId: eventId, runId: settings.pinnedRunId,
            projectId: client.projectId, userId: settings.accountUserId, workspaceId: settings.accountWorkspaceId,
            serverURL: settings.accountUserId == nil ? nil : client.baseURL.absoluteString,
            cardId: card.cardId, reviewer: settings.reviewer, answer: answer, correction: nil,
            notes: "", durationMs: nil, clientGeneratedAt: ISO8601DateFormatter().string(from: Date()))
        do {
            let result = try await client.submitQualityResult(payload)
            guard scope == settings.reviewScope else { return }
            feedback = result.message + (result.verifiedQualityBonus > 0 ? " +\(result.verifiedQualityBonus) Quality XP." : "")
            self.card = nil
            let latest = try await client.fetchQuality(reviewer: settings.reviewer)
            guard scope == settings.reviewScope else { return }
            snapshot = latest
        } catch { message = mediEvalErrorMessage(error) }
    }
}

struct GuildHallView: View {
    let summary: EvalSummary?
    let submittedCount: Int
    let reviewer: String
    let outboxCount: Int
    let gameOutboxCount: Int
    @ObservedObject var progress: GameProgressStore
    let leaderboard: [GameLeaderboardEntry]
    let isSyncingCouriers: Bool
    let courierStatusMessage: String?
    let syncCouriers: () -> Void

    private var reviewed: Int { (summary?.reviewedCards ?? 0) + submittedCount }
    private var pending: Int { summary?.pendingCards ?? 0 }
    private var total: Int { summary?.totalCards ?? 0 }
    private var reviewerKey: String { reviewer.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
    private var sealedCouriers: Int { outboxCount + gameOutboxCount }

    var body: some View {
        NavigationStack {
            ZStack {
                MediEvalBackground()
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        HStack(spacing: 12) {
                            PixelKnightBadge(size: 52)
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Guild Hall")
                                    .font(.largeTitle.weight(.black))
                                    .fontDesign(.rounded)
                                Text(progress.syncedFromServer ? "Postgres guild ledger synced for \(reviewer)." : "Local guild ledger for \(reviewer).")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(MediEvalTheme.mutedInk)
                            }
                        }
                        .themedPanel()

                        VStack(alignment: .leading, spacing: 12) {
                            Text("Quest Ledger")
                                .font(.headline.weight(.black))
                            HStack(spacing: 8) {
                                GuildStat(title: "Pending", value: "\(pending)", icon: "scroll.fill", tint: MediEvalTheme.royal)
                                GuildStat(title: "Judged", value: "\(reviewed)", icon: "checkmark.seal.fill", tint: MediEvalTheme.forest)
                                GuildStat(title: "Gold", value: "\(progress.gold)", icon: "circle.hexagongrid.fill", tint: MediEvalTheme.gold)
                            }
                            ProgressView(value: progress.nextRankProgress)
                                .tint(MediEvalTheme.gold)
                            Text("\(progress.rankTitle) rank progress. \(total) quests on the board.")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(MediEvalTheme.mutedInk)
                        }
                        .themedPanel()

                        VStack(alignment: .leading, spacing: 10) {
                            Text("Daily Quests")
                                .font(.headline.weight(.black))
                            if let quests = progress.serverProfile?.dailyQuests, !quests.isEmpty {
                                ForEach(quests) { quest in
                                    QuestRow(
                                        icon: quest.complete ? "checkmark.seal.fill" : "target",
                                        title: quest.title,
                                        detail: "\(quest.detail) · \(quest.progress)/\(quest.target)",
                                        complete: quest.complete
                                    )
                                }
                            } else {
                                QuestRow(icon: "flame.fill", title: "Keep the torch lit", detail: "Judge 10 claims today", complete: submittedCount >= 10)
                                QuestRow(icon: "eye.fill", title: "Dungeon of Doubt", detail: "Prioritize low-confidence claims", complete: false)
                                QuestRow(icon: "pencil.and.scribble", title: "Review with care", detail: "Uncertainty is welcome; rewards measure participation", complete: submittedCount >= 5)
                            }
                            if outboxCount > 0 {
                                QuestRow(icon: "arrow.triangle.2.circlepath", title: "Eval courier pouch", detail: "\(outboxCount) eval verdicts waiting to sync", complete: false)
                            }
                            if gameOutboxCount > 0 {
                                QuestRow(icon: "arrow.triangle.2.circlepath", title: "Guild courier pouch", detail: "\(gameOutboxCount) game events waiting to sync", complete: false)
                            }
                            if sealedCouriers > 0 {
                                Button(action: syncCouriers) {
                                    MediEvalActionButtonLabel(
                                        title: isSyncingCouriers ? "Sending couriers..." : "Send sealed couriers",
                                        systemImage: "paperplane.fill",
                                        isEnabled: !isSyncingCouriers,
                                        height: 46
                                    )
                                }
                                .buttonStyle(.plain)
                                .disabled(isSyncingCouriers)
                            }
                            if let courierStatusMessage {
                                Label(courierStatusMessage, systemImage: sealedCouriers > 0 ? "scroll.fill" : "checkmark.seal.fill")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(sealedCouriers > 0 ? MediEvalTheme.ember : MediEvalTheme.forest)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        .themedPanel()

                        VStack(alignment: .leading, spacing: 10) {
                            Text("Round Table")
                                .font(.headline.weight(.black))
                            if progress.syncedFromServer {
                                if leaderboard.isEmpty {
                                    QuestRow(icon: "crown.fill", title: "No champions yet", detail: "Sync a verdict to enter the guild ranking", complete: false)
                                } else {
                                    ForEach(leaderboard) { entry in
                                        GuildLeaderboardRow(entry: entry, isCurrentReviewer: entry.reviewerKey == reviewerKey)
                                    }
                                }
                            } else {
                                QuestRow(icon: "network", title: "Castle gates closed", detail: "Add the Guild backend to see shared rankings", complete: false)
                            }
                        }
                        .themedPanel()

                        VStack(alignment: .leading, spacing: 10) {
                            Text("Party Progress")
                                .font(.headline.weight(.black))
                            QuestRow(icon: "person.2.fill", title: "Dame Confidens", detail: "\(progress.xp) XP earned across the guild ledger", complete: progress.xp > 0)
                            QuestRow(icon: "table.furniture.fill", title: "The Eval Table", detail: progress.syncedFromServer ? "Server profile is active" : "Add the Guild backend to sync across devices", complete: progress.syncedFromServer)
                            QuestRow(icon: "shield.lefthalf.filled", title: "Sir Wrongalot", detail: "\(progress.totalVerdicts) verdicts recorded", complete: progress.totalVerdicts > 0)
                        }
                        .themedPanel()
                    }
                    .padding(18)
                }
            }
            .navigationTitle("Guild Hall")
            .mediEvalInlineNavigationTitle()
        }
    }
}

struct GuildLeaderboardRow: View {
    let entry: GameLeaderboardEntry
    let isCurrentReviewer: Bool

    private var placeIcon: String {
        switch entry.place {
        case 1: return "crown.fill"
        case 2: return "shield.fill"
        case 3: return "seal.fill"
        default: return "person.crop.square.fill"
        }
    }

    private var tint: Color {
        switch entry.place {
        case 1: return MediEvalTheme.gold
        case 2: return MediEvalTheme.stone
        case 3: return MediEvalTheme.ember
        default: return MediEvalTheme.royal
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(tint.opacity(0.16))
                Image(systemName: placeIcon)
                    .font(.subheadline.weight(.black))
                    .foregroundStyle(tint)
            }
            .frame(width: 34, height: 34)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text("#\(entry.place)")
                        .font(.caption.weight(.black))
                        .foregroundStyle(tint)
                    Text(entry.reviewer)
                        .font(.subheadline.weight(.black))
                        .foregroundStyle(MediEvalTheme.ink)
                        .lineLimit(1)
                    if isCurrentReviewer {
                        Text("You")
                            .font(.caption2.weight(.black))
                            .foregroundStyle(MediEvalTheme.parchmentLight)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(MediEvalTheme.forest)
                            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                    }
                }
                Text("\(entry.rank) · \(entry.xp) XP · \(entry.streakDays)d streak")
                    .font(.caption)
                    .foregroundStyle(MediEvalTheme.mutedInk)
                    .lineLimit(1)
            }

            Spacer(minLength: 6)

            Text("\(entry.gold)")
                .font(.caption.weight(.black))
                .foregroundStyle(MediEvalTheme.ink)
            Image(systemName: "circle.hexagongrid.fill")
                .font(.caption)
                .foregroundStyle(MediEvalTheme.gold)
        }
        .padding(10)
        .background(isCurrentReviewer ? MediEvalTheme.sky.opacity(0.62) : MediEvalTheme.parchmentLight.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(isCurrentReviewer ? MediEvalTheme.forest.opacity(0.5) : tint.opacity(0.18), lineWidth: 1.2))
    }
}

struct GuildStat: View {
    let title: String
    let value: String
    let icon: String
    let tint: Color

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .foregroundStyle(tint)
            Text(value)
                .font(.title3.weight(.black))
                .foregroundStyle(MediEvalTheme.ink)
            Text(title)
                .font(.caption.weight(.bold))
                .foregroundStyle(MediEvalTheme.mutedInk)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(MediEvalTheme.parchmentLight)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(tint.opacity(0.35), lineWidth: 1.5))
    }
}

struct QuestRow: View {
    let icon: String
    let title: String
    let detail: String
    let complete: Bool

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: complete ? "checkmark.seal.fill" : icon)
                .foregroundStyle(complete ? MediEvalTheme.forest : MediEvalTheme.royal)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.black))
                    .foregroundStyle(MediEvalTheme.ink)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(MediEvalTheme.mutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
        }
        .padding(10)
        .background(MediEvalTheme.parchmentLight.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

extension EvalCard {
    var displayQuestion: String {
        switch claim.template {
        case "component_game_title":
            return "Is this game title correct?"
        case "component_title_or_label":
            return "Is this included item correctly identified?"
        case "component_type":
            return "Is this item type correct?"
        case "variant_signal", "component_variant_signal":
            return "Does the evidence show this variant signal?"
        case "pricing_use":
            return "Is this pricing label correct?"
        default:
            return question.isEmpty ? "Is this eval claim correct?" : question
        }
    }

    var claimDisplayLabel: String {
        switch claim.template {
        case "component_game_title":
            return "Claimed game title"
        case "component_title_or_label":
            return "Claimed included item"
        case "component_type":
            return "Claimed item type"
        case "variant_signal", "component_variant_signal":
            return "Claimed evidence"
        case "pricing_use":
            return "Claimed pricing label"
        default:
            return "Claim"
        }
    }

    var correctionFieldLabel: String {
        switch claim.template {
        case "component_game_title":
            return "Correct game title"
        case "component_title_or_label":
            return "Correct item name"
        case "component_type":
            return "Correct item type"
        case "variant_signal", "component_variant_signal":
            return "Correct visible evidence"
        case "pricing_use":
            return "Correct pricing label"
        default:
            return "Correct answer"
        }
    }

    var correctionFieldPlaceholder: String {
        switch claim.template {
        case "component_game_title":
            return "e.g. Super Mario World"
        case "component_title_or_label":
            return "e.g. Charging cable"
        case "component_type":
            return "e.g. Console, cable, cartridge"
        case "variant_signal", "component_variant_signal":
            return "e.g. the source image shows Legacy Edition"
        case "pricing_use":
            return "e.g. Sold price, shipping, bundle value"
        default:
            return "Optional correction for this eval"
        }
    }
}

struct EmptyDeckView: View {
    let refresh: () -> Void

    var body: some View {
        SirWrongalotDialogueScene(
            title: "All clear, my liege.",
            message: "The guild has no fresh evals right now. I shall knock on the quest board again.",
            knightAsset: "MediEvalSirWrongalotConfused",
            actionTitle: "REFRESH BOARD",
            action: refresh
        )
    }
}

struct PixelKnightBadge: View {
    let size: CGFloat

    var body: some View {
        Image("MediEvalSirWrongalot")
            .resizable()
            .interpolation(.none)
            .scaledToFit()
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

struct PixelSquare: View {
    let color: Color
    let size: CGFloat

    var body: some View {
        Rectangle()
            .fill(color)
            .frame(width: size, height: size)
    }
}

struct MediEvalBackground: View {
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Image("MediEvalCastleHallBackdrop")
                    .resizable()
                    .interpolation(.none)
                    .scaledToFill()
                    .frame(width: geometry.size.width, height: geometry.size.height)
                    .clipped()

                LinearGradient(
                    colors: [.black.opacity(0.18), .clear, .black.opacity(0.34)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
        }
        .ignoresSafeArea()
    }
}

struct CastlePattern: View {
    var body: some View {
        GeometryReader { geometry in
            let columns = max(1, Int(geometry.size.width / 42))
            VStack {
                Spacer()
                HStack(alignment: .bottom, spacing: 10) {
                    ForEach(0..<columns, id: \.self) { index in
                        VStack(spacing: 0) {
                            HStack(spacing: 3) {
                                Rectangle().frame(width: 7, height: 12)
                                Rectangle().frame(width: 7, height: 18)
                                Rectangle().frame(width: 7, height: 12)
                            }
                            Rectangle()
                                .frame(height: CGFloat(34 + (index % 3) * 13))
                        }
                        .foregroundStyle(MediEvalTheme.stone)
                    }
                }
            }
        }
    }
}

extension View {
    func themedPanel() -> some View {
        self
            .padding(.horizontal, 22)
            .padding(.vertical, 20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                ZStack {
                    PixelParchmentPanelBackground()
                        .fill(
                            LinearGradient(
                                colors: [
                                    MediEvalTheme.parchmentLight,
                                    MediEvalTheme.parchment
                                ],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                    PixelParchmentPanelBackground()
                        .stroke(MediEvalTheme.gold.opacity(0.72), lineWidth: 2)
                    PixelParchmentPanelBackground()
                        .stroke(MediEvalTheme.ink.opacity(0.16), lineWidth: 1)
                        .offset(y: 2)
                }
            }
            .clipShape(PixelParchmentPanelBackground())
            .shadow(color: .black.opacity(0.18), radius: 0, x: 0, y: 3)
    }
}

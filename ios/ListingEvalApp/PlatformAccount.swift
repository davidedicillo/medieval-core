import SwiftUI
import Security

struct PlatformUser: Codable, Identifiable {
    let id: String
    let email: String
    let name: String
}

struct PlatformBatch: Codable, Identifiable {
    let id: String
    let batchId: String
    let projectId: String
    let workspaceId: String
    let name: String
    let description: String
    let projectName: String
    let workspaceName: String
    let totalCards: Int
    let reviewedCards: Int
    let pendingCards: Int
}

struct PlatformInvitation: Decodable, Identifiable {
    let id: String
    let workspace_name: String
    let batch_name: String?
}

private struct PlatformMe: Decodable {
    let user: PlatformUser
    let invitations: [PlatformInvitation]
}

private struct PlatformBatches: Decodable { let batches: [PlatformBatch] }
private struct AcceptedInvitation: Decodable { let batchId: String? }

private enum PlatformKeychain {
    static func read(server: String) -> String? {
        var query = base(server)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func save(_ value: String?, server: String) throws {
        let query = base(server)
        guard let value else { SecItemDelete(query as CFDictionary); return }
        let data = Data(value.utf8)
        let updated = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if updated == errSecItemNotFound {
            var insert = query
            insert[kSecValueData as String] = data
            insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            guard SecItemAdd(insert as CFDictionary, nil) == errSecSuccess else {
                throw EvalAPIError.rejected("Could not securely save your session.")
            }
        } else if updated != errSecSuccess {
            throw EvalAPIError.rejected("Could not securely save your session.")
        }
    }

    private static func base(_ server: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "MediEval.PlatformSession",
         kSecAttrAccount as String: server]
    }
}

@MainActor
final class PlatformAccountStore: ObservableObject {
    @Published private(set) var user: PlatformUser?
    @Published private(set) var batches: [PlatformBatch] = []
    @Published private(set) var invitations: [PlatformInvitation] = []
    @Published var serverURLString: String
    @Published var selectedBatch: PlatformBatch?
    @Published var isReviewing = false
    @Published var errorMessage: String?
    @Published var isRestoring = true
    @Published var pendingInvitationToken: String?
    @Published var proposedConnection: URL?

    private var sessionToken: String?
    private var sessionGeneration = 0
    private let defaults = UserDefaults.standard
    private let network: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        return URLSession(configuration: configuration)
    }()

    init() {
        let configured = Bundle.main.object(forInfoDictionaryKey: "MediEvalPlatformURL") as? String ?? ""
        #if DEBUG
        let fallback = "http://127.0.0.1:5183"
        #else
        let fallback = ""
        #endif
        serverURLString = defaults.string(forKey: "medieval.platformURL") ?? (configured.hasPrefix("https://") ? configured : fallback)
    }

    var serverURL: URL? { mediEvalNormalizedBaseURL(from: serverURLString) }
    private var serverKey: String { serverURL?.absoluteString ?? serverURLString }
    private var selectionKey: String { "medieval.batch:\(serverKey):\(user?.id ?? "")" }

    func restore() async {
        defer { isRestoring = false }
        sessionToken = PlatformKeychain.read(server: serverKey)
        guard sessionToken != nil else { return }
        do { try await refresh() } catch { errorMessage = error.localizedDescription }
    }

    func configureServer(_ value: String) throws {
        guard let url = mediEvalNormalizedBaseURL(from: value) else { throw EvalAPIError.invalidBaseURL }
        if url.absoluteString != serverKey {
            sessionGeneration += 1
            sessionToken = nil
            user = nil
            batches = []
            selectedBatch = nil
            isReviewing = false
        }
        serverURLString = url.absoluteString
        defaults.set(serverURLString, forKey: "medieval.platformURL")
        sessionToken = PlatformKeychain.read(server: serverKey)
    }

    func sendCode(email: String) async throws {
        try configureServer(serverURLString)
        _ = try await request("/api/auth/email-otp/send-verification-otp", body: ["email": email, "type": "sign-in"], authenticated: false)
    }

    func signIn(email: String, code: String, name: String) async throws {
        sessionGeneration += 1
        let (data, response) = try await request("/api/auth/sign-in/email-otp", body: ["email": email, "otp": code, "name": name.isEmpty ? email.components(separatedBy: "@")[0] : name], authenticated: false)
        guard !data.isEmpty, let token = response.value(forHTTPHeaderField: "set-auth-token"), !token.isEmpty else {
            throw EvalAPIError.rejected("The server did not return a session.")
        }
        try PlatformKeychain.save(token, server: serverKey)
        sessionToken = token
        try await refresh()
    }

    func refresh() async throws {
        let (meData, _) = try await request("/api/me")
        let me = try JSONDecoder().decode(PlatformMe.self, from: meData)
        let (batchData, _) = try await request("/api/me/batches")
        let available = try JSONDecoder().decode(PlatformBatches.self, from: batchData).batches
        user = me.user
        invitations = me.invitations
        batches = available
        let savedId = selectedBatch?.id ?? defaults.string(forKey: selectionKey)
        selectedBatch = available.first { $0.id == savedId }
        if selectedBatch == nil { isReviewing = false }
    }

    func connect(_ batch: PlatformBatch, settings: AppSettings) {
        guard let user, let sessionToken, let serverURL else { return }
        selectedBatch = batch
        defaults.set(batch.id, forKey: selectionKey)
        settings.usesLegacyConnection = false
        settings.baseURLString = serverURL.absoluteString
        settings.projectIdString = batch.projectId
        settings.runIdString = batch.batchId
        settings.accountUserId = user.id
        settings.accountDisplayName = user.name.isEmpty ? user.email : user.name
        settings.accountWorkspaceId = batch.workspaceId
        settings.accountSessionToken = sessionToken
        isReviewing = true
    }

    func accept(invitationId: String? = nil, settings: AppSettings) async throws {
        var body: [String: String] = [:]
        if let invitationId { body["invitationId"] = invitationId }
        else if let pendingInvitationToken { body["token"] = pendingInvitationToken }
        let (data, _) = try await request("/api/invitations/accept", body: body)
        let accepted = try JSONDecoder().decode(AcceptedInvitation.self, from: data)
        pendingInvitationToken = nil
        try await refresh()
        if let batch = batches.first(where: { $0.id == accepted.batchId }) { connect(batch, settings: settings) }
    }

    func signOut(settings: AppSettings) async {
        sessionGeneration += 1
        _ = try? await request("/api/auth/sign-out", body: [:])
        try? PlatformKeychain.save(nil, server: serverKey)
        sessionToken = nil
        user = nil
        batches = []
        selectedBatch = nil
        isReviewing = false
        settings.clearAccountConnection()
    }

    @discardableResult
    func receive(_ url: URL) -> Bool {
        let target: URL?
        if url.scheme == "medieval", url.host == "join" {
            let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
            target = items.first(where: { $0.name == "server" })?.value.flatMap(URL.init(string:))
        } else if ["https", "http"].contains(url.scheme ?? ""), url.path.hasPrefix("/invite/") || url.path.hasPrefix("/batches/") {
            target = url
        } else { return false }
        guard let target, let normalized = mediEvalNormalizedBaseURL(from: target.absoluteString) else { return false }
        if normalized.absoluteString == serverKey { applyConnection(url); return true }
        proposedConnection = url
        return false
    }

    func applyConnection(_ url: URL) {
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let value = url.scheme == "medieval" ? items.first(where: { $0.name == "server" })?.value : url.absoluteString
        guard let value else { return }
        do {
            try configureServer(value)
            if url.scheme == "medieval" { pendingInvitationToken = items.first(where: { $0.name == "token" })?.value }
            else if url.path.hasPrefix("/invite/") { pendingInvitationToken = url.lastPathComponent }
            isReviewing = false
            proposedConnection = nil
            Task { await restore() }
        } catch { errorMessage = error.localizedDescription }
    }

    private func request(_ path: String, body: [String: String]? = nil, authenticated: Bool = true) async throws -> (Data, HTTPURLResponse) {
        guard let base = serverURL else { throw EvalAPIError.rejected("Choose a platform server in Connection.") }
        let requestServer = serverKey
        let requestGeneration = sessionGeneration
        var request = URLRequest(url: base.appendingPathComponent(path))
        request.setValue("application/json", forHTTPHeaderField: "accept")
        request.setValue(base.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")), forHTTPHeaderField: "origin")
        if authenticated {
            guard let sessionToken else { throw EvalAPIError.rejected("Sign in to continue.") }
            request.setValue("Bearer \(sessionToken)", forHTTPHeaderField: "authorization")
        }
        if let body {
            request.httpMethod = "POST"
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            request.setValue("application/json", forHTTPHeaderField: "content-type")
        }
        let (data, response) = try await network.data(for: request)
        guard requestServer == serverKey, requestGeneration == sessionGeneration else { throw CancellationError() }
        guard let response = response as? HTTPURLResponse else { throw EvalAPIError.rejected("Invalid platform response.") }
        guard (200..<300).contains(response.statusCode) else {
            if response.statusCode == 401, authenticated { user = nil; sessionToken = nil; isReviewing = false; try? PlatformKeychain.save(nil, server: requestServer) }
            let error = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw EvalAPIError.rejected(error?["error"] as? String ?? error?["message"] as? String ?? "The request failed. Try again.")
        }
        return (data, response)
    }
}

struct PlatformAccountView: View {
    @EnvironmentObject private var account: PlatformAccountStore
    @EnvironmentObject private var settings: AppSettings
    @Environment(\.scenePhase) private var scenePhase
    @State private var email = ""
    @State private var code = ""
    @State private var name = ""
    @State private var codeSent = false
    @State private var busy = false
    @State private var showCompleted = false

    var body: some View {
        ZStack {
            MediEvalBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Image("MediEvalLogo").resizable().interpolation(.none).scaledToFit().frame(width: 190, height: 70)
                    if account.isRestoring { ProgressView() }
                    else if let user = account.user { signedIn(user) }
                    else { signIn }
                    if let error = account.errorMessage { ErrorBanner(message: error) }
                }.padding(20)
            }.refreshable { await run { try await account.refresh() } }
        }
        .task { await account.restore() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, account.user != nil { Task { await run { try await account.refresh() } } }
        }
    }

    private var signIn: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Sign In").font(.title2.bold())
            TextField("Email", text: $email).textContentType(.emailAddress)
                #if os(iOS)
                .keyboardType(.emailAddress).textInputAutocapitalization(.never)
                #endif
                .autocorrectionDisabled().mediEvalTextFieldStyle()
            if codeSent {
                TextField("Name", text: $name).textContentType(.name).mediEvalTextFieldStyle()
                TextField("Email Code", text: $code).textContentType(.oneTimeCode)
                    #if os(iOS)
                    .keyboardType(.numberPad)
                    #endif
                    .mediEvalTextFieldStyle()
                Button { Task { await run { try await account.signIn(email: email.trimmingCharacters(in: .whitespacesAndNewlines), code: code, name: name) } } } label: { MediEvalActionButtonLabel(title: "Sign In", systemImage: "person.crop.circle.badge.checkmark") }.buttonStyle(.plain)
            }
            Button { Task { await run { try await account.sendCode(email: email.trimmingCharacters(in: .whitespacesAndNewlines)); codeSent = true } } } label: { MediEvalActionButtonLabel(title: codeSent ? "Resend Code" : "Send Code", systemImage: "envelope") }.buttonStyle(.plain)
            DisclosureGroup("Connection") {
                VStack(spacing: 14) {
                    TextField("Platform URL", text: $account.serverURLString).mediEvalURLFieldStyle()
                    NavigationLink("Advanced Connection") { SettingsView(onDashboardReady: { settings.usesLegacyConnection = true }) }
                }.padding(.top, 14)
            }
        }.themedPanel().disabled(busy)
    }

    private func signedIn(_ user: PlatformUser) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack { VStack(alignment: .leading) { Text("My Batches").font(.title2.bold()); Text(user.email).font(.caption) }; Spacer(); Button { Task { await account.signOut(settings: settings) } } label: { Image(systemName: "rectangle.portrait.and.arrow.right") }.accessibilityLabel("Sign out") }
            if account.pendingInvitationToken != nil {
                Button("Accept Invitation") { Task { await run { try await account.accept(settings: settings) } } }
            }
            ForEach(account.invitations) { invitation in
                VStack(alignment: .leading, spacing: 8) {
                    Text(invitation.batch_name ?? invitation.workspace_name).font(.headline)
                    Button("Accept Invitation") { Task { await run { try await account.accept(invitationId: invitation.id, settings: settings) } } }
                }.padding(.vertical, 10)
            }
            Toggle("Show Completed", isOn: $showCompleted)
            let visible = account.batches.filter { showCompleted || $0.pendingCards > 0 }
            if visible.isEmpty { Text("No batches available.").foregroundStyle(MediEvalTheme.mutedInk) }
            ForEach(visible) { batch in
                Button { account.connect(batch, settings: settings) } label: {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack { Text(batch.name).font(.headline); Spacer(); Image(systemName: "chevron.right") }
                        Text("\(batch.workspaceName) / \(batch.projectName)").font(.caption)
                        if !batch.description.isEmpty { Text(batch.description).font(.subheadline) }
                        ProgressView(value: Double(batch.reviewedCards), total: Double(max(1, batch.totalCards)))
                        Text("\(batch.reviewedCards) of \(batch.totalCards) reviewed").font(.caption)
                    }.foregroundStyle(MediEvalTheme.ink).frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 14)
                }.buttonStyle(.plain)
                Divider()
            }
        }.themedPanel().disabled(busy)
    }

    private func run(_ operation: () async throws -> Void) async {
        guard !busy else { return }
        busy = true
        account.errorMessage = nil
        defer { busy = false }
        do { try await operation() } catch { account.errorMessage = error.localizedDescription }
    }
}

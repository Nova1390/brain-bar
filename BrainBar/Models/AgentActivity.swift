import Foundation

enum AgentActivityAction: String, Codable, CaseIterable, Sendable {
    case read
    case write
    case create
    case delete
    case focus
    case open
    case graphRefresh = "graph_refresh"
    case closeout
    case decision
    case activity
}

struct AgentActivityEvent: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var version: Int
    var agent: String
    var action: AgentActivityAction
    var path: String
    var timestamp: Date
    var sessionId: String?
    var project: String?
    var source: String?
    var reason: String?
    var nodeId: String?
    var status: String?

    init(
        id: String = UUID().uuidString,
        version: Int = 1,
        agent: String,
        action: AgentActivityAction,
        path: String,
        timestamp: Date,
        sessionId: String? = nil,
        project: String? = nil,
        source: String? = nil,
        reason: String? = nil,
        nodeId: String? = nil,
        status: String? = nil
    ) {
        self.id = id
        self.version = version
        self.agent = agent
        self.action = action
        self.path = path
        self.timestamp = timestamp
        self.sessionId = sessionId
        self.project = project
        self.source = source
        self.reason = reason
        self.nodeId = nodeId
        self.status = status
    }
}

struct AgentActivityMappedEvent: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var action: AgentActivityAction
    var agent: String
    var path: String
    var timestamp: Date
    var nodeId: String?
    var label: String?
    var sourceFile: String?
    var pending: Bool

    init(event: AgentActivityEvent, node: AgentActivityGraphNode?) {
        id = event.id
        action = event.action
        agent = event.agent
        path = event.path
        timestamp = event.timestamp
        nodeId = node?.id ?? event.nodeId
        label = node?.label
        sourceFile = node?.sourceFile
        pending = node == nil
    }
}

struct AgentActivitySnapshot: Codable, Equatable, Sendable {
    var events: [AgentActivityMappedEvent]
    var nodeIds: [String]
    var pendingPaths: [String]
    var lastEventAt: Date?
    var eventLogPath: String
    var codexIntegrationInstalled: Bool
    var claudeIntegrationInstalled: Bool
    var claudeIntegrationPartial: Bool
    var tracingEnabled: Bool

    static let empty = AgentActivitySnapshot(
        events: [],
        nodeIds: [],
        pendingPaths: [],
        lastEventAt: nil,
        eventLogPath: AgentActivityPaths.defaultEventLogURL.path,
        codexIntegrationInstalled: false,
        claudeIntegrationInstalled: false,
        claudeIntegrationPartial: false,
        tracingEnabled: false
    )
}

struct AgentActivityGraphNode: Equatable, Sendable {
    var id: String
    var label: String
    var sourceFile: String?
}

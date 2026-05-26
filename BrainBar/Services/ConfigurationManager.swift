import Foundation

struct ConfigurationManager {
    var fileManager: FileManager = .default
    var environment: [String: String] = ProcessInfo.processInfo.environment

    var configURL: URL {
        if let override = environment["BRAIN_BAR_CONFIG"], !override.isEmpty {
            return URL(fileURLWithPath: override).standardizedFileURL
        }

        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return appSupport.appendingPathComponent("BrainBar/config.json", isDirectory: false)
    }

    func loadOrCreate() throws -> BrainBarConfig {
        let url = configURL
        if fileManager.fileExists(atPath: url.path) {
            return try load()
        }

        try write(BrainBarConfig.default, to: url, overwrite: false)
        return BrainBarConfig.default
    }

    func load() throws -> BrainBarConfig {
        let data = try Data(contentsOf: configURL)
        return try JSONDecoder().decode(BrainBarConfig.self, from: data).normalized()
    }

    func save(_ config: BrainBarConfig) throws {
        try write(config, to: configURL, overwrite: true)
    }

    private func write(_ config: BrainBarConfig, to url: URL, overwrite: Bool) throws {
        let parent = url.deletingLastPathComponent()
        try fileManager.createDirectory(at: parent, withIntermediateDirectories: true)

        if !overwrite, fileManager.fileExists(atPath: url.path) {
            return
        }

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(config)
        try data.write(to: url, options: [.atomic])
    }
}

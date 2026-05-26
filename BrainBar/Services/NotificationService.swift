import Foundation
import UserNotifications

struct NotificationService: Sendable {
    func notifyIfEnabled(title: String, body: String, enabled: Bool) async {
        guard enabled else {
            return
        }

        let center = UNUserNotificationCenter.current()
        do {
            let settings = await center.notificationSettings()
            if settings.authorizationStatus == .notDetermined {
                _ = try await center.requestAuthorization(options: [.alert, .sound])
            }

            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
            try await center.add(request)
        } catch {
            // Notifications are optional; command completion should never fail because of them.
        }
    }
}

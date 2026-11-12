// StudyPulse focus blocking on iOS (Screen Time API).
// - Authorization: the student authorizes StudyPulse for themselves (.individual, iOS 16+).
// - Focus shield: during a study session, shield all app and web categories; the student
//   can still open Phone, Messages to emergency contacts, and Settings (iOS never shields
//   those). The shield is cleared when the session ends. So a force-quit app can't leave
//   the phone locked, the session end is also scheduled with DeviceActivity, whose monitor
//   extension (targets/device-activity-monitor) clears the shield at that time.
import DeviceActivity
import ExpoModulesCore
import FamilyControls
import ManagedSettings

public class FamilyControlsModule: Module {
  private static let storeName = ManagedSettingsStore.Name("studypulse.focus")
  private static let activityName = DeviceActivityName("studypulse.focus-session")

  public func definition() -> ModuleDefinition {
    Name("FamilyControls")

    Function("authorizationStatus") { () -> String in
      Self.describe(AuthorizationCenter.shared.authorizationStatus)
    }

    AsyncFunction("requestAuthorization") { () async -> String in
      do {
        try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
      } catch {
        // Declined, restricted (e.g. managed device), or no entitlement in this build.
        return "denied"
      }
      return Self.describe(AuthorizationCenter.shared.authorizationStatus)
    }

    // Shields all app and website categories until `endsAt` (Unix ms).
    Function("startFocusShield") { (endsAt: Double) -> Bool in
      guard AuthorizationCenter.shared.authorizationStatus == .approved else { return false }
      let store = ManagedSettingsStore(named: Self.storeName)
      store.shield.applicationCategories = .all()
      store.shield.webDomainCategories = .all()

      // Safety net: the monitor extension clears the shield when the interval ends,
      // even if StudyPulse isn't running.
      let end = Date(timeIntervalSince1970: endsAt / 1000)
      let calendar = Calendar.current
      let components: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]
      let schedule = DeviceActivitySchedule(
        intervalStart: calendar.dateComponents(components, from: Date()),
        intervalEnd: calendar.dateComponents(components, from: end),
        repeats: false
      )
      let center = DeviceActivityCenter()
      center.stopMonitoring([Self.activityName])
      do {
        try center.startMonitoring(Self.activityName, during: schedule)
      } catch {
        // Scheduling failed (e.g. under 15 minutes): the app clears the shield itself.
      }
      return true
    }

    Function("clearFocusShield") { () in
      ManagedSettingsStore(named: Self.storeName).clearAllSettings()
      DeviceActivityCenter().stopMonitoring([Self.activityName])
    }
  }

  private static func describe(_ status: AuthorizationStatus) -> String {
    switch status {
    case .approved: return "approved"
    case .denied: return "denied"
    case .notDetermined: return "not_determined"
    @unknown default: return "not_determined"
    }
  }
}

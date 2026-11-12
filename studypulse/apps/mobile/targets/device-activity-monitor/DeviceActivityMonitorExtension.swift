// DeviceActivityMonitor app extension: clears the StudyPulse focus shield when the
// scheduled study session ends, even if the app was force-quit.
//
// Not built yet. To add it as an Xcode target from this repo, use a target-generating
// config plugin (e.g. @bacons/apple-targets) pointing at this folder, with:
// - extension point: com.apple.deviceactivity.monitor-extension
// - entitlements: com.apple.developer.family-controls, and the same App Group as the app
//   (group.<bundle id>, see plugins/withFamilyControls.js)
// - deployment target: iOS 16.0
import DeviceActivity
import ManagedSettings

class DeviceActivityMonitorExtension: DeviceActivityMonitor {
  override func intervalDidEnd(for activity: DeviceActivityName) {
    super.intervalDidEnd(for: activity)
    guard activity == DeviceActivityName("studypulse.focus-session") else { return }
    ManagedSettingsStore(named: ManagedSettingsStore.Name("studypulse.focus")).clearAllSettings()
  }
}

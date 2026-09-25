Pod::Spec.new do |s|
  s.name           = 'FamilyControls'
  s.version        = '1.0.0'
  s.summary        = 'StudyPulse focus blocking (Screen Time API)'
  s.author         = 'StudyPulse'
  s.homepage       = 'https://studypulse.app'
  s.license        = 'UNLICENSED'
  s.platforms      = { :ios => '16.0' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'FamilyControls', 'ManagedSettings', 'DeviceActivity'
  s.source_files   = '**/*.swift'
end

import '../m.css'
import { OnboardingScreen } from './OnboardingScreen'

/**
 * Onboarding w pełnej aplikacji (`/start`, docs/31): ten sam komponent co w `/m`, na komputerze jako karta na środku
 * ekranu, poniżej 1024 px na całym ekranie. Wyjście wraca do pełnej aplikacji.
 */
export function DesktopOnboarding() {
  return (
    <div className="m ob-desk">
      <div className="ob-desk-card">
        <OnboardingScreen home="/" me="/wiecej" />
      </div>
    </div>
  )
}

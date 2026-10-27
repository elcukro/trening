import { useSettings } from '@/app/useSettings'
import { useAuth } from '@/sync/auth'
import { avatarView, googleAvatarUrl, initialsOf, type AvatarView } from '@/lib/avatar'

/** Zdjęcie profilowe zalogowanego konta (Profil, róg Dziś i Planu): własne → Google → inicjały. */
export function useAvatar(): { signedIn: boolean; email: string | null; view: AvatarView; initials: string; google: string | null } {
  const auth = useAuth()
  const { settings } = useSettings()
  const email = auth.session?.user.email ?? null
  const google = googleAvatarUrl(auth.session?.user.user_metadata)
  const initials = initialsOf(settings.athlete_name, email)
  return { signedIn: !!auth.session, email, view: avatarView(settings.avatar, google, settings.athlete_name, email), initials, google }
}

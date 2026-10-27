import { describe, expect, it } from 'vitest'
import { OTP_LENGTH } from '../auth'
import toml from '../../../supabase/config.toml?raw'

// ekran logowania i Supabase muszą zgadzać się co do liczby cyfr kodu – 27.10.2026 `/m` brał 6 z 8 i serwer odrzucał kod
describe('OTP_LENGTH', () => {
  it('równa się auth.email.otp_length w supabase/config.toml', () => {
    const email = toml.split(/^\[auth\.email\]$/m)[1]?.split(/^\[/m)[0] ?? ''
    expect(Number(/^otp_length = (\d+)$/m.exec(email)?.[1])).toBe(OTP_LENGTH)
  })
})

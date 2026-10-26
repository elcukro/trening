import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

/**
 * Logowanie przez Google i Stravę (docs/28) bez prawdziwych kont: odpowiedzi Supabase i funkcji `strava-login`
 * są podstawione, sprawdzamy przyciski, adresy wyjścia i powroty (bilet, błędy).
 */

function supabaseUrl(): string | null {
  for (const f of ['.env.local', '.env']) {
    if (!existsSync(f)) continue
    const m = /^VITE_SUPABASE_URL=(\S+)/m.exec(readFileSync(f, 'utf8'))
    if (m) return m[1]!
  }
  return null
}

const SB = supabaseUrl()
const DAY = '?today=2026-10-26'

// service worker podaje odpowiedzi poza `page.route` – w tych testach niepotrzebny
test.use({ serviceWorkers: 'block' })

test.beforeEach(async ({ page }) => {
  test.skip(!SB, 'build bez konfiguracji Supabase – nie ma się gdzie logować')
  await page.addInitScript(() => sessionStorage.removeItem('trening:no-account'))
})

async function providers(page: Page, google: boolean, strava: boolean) {
  await page.route(`${SB}/auth/v1/settings`, (r) => r.fulfill({ json: { external: { google, email: true } } }))
  await page.route(`${SB}/functions/v1/strava-login/ping`, (r) => (strava ? r.fulfill({ json: { ok: true } }) : r.fulfill({ status: 404, json: { code: 'NOT_FOUND' } })))
}

test('przyciski pojawiają się tylko dla włączonych dostawców', async ({ page }) => {
  await providers(page, false, false)
  await page.goto(`/m${DAY}`)
  await expect(page.getByRole('button', { name: 'Wyślij kod na maila' })).toBeVisible()
  await expect(page.getByRole('button', { name: /przez Google/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /przez Stravę/ })).toHaveCount(0)

  await page.unrouteAll()
  await providers(page, true, true)
  await page.goto(`/i${DAY}`)
  const google = page.getByRole('button', { name: 'Zaloguj się przez Google' })
  await expect(google).toBeVisible()
  await expect(page.getByRole('button', { name: 'Zaloguj się przez Stravę' })).toBeVisible()
  // dotyk ≥ 44 pt
  expect((await google.boundingBox())!.height).toBeGreaterThanOrEqual(44)
})

test('Strava: wyjście do strava-login z adresem powrotu i wyzwaniem PKCE', async ({ page, baseURL }) => {
  await providers(page, true, true)
  let started: URL | null = null
  await page.route(`${SB}/functions/v1/strava-login/start**`, (r) => {
    started = new URL(r.request().url())
    return r.fulfill({ contentType: 'text/html', body: '<p>Strava</p>' })
  })
  await page.goto(`/m${DAY}`)
  await page.getByRole('button', { name: 'Zaloguj się przez Stravę' }).click()
  await expect(page.getByText('Strava', { exact: true })).toBeVisible()
  expect(started!.searchParams.get('return')).toBe(`${baseURL}/m`)
  expect(started!.searchParams.get('challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)

  // powrót z biletem: aplikacja wysyła weryfikator, z którego powstało wyzwanie (bez niego bilet nic nie daje)
  let verifier = ''
  await page.route(`${SB}/functions/v1/strava-login`, (r) => {
    verifier = String((r.request().postDataJSON() as { verifier: string }).verifier)
    return r.fulfill({ status: 400, json: { error: 'bad_state' } })
  })
  await page.goto(`/m${DAY}#strava_ticket=t`)
  await expect(page.getByText(/Logowanie przez Stravę się nie powiodło/)).toBeVisible()
  expect(createHash('sha256').update(verifier).digest('base64url')).toBe(started!.searchParams.get('challenge'))
})

test('Strava: konto bez połączonej Stravy dostaje instrukcję, a adres jest czyszczony', async ({ page }) => {
  await providers(page, true, true)
  await page.goto(`/m${DAY}#strava_error=not_linked`)
  await expect(page.getByText(/najpierw|Zaloguj się kodem z maila, a potem połącz Stravę/)).toBeVisible()
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('')
  expect(page.url()).toContain(DAY)
})

test('Strava: bilet wymieniany z weryfikatorem; przeterminowany daje komunikat', async ({ page }) => {
  await providers(page, true, true)
  await page.addInitScript(() => sessionStorage.setItem('trening:strava-verifier', 'v'.repeat(43)))
  let body: Record<string, unknown> | null = null
  await page.route(`${SB}/functions/v1/strava-login`, (r) => {
    body = r.request().postDataJSON() as Record<string, unknown>
    return r.fulfill({ status: 400, json: { error: 'expired' } })
  })
  await page.goto(`/m${DAY}#strava_ticket=abc.def`)
  await expect(page.getByText(/trwało za długo/)).toBeVisible()
  expect(body).toEqual({ action: 'redeem', ticket: 'abc.def', verifier: 'v'.repeat(43) })
  // bilet nie zostaje w adresie ani weryfikator w pamięci
  expect(await page.evaluate(() => [location.hash, sessionStorage.getItem('trening:strava-verifier')])).toEqual(['', null])
})

test('Google: wyjście przez Supabase Auth z powrotem na tę samą stronę', async ({ page, baseURL }) => {
  await providers(page, true, true)
  let authorize: URL | null = null
  await page.route(`${SB}/auth/v1/authorize**`, (r) => {
    authorize = new URL(r.request().url())
    return r.fulfill({ contentType: 'text/html', body: '<p>Google</p>' })
  })
  await page.goto(`/m${DAY}`)
  await page.getByRole('button', { name: 'Zaloguj się przez Google' }).click()
  await expect(page.getByText('Google', { exact: true })).toBeVisible()
  expect(authorize!.searchParams.get('provider')).toBe('google')
  expect(authorize!.searchParams.get('redirect_to')).toBe(`${baseURL}/m`)
})

test('Google z adresu spoza listy dozwolonych: komunikat zamiast pustej aplikacji', async ({ page }) => {
  await providers(page, true, true)
  await page.goto(`/m${DAY}&error=server_error&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance`)
  await expect(page.getByText(/Ten adres e-mail nie ma dostępu do aplikacji/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Wyślij kod na maila' })).toBeVisible()
})

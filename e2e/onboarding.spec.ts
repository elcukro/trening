import { expect, test, type Page } from '@playwright/test'

/** Onboarding w `/m` (docs/31): cały przepływ na viewporcie iPhone'a, zapis w Dexie, wznawianie i poprawki z podsumowania. */

test.use({ viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: true })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('trening:no-account', '1'))
})

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/onboarding-${name}.png`, animations: 'disabled' })
const next = (page: Page) => page.getByRole('button', { name: 'Dalej' }).click()
const step = (page: Page, n: number) => expect(page.getByText(`Krok ${n} z 10`)).toBeVisible()
const pick = (page: Page, name: string, value: string) => page.getByRole('combobox', { name, exact: true }).selectOption(value)

/** Wiersz onboardingu z IndexedDB (Dexie `trening`, tabela `onboarding`). */
function readRow(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
        const open = indexedDB.open('trening')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const req = open.result.transaction('onboarding').objectStore('onboarding').get('v1')
          req.onsuccess = () => resolve(req.result as Record<string, unknown> | undefined)
          req.onerror = () => reject(req.error)
        }
      }),
  )
}

async function fillTime(page: Page) {
  await step(page, 1)
  await expect(page.getByRole('button', { name: 'Dalej' })).toBeDisabled()
  await pick(page, 'Godzin w tygodniu', '8')
  for (const d of ['Wtorek', 'Czwartek', 'Sobota', 'Niedziela']) await page.getByRole('checkbox', { name: d }).click()
  await next(page)
}

test('pełny onboarding: kroki, czerwona flaga, podsumowanie z poprawką, zapis, wejście z Ja', async ({ page }) => {
  await page.goto('/m/start?today=2026-10-26')
  await expect(page.getByRole('heading', { name: 'Ułóżmy plan pod Ciebie' })).toBeVisible()
  await shot(page, '00-intro')
  await page.getByRole('button', { name: 'Zaczynamy' }).click()

  await fillTime(page)

  await step(page, 2)
  await pick(page, 'W dzień roboczy', '90')
  await pick(page, 'W weekend', '240')
  await pick(page, 'Sobota', 'group_ride')
  await shot(page, '02-tydzien')
  await next(page)

  await step(page, 3)
  await page.getByRole('radiogroup', { name: 'Godziny w ostatnich 4 tygodniach' }).getByRole('radio', { name: '6 h' }).click()
  await page.getByRole('radiogroup', { name: 'Najdłuższa jazda' }).getByRole('radio', { name: '3 h' }).click()
  await page.getByRole('radio', { name: '3–5 lat' }).click()
  await shot(page, '03-forma')
  await next(page)

  await step(page, 4)
  await page.getByRole('radio', { name: /Miernik mocy/ }).click()
  await pick(page, 'FTP', '240')
  await shot(page, '04-pomiar')
  await next(page)

  await step(page, 5)
  await page.getByRole('group', { name: 'Dyscypliny' }).getByRole('checkbox', { name: 'Szosa' }).click()
  await page.getByRole('group', { name: 'Dyscypliny' }).getByRole('checkbox', { name: 'Gravel' }).click()
  await page.getByRole('group', { name: 'Rowery' }).getByRole('checkbox', { name: 'Szosowy' }).click()
  await page.getByRole('radio', { name: 'Smart' }).click()
  await page.getByRole('checkbox', { name: 'Wahoo' }).click()
  await shot(page, '05-sprzet')
  await next(page)

  await step(page, 6)
  await expect(page.getByRole('button', { name: 'Dalej' })).toBeDisabled()
  await page.getByRole('checkbox', { name: /Zgadzam się/ }).click()
  await shot(page, '06-zgoda')
  await next(page)

  await step(page, 7)
  await expect(page.getByRole('button', { name: 'Pomiń' })).toBeVisible()
  await pick(page, 'Wzrost', '180')
  await pick(page, 'Masa ciała', '82')
  await page.locator('input[aria-label="Data urodzenia"]').fill('1985-05-01')
  await page.getByRole('radio', { name: 'Mężczyzna' }).click()
  await shot(page, '07-cialo')
  await next(page)

  await step(page, 8)
  await expect(page.getByRole('button', { name: 'Dalej' })).toBeDisabled()
  for (const g of await page.getByRole('radiogroup').all()) await g.getByRole('radio', { name: 'Nie' }).click()
  // czerwona flaga: komunikat „najpierw lekarz”, po zmianie odpowiedzi znika
  const chest = page.getByRole('radiogroup', { name: /ból w klatce/ })
  await chest.getByRole('radio', { name: 'Tak' }).click()
  await expect(page.getByRole('alert')).toContainText('Najpierw lekarz')
  await shot(page, '08-zdrowie-lekarz')
  await chest.getByRole('radio', { name: 'Nie' }).click()
  await expect(page.getByRole('alert')).toBeHidden()
  await next(page)

  await step(page, 9)
  await page.getByRole('radio', { name: /Wydarzenie/ }).click()
  await shot(page, '09-cel')
  await next(page)

  await step(page, 10)
  await page.locator('input[aria-label="Data"]').fill('2027-06-20')
  await pick(page, 'Dystans', '160')
  await pick(page, 'Przewyższenie', '2500')
  await page.getByRole('radiogroup', { name: 'Dyscyplina wydarzenia' }).getByRole('radio', { name: 'Szosa' }).click()
  await shot(page, '10-szczegoly-celu')
  await next(page)

  // podsumowanie: poprawka czasu wraca prosto do podsumowania
  await expect(page.getByRole('heading', { name: 'Sprawdź, czy wszystko się zgadza' })).toBeVisible()
  await expect(page.getByText('8 h tygodniowo · wt cz sb nd')).toBeVisible()
  await expect(page.getByText('160 km, 2500 m w górę do 20.06.2027')).toBeVisible()
  await shot(page, '11-podsumowanie')
  await page.getByRole('button', { name: /^Czas/ }).click()
  await step(page, 1)
  await pick(page, 'Godzin w tygodniu', '10')
  await page.getByRole('button', { name: 'Gotowe' }).click()
  await expect(page.getByText('10 h tygodniowo · wt cz sb nd')).toBeVisible()
  await page.getByRole('button', { name: 'Zapisz', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Gotowe!' })).toBeVisible()
  await shot(page, '12-gotowe')
  const row = await readRow(page)
  expect(row).toMatchObject({ status: 'done', draft: null, consent_version: '2026-10-26' })
  expect(row?.data).toMatchObject({
    version: 1,
    time: { hours_per_week: 10, days: ['tue', 'thu', 'sat', 'sun'], weekday_max_min: 90, weekend_max_min: 240, fixed: [{ day: 'sat', kind: 'group_ride' }] },
    current: { hours_4w: 6, longest_ride_min: 180, years: '3to5' },
    measure: { level: 'power', ftp_w: 240, lthr_bpm: null },
    gear: { disciplines: ['road', 'gravel'], bikes: ['road'], trainer: 'smart', devices: ['wahoo'] },
    body: { height_cm: 180, weight_kg: 82, birth_date: '1985-05-01', sex: 'male' },
    goal: { type: 'event', date: '2027-06-20', distance_km: 160, elevation_m: 2500, discipline: 'road', target_time_min: null },
  })

  await page.getByRole('button', { name: 'Do aplikacji' }).click()
  await expect(page).toHaveURL(/\/m$/)
  await page.goto('/m/ja?today=2026-10-26')
  const entry = page.getByRole('button', { name: /Zmień swoje potrzeby/ })
  await expect(entry).toContainText('160 km')
  await entry.click()
  await expect(page.getByRole('heading', { name: 'Twoje potrzeby' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Zapisz zmiany' })).toBeVisible()
})

test('przerwany onboarding wraca do zapisanego kroku i wstecz zachowuje odpowiedzi', async ({ page }) => {
  await page.goto('/m/start?today=2026-10-26')
  await page.getByRole('button', { name: 'Zaczynamy' }).click()
  await fillTime(page)
  await step(page, 2)
  await page.getByRole('button', { name: 'Wróć' }).click()
  await step(page, 1)
  await expect(page.getByRole('checkbox', { name: 'Sobota' })).toBeChecked()
  await next(page)
  await page.getByRole('button', { name: 'Później' }).click()
  await expect(page).toHaveURL(/\/m$/)

  // w tej sesji onboarding nie wraca sam; Ja pokazuje, gdzie skończyliśmy
  await page.goto('/m/ja?today=2026-10-26')
  await expect(page.getByRole('button', { name: /Uzupełnij swoje potrzeby/ })).toContainText('Dokończ: krok 2 z 10')
  await page.getByRole('button', { name: /Uzupełnij swoje potrzeby/ }).click()
  await step(page, 2)
  expect(await readRow(page)).toMatchObject({ status: 'draft', step: 'time_detail', draft: { time: { hours_per_week: 8 } } })
})

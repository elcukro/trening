import { expect, test, type Page } from '@playwright/test'

async function fillNumber(page: Page, label: string, value: string) {
  await page.getByLabel(label).fill(value)
}

test('check-in zapisuje się i przetrwa przeładowanie', async ({ page }) => {
  await page.goto('/?today=2026-09-15')
  await page.getByRole('button', { name: /Poranny check-in/ }).click()
  await fillNumber(page, 'Waga (kg)', '104,8')
  await fillNumber(page, 'Tętno spoczynkowe', '54')
  await page.getByRole('radiogroup', { name: 'Sen' }).getByRole('radio', { name: '4' }).click()
  await page.getByRole('radiogroup', { name: 'Nogi' }).getByRole('radio', { name: '3' }).click()
  await page.getByRole('radiogroup', { name: 'Motywacja' }).getByRole('radio', { name: '5' }).click()
  await page.getByRole('button', { name: 'Zapisz' }).click()
  await expect(page.getByText('104,8 kg')).toBeVisible()
  await page.reload()
  await expect(page.getByText('104,8 kg')).toBeVisible()
  await expect(page.getByText('4/3/5')).toBeVisible()
})

test('oznaczenie jazdy jako wykonanej z danymi', async ({ page }) => {
  await page.goto('/?today=2026-09-15')
  await page.getByRole('button', { name: '✓ Wykonane' }).click()
  await fillNumber(page, 'RPE 1–10', '4')
  await fillNumber(page, 'Dystans (km)', '28,5')
  await fillNumber(page, 'Śr. tętno', '132')
  await page.getByRole('button', { name: 'Zapisz' }).click()
  await expect(page.getByText('Wykonane', { exact: true })).toBeVisible()
  await expect(page.getByText('28,5 km')).toBeVisible()
  await expect(page.getByText('132 bpm')).toBeVisible()
})

test('wynik testu FTP: strefy od następnego dnia (R11)', async ({ page }) => {
  await page.goto('/?today=2026-09-26')
  await expect(page.getByRole('heading', { name: 'Wynik testu' })).toBeVisible()
  await fillNumber(page, 'Śr. tętno z ostatnich 10 min', '160')
  await fillNumber(page, 'Śr. moc z 20 min (W)', '235')
  await expect(page.getByText('LTHR = 160 bpm')).toBeVisible()
  await expect(page.getByText('FTP = 223 W')).toBeVisible()
  await page.getByRole('button', { name: 'Zapisz wynik testu' }).click()
  await expect(page.getByText(/LTHR 160 bpm/).first()).toBeVisible()
  // ten sam dzień – jeszcze RPE
  await expect(page.getByText(/Zrób test i wpisz LTHR/)).toBeVisible()
  // następny akcent – bpm
  await page.goto('/?today=2026-10-01')
  await expect(page.getByText('147–154 bpm').first()).toBeVisible()
  await page.goto('/postep?today=2026-10-01')
  await expect(page.getByText('LTHR bpm')).toBeVisible()
  await expect(page.getByText('160', { exact: true }).first()).toBeVisible()
})

test('tryb siłowni: serie, timer przerwy, podsumowanie, status', async ({ page }) => {
  await page.goto('/?today=2026-09-16')
  await page.getByRole('link', { name: 'Start sesji' }).click()
  await expect(page.getByRole('heading', { name: 'Sesja A – Siła nóg (ciężka)' })).toBeVisible()
  await page.getByRole('button', { name: '▶ Start sesji' }).click()
  // rozgrzewka: 2 serie do odhaczenia
  await expect(page.getByRole('heading', { name: 'Obwód mobilności' })).toBeVisible()
  await page.getByRole('button', { name: /Zalicz serię/ }).click()
  await page.getByRole('button', { name: /Zalicz serię/ }).click()
  // przysiad: seria 1
  await expect(page.getByRole('heading', { name: 'Przysiad ze sztangą na plecach' })).toBeVisible()
  await expect(page.getByText('Seria 1 z 2')).toBeVisible()
  await expect(page.getByText(/ustal ciężar startowy/)).toBeVisible()
  await page.getByLabel('kg').fill('60')
  await page.getByLabel('powt.').fill('10')
  await page.getByLabel('RIR').fill('4')
  await page.getByRole('button', { name: /Zalicz serię/ }).click()
  await expect(page.getByRole('dialog', { name: 'Przerwa' })).toBeVisible()
  await expect(page.getByText(/^1:5\d$/)).toBeVisible()
  await page.getByRole('button', { name: 'Pomiń' }).click()
  await expect(page.getByText('Seria 2 z 2')).toBeVisible()
  await expect(page.getByLabel('kg')).toHaveValue('60')
  await page.getByRole('button', { name: /Zalicz serię/ }).click()
  await page.getByRole('button', { name: 'Pomiń' }).click()
  await page.screenshot({ path: 'test-results/gym-mode.png', fullPage: true })
  // przeładowanie – sesja trwa, serie zapisane
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Martwy ciąg rumuński (RDL)' })).toBeVisible()
  await page.getByRole('button', { name: 'Podsumuj' }).click()
  await expect(page.getByRole('heading', { name: 'Podsumowanie' })).toBeVisible()
  await expect(page.getByText('60×10, 60×10')).toBeVisible()
  await expect(page.getByText(/e1RM ≈ 80 kg/)).toBeVisible()
  await page.getByRole('button', { name: '✓ Zakończ: wykonane' }).click()
  await expect(page.getByText('Wykonane', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Otwórz sesję' })).toBeVisible()
  // Postęp: siła
  await page.goto('/postep?today=2026-09-16')
  await expect(page.getByText('Przysiad', { exact: true })).toBeVisible()
  await expect(page.getByText(/80 kg/).first()).toBeVisible()
})

test('kalkulator podjazdu i konto bez konfiguracji', async ({ page }) => {
  await page.goto('/postep')
  await expect(page.getByRole('heading', { name: 'Kalkulator podjazdu' })).toBeVisible()
  await expect(page.getByText(/^\d+ min$/).first()).toBeVisible()
  await page.goto('/wiecej/ustawienia')
  // bez env: komunikat o braku konfiguracji; z env (.env.local): formularz magic link
  await expect(page.getByText(/Brak konfiguracji Supabase/).or(page.getByRole('button', { name: 'Wyślij link logowania' }))).toBeVisible()
  await expect(page.getByRole('button', { name: 'Eksport JSON' })).toBeVisible()
})

test('Wahoo: przycisk wysyłki na dniu z treningiem, sekcja w Integracjach', async ({ page }) => {
  await page.goto('/?today=2026-10-01')
  await expect(page.getByRole('button', { name: /Wyślij na Wahoo/ })).toBeVisible()
  // stan na Bolcie: lokalnie nic nie wysłano – na karcie i w odprawie
  await expect(page.getByTestId('bolt-state')).toHaveText('nie wysłano na Bolta')
  await expect(page.getByText(/⌚ Bolt: nie wysłano na Bolta/)).toBeVisible()
  // dzień bez jazdy – bez przycisku
  await page.goto('/?today=2026-09-18')
  await expect(page.getByRole('button', { name: /Wyślij na Wahoo/ })).toHaveCount(0)
  await page.goto('/wiecej/ustawienia')
  await expect(page.getByText(/Zaloguj się, żeby połączyć Stravę i Wahoo/)).toBeVisible()
})

test('Etap 5: gołoledź podmienia trening, cofnięcie wraca do planu', async ({ page }) => {
  await page.goto('/?today=2027-01-14')
  await expect(page.getByRole('heading', { name: 'Sweet spot 2×20 min' })).toBeVisible()
  await page.getByRole('button', { name: /Gołoledź/ }).click()
  await expect(page.getByRole('heading', { name: /4×4 min/ })).toBeVisible()
  await expect(page.getByText('Pod dachem', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: /4×4 min/ })).toBeVisible()
  await page.getByRole('button', { name: 'cofnij' }).click()
  await expect(page.getByRole('heading', { name: 'Sweet spot 2×20 min' })).toBeVisible()
})

test('Etap 5: zamiana dni pilnuje reguły 48 godzin (R9)', async ({ page }) => {
  await page.goto('/tydzien/2027-05-12?today=2027-05-12')
  await expect(page.getByRole('heading', { name: 'Tydzień 35' })).toBeVisible()
  await page.getByRole('button', { name: 'Zamień dzień 2027-05-12' }).click()
  await page.getByRole('button', { name: 'Tu' }).nth(2).click()
  await expect(page.getByText(/48 h przed ciężkim dniem/)).toBeVisible()
})

test('Etap 5: sprzęt i wyjazd', async ({ page }) => {
  await page.goto('/wiecej/sprzet')
  await expect(page.getByText('Montaż napędu 40/50')).toBeVisible()
  await page.getByRole('button', { name: 'Odhacz zadanie' }).first().click()
  await expect(page.getByRole('button', { name: 'Cofnij odhaczenie' }).first()).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Cofnij odhaczenie' }).first()).toBeVisible()
  await page.goto('/wiecej/wyjazd')
  await expect(page.getByRole('heading', { name: 'Checklista' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Podział na torby' })).toBeVisible()
  await expect(page.getByText('0/17')).toBeVisible() // wariant hotelowy: bez dwóch pozycji biwakowych
  await page.getByRole('checkbox').first().click() // pole sterowane z bazy: check() sprawdza stan zanim zapis wróci
  await expect(page.getByText('1/17')).toBeVisible()
  await page.getByRole('button', { name: 'Biwak' }).click()
  await expect(page.getByText('0/19')).toBeVisible()
})

test('Komunikaty o wyniku akcji: sukces i błąd', async ({ page }) => {
  // zapis lokalny: pasek postępu i potwierdzenie
  await page.goto('/?today=2026-09-15')
  await page.getByRole('button', { name: /Poranny check-in/ }).click()
  await page.getByLabel('Waga (kg)').fill('104,2')
  await page.getByRole('button', { name: 'Zapisz' }).click()
  await expect(page.getByRole('status')).toContainText('Check-in zapisany')
  // akcja zakończona błędem: komunikat ze szczegółami (import niepoprawnej kopii – bez sieci, więc wynik jest pewny)
  await page.goto('/wiecej/ustawienia')
  await page.setInputFiles('input[type="file"]', { name: 'zle.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"cos innego"}') })
  await expect(page.getByRole('alert')).toContainText('Nie udało się')
  await page.getByRole('button', { name: 'szczegóły' }).click()
  await expect(page.getByRole('alert')).toContainText(/kopia aplikacji Trening/i)
  await page.screenshot({ path: 'test-results/toast.png' })
  await page.getByRole('alert').getByRole('button', { name: 'Zamknij' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('Powiadomienia: sekcja tłumaczy warunki zamiast milczeć', async ({ page }) => {
  await page.goto('/wiecej/ustawienia')
  await expect(page.getByRole('heading', { name: 'Powiadomienia' })).toBeVisible()
  await expect(page.getByText('To urządzenie')).toBeVisible()
  // przeglądarka testowa udaje iPhone'a, więc musi pojawić się wyjaśnienie o ekranie początkowym
  await expect(page.getByText(/ekranu początkowego/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Włącz powiadomienia' })).toBeDisabled()
})

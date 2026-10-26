/** Teksty: coach (docs/34). Źródło prawdy – wersja angielska w `../en/coach.ts` musi mieć te same klucze. */
export default {
  title: 'Trener',
  /** co robi narzędzie w trakcie („Wykonuję: …”) */
  tools: {
    save_checkin: 'zapis check-inu',
    set_rpe: 'zapis RPE',
    mark_skipped: 'oznaczenie pominięcia',
    move_ride: 'przeniesienie treningu',
    push_wahoo: 'wysyłka na Bolta',
  },
  /** potwierdzenie po zmianie zrobionej przez narzędzie */
  changed: {
    checkin: 'Check-in zapisany',
    log: 'RPE zapisane',
    plan: 'Plan zmieniony',
    bolt: 'Wysłano na Bolta',
  },
  savedFallback: 'Zapisano',
  reading: 'Trener czyta…',
  running: (what: string) => `Wykonuję: ${what}…`,
  replying: 'Trener odpowiada…',
  noReply: (reason: string) => `Trener nie odpowiedział. ${reason}`,
  clearTitle: 'Wyczyścić rozmowę z trenerem?',
  clearMessage: 'Historii nie da się przywrócić. Zapisane dane (check-iny, RPE, przeniesienia) zostają.',
  clear: 'Wyczyść',
  needsAccount: 'Czat wymaga konta – aplikacja działa lokalnie.',
  intro: 'Widzę Twój plan, ostatnie jazdy i check-iny. Podaj dane jednym zdaniem – zapiszę je. Możesz też zapytać o plan albo poprosić o przeniesienie treningu.',
  stop: 'Zatrzymaj',
  placeholder: 'Napisz albo podyktuj…',
  inputAria: 'Wiadomość do trenera',
  send: 'Wyślij',
}

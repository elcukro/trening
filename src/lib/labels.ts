import { localized } from '@/i18n/core'
import type { DayFlag, DayType, PhaseId, WeekType } from '@/engine/types'

export const WEEK_TYPE_LABEL: Record<WeekType, string> = localized({
  pl: {
    prep: 'Przygotowanie',
    build: 'Budowanie',
    deload: 'Rozładowanie',
    test: 'Test',
    taper: 'Taper',
  },
  en: {
    prep: 'Preparation',
    build: 'Build',
    deload: 'Recovery week',
    test: 'Test',
    taper: 'Taper',
  },
})

export const DAY_TYPE_LABEL: Record<DayType, string> = localized({
  pl: {
    rest: 'Wolne',
    easy: 'Lekko',
    long: 'Długa jazda',
    key: 'Akcent',
    trip: 'Wyjazd',
  },
  en: {
    rest: 'Rest',
    easy: 'Easy',
    long: 'Long ride',
    key: 'Key session',
    trip: 'Trip',
  },
})

export const FLAG_LABEL: Record<DayFlag, string> = localized({
  pl: {
    test: 'Test',
    deload: 'Rozładowanie',
    mountain_weekend: 'Góry',
    back_to_back: 'Back-to-back',
    heat: 'Upał',
  },
  en: {
    test: 'Test',
    deload: 'Recovery week',
    mountain_weekend: 'Mountains',
    back_to_back: 'Back-to-back',
    heat: 'Heat',
  },
})

export const PHASE_SHORT: Record<PhaseId, string> = localized({
  pl: {
    PREP: 'Przygotowanie',
    I: 'Faza I',
    II: 'Faza II',
    III: 'Faza III',
    IV: 'Faza IV',
    V: 'Faza V',
    TAPER: 'Taper',
  },
  en: {
    PREP: 'Preparation',
    I: 'Phase I',
    II: 'Phase II',
    III: 'Phase III',
    IV: 'Phase IV',
    V: 'Phase V',
    TAPER: 'Taper',
  },
})

export const PHASE_COLOR: Record<PhaseId, string> = {
  PREP: 'bg-slate-400',
  I: 'bg-amber-500',
  II: 'bg-sky-600',
  III: 'bg-emerald-500',
  IV: 'bg-orange-500',
  V: 'bg-red-500',
  TAPER: 'bg-violet-500',
}

/** Kolory znaczników dnia – te same na ekranie Dziś, w Tygodniu i w Kalendarzu. */
export const FLAG_COLOR: Record<DayFlag, string> = {
  test: 'bg-indigo-600',
  deload: 'bg-teal-600',
  mountain_weekend: 'bg-orange-600',
  back_to_back: 'bg-red-600',
  heat: 'bg-amber-500',
}

/** Kolor paska jazdy wg typu dnia – zgodny z kolorami stref (lekko = Z2, długa = Z3, akcent = próg). */
export const DAY_TYPE_COLOR: Record<DayType, string> = {
  rest: 'bg-slate-300 dark:bg-slate-600',
  easy: 'bg-sky-500',
  long: 'bg-emerald-500',
  key: 'bg-red-500',
  trip: 'bg-purple-700',
}

export const INTENSITY_LABEL: Record<string, string> = localized<string>({
  pl: {
    wu: 'Rozgrzewka',
    active: 'Praca',
    tempo: 'Tempo',
    lt: 'Próg',
    ftp: 'Test',
    map: 'VO2max',
    ac: 'Beztlenowo',
    recover: 'Przerwa',
    cd: 'Schłodzenie',
  },
  en: {
    wu: 'Warm-up',
    active: 'Work',
    tempo: 'Tempo',
    lt: 'Threshold',
    ftp: 'Test',
    map: 'VO2max',
    ac: 'Anaerobic',
    recover: 'Recovery',
    cd: 'Cool-down',
  },
})

export const WEEKDAY_SHORT: Record<string, string> = localized<string>({
  pl: {
    mon: 'Pn',
    tue: 'Wt',
    wed: 'Śr',
    thu: 'Cz',
    fri: 'Pt',
    sat: 'So',
    sun: 'Nd',
  },
  en: {
    mon: 'Mo',
    tue: 'Tu',
    wed: 'We',
    thu: 'Th',
    fri: 'Fr',
    sat: 'Sa',
    sun: 'Su',
  },
})

export const WEEKDAY_LONG: Record<string, string> = localized<string>({
  pl: {
    mon: 'poniedziałek',
    tue: 'wtorek',
    wed: 'środa',
    thu: 'czwartek',
    fri: 'piątek',
    sat: 'sobota',
    sun: 'niedziela',
  },
  en: {
    mon: 'Monday',
    tue: 'Tuesday',
    wed: 'Wednesday',
    thu: 'Thursday',
    fri: 'Friday',
    sat: 'Saturday',
    sun: 'Sunday',
  },
})

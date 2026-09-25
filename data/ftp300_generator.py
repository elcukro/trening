"""
Program „FTP 300” – Ferdynand (drugie konto).

Cel: FTP 235 → 300 W i wyższe VO2max. 40 tygodni od 28.09.2026 do 4.07.2027.
Pięć jazd i jedna siłownia w tygodniu, długa jazda w poniedziałek, trenażer ERG do interwałów zimą.

Biblioteka treningów, ćwiczeń, stref, żywienia i sesji siłowych pochodzi z `reference_generator.py` –
tu definiujemy tylko fazy, szablony tygodni i przypisanie siłowni. Układ tygodni jest stały
(`layout.mode = "fixed"`), więc silnik nie rozciąga faz do daty celu tak jak w programie alpejskim.

Uruchamianie: `python3 data/ftp300_generator.py` (albo `npm run data:generate`).
"""

import datetime as dt
import importlib.util
import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

# import biblioteki z generatora alpejskiego bez odpalania jego `main()`
_spec = importlib.util.spec_from_file_location("reference_generator", os.path.join(HERE, "reference_generator.py"))
gen = importlib.util.module_from_spec(_spec)
_stdout, sys.stdout = sys.stdout, io.StringIO()
_spec.loader.exec_module(gen)
sys.stdout = _stdout

PROGRAM_ID = "ftp300"
PROGRAM_VERSION = "2026.09.25-4"

# dłuższy blok VO2max niż w programie alpejskim (6 powtórzeń) – przy trenażerze ERG da się utrzymać moc
gen.add(gen.interval_workout("VO2_6x3", "VO2max 6×3 min", "vo2max", 6, 3, 3, "Z5b", [85, 95], gen.VO2_DESC, wu=20))

DEFAULT_SETTINGS = {
    "program_start": "2026-09-21",          # tydzień 0 = pomiar (test w niedzielę 27.09), plan właściwy od 28.09
    "trip_start": "2027-06-28",             # data celu: poniedziałek po tygodniu z testem końcowym
    "athlete_name": "Ferdynand",
    "body_weight_start_kg": 73,
    "body_weight_target_kg": 67,
    "bike_and_kit_kg": 9,
    "lthr_bpm": 170,
    "hr_max_bpm": 193,
    "ftp_w_estimate": 235,
    "ftp_w_goal": 300,
    "power_meter": True,                    # ma miernik – cele mocy w planach na Wahoo
    "gym_days": {"A": "sat", "B": "fri", "C": "sat"},   # jedna sesja w tygodniu, w sobotę po spokojnej jazdzie
    "timezone": "Europe/Warsaw",
    "volume_scale": 1.0,
    "units": "metric",
    "language": "pl",
}

PHASES = [
    {"id": "PREP", "name": "Pomiar wejściowy", "goal": "Test FTP na wejściu – wpisane 235 W nie jest jeszcze potwierdzone żadnym maksymalnym wysiłkiem, a od tej liczby zależą wszystkie strefy.", "weeks": [0, 0]},
    {"id": "I", "name": "Faza I – Baza i sweet spot", "goal": "Objętość Z2 z rosnącym blokiem sweet spot. Buduje podłoże, na którym praca progowa ma sens.", "weeks": [1, 11]},
    {"id": "II", "name": "Faza II – Blok progowy", "goal": "Dwa dni jakościowe: interwały progowe w środę, sweet spot w piątek. Tu rośnie FTP.", "weeks": [12, 21]},
    {"id": "III", "name": "Faza III – VO2max", "goal": "Interwały 3-minutowe przy obniżonej objętości. Podnosi pułap, pod którym leży próg.", "weeks": [22, 27]},
    {"id": "IV", "name": "Faza IV – Próg na nowym poziomie", "goal": "Powrót do pracy progowej przy wyższym FTP, z największą objętością programu.", "weeks": [28, 35]},
    {"id": "V", "name": "Faza V – Szczyt", "goal": "Ostatni blok VO2max przy zredukowanej objętości – szlif przed testem.", "weeks": [36, 38]},
    {"id": "TAPER", "name": "Taper i test końcowy", "goal": "Świeże nogi i pomiar, który rozlicza 40 tygodni.", "weeks": [39, 39]},
]

R = ("REST", 0)


def W(phase, type_, mon, wed, thu, fri, sat, gym, notes=None, tue=R, sun=R):
    """Tydzień: poniedziałek długa, wtorek i niedziela wolne, środa i piątek jakościowe, sobota Z2 + siłownia.
    `gym` = (stopień, tydzień-wskazówka dla progresji ciężarów) albo None."""
    return {"phase": phase, "type": type_, "mon": mon, "tue": tue, "wed": wed, "thu": thu, "fri": fri, "sat": sat, "sun": sun,
            "gym_stage": gym[0] if gym else None, "gym_week": gym[1] if gym else None,
            **({"notes": notes} if notes else {})}


def Z2(m):
    return ("Z2", m)


def LONG(m):
    return ("LONG", m)


DELOAD = ("DELOAD_WED", 60)
TEST = ("FTP_TEST", None)

WEEKS = {
    # ---------------------------------------------------------------- PREP: pomiar
    0: W("PREP", "test", R, R, R, Z2(45), R, None, sun=TEST,
         notes="Tydzień pomiarowy: w niedzielę test FTP 20 min, wcześniej tylko lekkie rozjeżdżenie w piątek. Od jego wyniku liczą się wszystkie strefy mocy i tętna. Plan właściwy startuje w poniedziałek 28.09."),
    # ---------------------------------------------------------------- I: baza + sweet spot
    1: W("I", "build", LONG(195), ("SS_2x10", None), Z2(60), Z2(75), Z2(60), ("intro", 2),
         notes="Start bloku bazowego. Długa w poniedziałek ma być nudna – rozmowa pełnymi zdaniami. Jedyny dzień, w którym wolno się zmęczyć, to środa."),
    2: W("I", "build", LONG(210), ("SS_2x12", None), Z2(60), Z2(75), Z2(60), ("I_a", 3)),
    3: W("I", "build", LONG(210), ("SS_2x15", None), Z2(60), Z2(75), Z2(60), ("I_a", 4)),
    4: W("I", "build", LONG(225), ("SS_3x12", None), Z2(60), Z2(75), Z2(60), ("I_a", 5)),
    5: W("I", "deload", LONG(135), DELOAD, Z2(45), R, Z2(60), ("I_a", 5),
         notes="Tydzień lżejszy: żadnych interwałów, piątek wolny. Nogi mają wyjść świeższe niż weszły."),
    6: W("I", "build", LONG(225), ("SS_3x12", None), Z2(60), ("SS_2x10", None), Z2(60), ("I_b", 7),
         notes="Od tego tygodnia dwa dni jakościowe: środa mocniejsza, piątek krótszy blok sweet spot."),
    7: W("I", "build", LONG(240), ("SS_3x15", None), Z2(60), ("SS_2x12", None), Z2(75), ("I_b", 8)),
    8: W("I", "build", LONG(240), ("SS_2x20", None), Z2(60), ("SS_2x12", None), Z2(75), ("I_b", 9)),
    9: W("I", "deload", LONG(150), DELOAD, Z2(45), R, Z2(60), ("I_b", 9)),
    10: W("I", "build", LONG(255), ("SS_3x20", None), Z2(60), ("SS_2x15", None), Z2(75), ("I_b", 9),
          notes="Największy tydzień fazy bazowej: ponad 4 godziny w poniedziałek i godzina pracy w sweet spot w środę."),
    11: W("I", "test", LONG(165), TEST, Z2(45), Z2(60), Z2(60), ("transition", 11),
          notes="Drugi test FTP. Jeśli wzrósł, strefy przeliczą się same – kolejne 10 tygodni pojedziesz na nowych watach."),
    # ---------------------------------------------------------------- II: próg
    12: W("II", "build", LONG(225), ("THR_4x6", None), Z2(60), ("SS_2x15", None), Z2(75), ("II_a", 12),
          notes="Blok progowy. Interwały w środę jadą na 95–100% FTP – pierwsze dwie minuty prowadź po odczuciu, tętno dogania z opóźnieniem. Zimą wszystko schodzi na trenażer."),
    13: W("II", "build", LONG(240), ("THR_4x8", None), Z2(60), ("SS_2x20", None), Z2(75), ("II_a", 13)),
    14: W("II", "build", LONG(240), ("THR_3x12", None), Z2(60), ("SS_3x15", None), Z2(75), ("II_a", 14)),
    15: W("II", "deload", LONG(150), DELOAD, Z2(45), R, Z2(60), ("II_a", 14)),
    16: W("II", "build", LONG(225), ("THR_3x12", None), Z2(60), ("SS_2x20", None), Z2(75), ("II_b", 16)),
    17: W("II", "build", LONG(240), ("THR_3x15", None), Z2(60), ("SS_3x15", None), Z2(75), ("II_b", 17)),
    18: W("II", "build", LONG(255), ("THR_2x20", None), Z2(60), ("SS_3x20", None), Z2(75), ("II_b", 18)),
    19: W("II", "deload", LONG(150), DELOAD, Z2(45), R, Z2(60), ("II_b", 18)),
    20: W("II", "build", LONG(255), ("THR_2x20", None), Z2(60), ("SS_3x20", None), Z2(90), ("II_c", 20),
          notes="Ostatni tydzień bloku progowego – dwa razy 20 minut na progu to najtrudniejsza sesja programu do tej pory."),
    21: W("II", "test", LONG(165), TEST, Z2(45), Z2(60), Z2(60), ("II_c", 21),
          notes="Test FTP po bloku progowym. Tu spodziewam się największego pojedynczego skoku w całym programie."),
    # ---------------------------------------------------------------- III: VO2max
    22: W("III", "build", LONG(195), ("VO2_4x3", None), Z2(45), ("THR_4x8", None), Z2(60), ("II_c", 22),
          notes="Blok VO2max: objętość w dół, intensywność w górę. Interwały 3-minutowe rób równo (RPE 9), nie sprintem na starcie. Trenażer ERG jest tu przewagą – moc trzyma się sama."),
    23: W("III", "build", LONG(195), ("VO2_5x3", None), Z2(45), ("THR_3x12", None), Z2(60), ("II_c", 22)),
    24: W("III", "build", LONG(180), ("VO2_6x3", None), Z2(45), ("THR_3x12", None), Z2(60), ("test", 24)),
    25: W("III", "deload", LONG(135), DELOAD, Z2(45), R, Z2(60), ("test", 24),
          notes="Po bloku VO2max rozładowanie jest obowiązkowe, nie opcjonalne."),
    26: W("III", "build", LONG(195), ("VO2_6x3", None), Z2(45), ("THR_2x20", None), Z2(60), ("III", 25)),
    27: W("III", "test", LONG(165), TEST, Z2(45), Z2(60), Z2(60), ("III", 25),
          notes="Test po bloku VO2max. Nawet jeśli FTP drgnie mniej niż po fazie II, podniesiony pułap zapłaci w następnej fazie."),
    # ---------------------------------------------------------------- IV: próg na nowym poziomie
    28: W("IV", "build", LONG(225), ("THR_3x15", None), Z2(60), ("SS_3x15", None), Z2(75), ("III", 25),
          notes="Największa objętość programu i praca progowa na nowym FTP. Wiosna, więc długie jazdy wracają na zewnątrz."),
    29: W("IV", "build", LONG(240), ("THR_2x20", None), Z2(60), ("SS_3x20", None), Z2(75), ("III", 25)),
    30: W("IV", "build", LONG(255), ("THR_3x15", None), Z2(75), ("SS_3x20", None), Z2(90), ("III", 25)),
    31: W("IV", "deload", LONG(165), DELOAD, Z2(45), R, Z2(60), ("III", 25)),
    32: W("IV", "build", LONG(255), ("THR_2x20", None), Z2(75), ("SS_3x20", None), Z2(90), ("III", 25)),
    33: W("IV", "build", LONG(255), ("THR_3x15", None), Z2(75), ("SS_3x20", None), Z2(90), ("III", 25)),
    34: W("IV", "build", LONG(255), ("THR_2x20", None), Z2(75), ("SS_3x20", None), Z2(90), ("III", 25),
          notes="Szczyt objętości: ponad 4 godziny w poniedziałek, dwa dni jakościowe i 1,5 h w sobotę."),
    35: W("IV", "deload", LONG(165), DELOAD, Z2(45), R, Z2(60), ("III", 25)),
    # ---------------------------------------------------------------- V: szczyt
    36: W("V", "build", LONG(195), ("VO2_5x3", None), Z2(45), ("THR_2x20", None), Z2(60), ("III", 25),
          notes="Ostatni blok VO2max. Objętość schodzi, żeby interwały były naprawdę mocne."),
    37: W("V", "build", LONG(180), ("VO2_6x3", None), Z2(45), ("THR_2x20", None), Z2(60), None),
    38: W("V", "build", LONG(165), ("VO2_6x3", None), Z2(45), ("OPENERS", None), Z2(45), None,
          notes="Siłownia wypada – od teraz wszystko idzie w świeżość na test."),
    # ---------------------------------------------------------------- TAPER
    39: W("TAPER", "taper", LONG(90), TEST, R, Z2(45), Z2(60), None,
          notes="Taper i test końcowy w środę. Rozliczenie 40 tygodni: FTP i W/kg. Po nim ustawiamy następny cel."),
}

DAY_NAMES = gen.DAY_NAMES
BIKE_WORKOUTS = gen.BIKE_WORKOUTS

# ---------------------------------------------------------------- SEKCJE OSOBISTE PROGRAMU (docs/18)
# Ustalone dla Ferdynanda – nie kopiować z programu alpejskiego.
NUTRITION = {
    # Cel mocowy: deficyt tylko w dni lekkie, a jego wielkość silnik dobiera z masy obecnej i docelowej
    # (`weight_based`). W bloku VO2max i przed testem końcowym bez deficytu – jakość interwałów ważniejsza niż waga.
    "deficit_by_phase": {"PREP": True, "I": True, "II": True, "III": False, "IV": True, "V": False, "TAPER": False},
    "protein_g_per_kg": 1.8,
    "heavy_min": 120,
    "medium_min": 60,
    "buckets": {
        "no_deficit": {"energy": "maintenance", "label": "Bilans zerowy – jedz na pełną wydajność"},
        "heavy": {"energy": "maintenance", "label": "Dzień ciężki: bez deficytu, paliwo na trening"},
        "medium": {"energy": "maintenance", "label": "Dzień treningowy: bilans zerowy"},
        "light": {"energy": "deficit_300", "label": "Dzień lekki: deficyt dobrany do masy"},
    },
    "if_above_target_suffix": " (tylko jeśli waga > celu)",
    "carbs_g_per_h": [[90, [60, 80]], [60, [30, 40]]],
    "post_workout": {"min_ride_min": 60, "text": "30–40 g białka + węglowodany w ciągu 1–2 h"},
    # limit 500 kcal na dzień i 0,7 % masy na tydzień – przy tej sylwetce szybciej znaczy kosztem watów;
    # `deficit_days_per_week` uzupełnia main() średnią z tygodni budujących
    "weight_based": {"max_kcal_per_day": 500, "max_loss_pct_per_week": 0.7, "deficit_days_per_week": 0},
}
BIKES = {"default": "Rower", "indoor": "Trenażer (ERG)"}
GOAL = {"kind": "ftp", "label": "FTP 300 W i wyższe VO2max", "short": "FTP 300 W"}
CADENCE = {"floor_rpm": 80, "goal_rpm": 85}   # naturalna kadencja z jego jazd: 85–92 rpm (śr. 88)
META = {
    "name": "FTP 300 – próg i VO2max",
    "short": "FTP 300",
    # data końcowa to poniedziałek po tygodniu z testem końcowym – nie wyjazd
    "target": {"label": "Koniec programu", "short": "koniec", "until": "do końca programu", "today": "Koniec programu – czas na nowy cel", "after": "Program zakończony"},
}
FEATURES = []   # bez wyjazdu; Sprzęt ma każdy – z własnymi rowerami

# Zasady adaptacji (docs/18, krok 2) – układ tygodnia Ferdynanda: pn długa, śr akcent, pt drugi akcent (od tyg. 6),
# sb Z2 + jedyna siłownia, wt i nd wolne. Silnik czyta parametry, człowiek teksty.
RULES = {
    "text": [
        {"id": "R1", "title": "Pominięty akcent", "text": "Środowy albo piątkowy akcent przenieś na najbliższy dzień ze spokojną jazdą, bez siłowni i nie tuż przed kolejnym akcentem. W praktyce: środa → czwartek w tygodniach z jednym akcentem; piątkowy przepada (sobota ma siłownię). Nigdy dwóch akcentów dzień po dniu."},
        {"id": "R2", "title": "Pominięta poniedziałkowa długa jazda", "text": "Przepada – wtorek jest wolny i ma nim zostać, a środa to akcent. Nie dokładaj jej w weekend."},
        {"id": "R3", "title": "Pominięta sesja siłowa", "text": "Jedyna sesja w tygodniu przepada – w niedzielę odpoczywasz, a w poniedziałek jest długa jazda. W przyszłym tygodniu wracasz do planu."},
        {"id": "R4", "title": "Gołoledź, śnieg, poniżej −5 °C", "text": "Wszystko na trenażer w ERG: akcent bez zmian, Z2 45–60 min, długa jazda 90 min."},
        {"id": "R5", "title": "Choroba", "text": "Gorączka lub objawy „poniżej szyi” → zero treningu. Katar bez gorączki → tylko Z1 do 45 min, bez siłowni. Po ≥ 3 dniach przerwy: 2 dni krótkiego Z2 przed akcentem."},
        {"id": "R6", "title": "Słaby poranny check-in", "text": "Tętno spoczynkowe > średnia 7-dniowa + 7 bpm dwa dni z rzędu albo suma ocen (sen + nogi + motywacja) ≤ 6 → obniż dzień: akcent → Z2 60 min, siłownia lżejsza (−1 seria, RIR +1)."},
        {"id": "R7", "title": "Rower ma pierwszeństwo", "text": "Jeśli 2 tygodnie z rzędu akcent „nie wyszedł” (RPE ≥ 9 przy niewykonanych celach) → −1 seria w sesji siłowej do końca bloku."},
        {"id": "R8", "title": "Progresja ciężarów", "text": "Wszystkie serie z zadanym RIR → +2,5 kg (sztanga), +1–2 kg na hantel. 1 seria z brakiem → ten sam ciężar. ≥ 2 serie z brakami drugi raz z rzędu → −10%. Rozładowanie: −10% ciężaru, −40% serii, RIR +1."},
        {"id": "R9", "title": "48 h ochrony", "text": "Brak siłowni nóg w ciągu 48 h przed testem FTP. Przy naruszeniu: ostrzeżenie i propozycja przeniesienia albo zamiany na core."},
        {"id": "R10", "title": "Masa ciała", "text": "Deficyt tylko w dni lekkie, dobrany z masy obecnej i docelowej: najwyżej 500 kcal na dzień i 0,7% masy na tydzień. W bloku VO2max, w fazie szczytu i przed testem końcowym – bez deficytu. Spadek FTP w teście przy redukcji → pauza w deficycie."},
        {"id": "R11", "title": "Nowy wynik testu", "text": "Strefy mocy i tętna przeliczone od następnego dnia; aplikacja pokazuje różnicę względem poprzedniego testu."},
        {"id": "R12", "title": "Tydzień rozładowania", "text": "Co 4–5 tygodni: środa DELOAD_WED zamiast interwałów, piątek wolny, długa krótsza. Siła: −40% serii, −10% ciężaru, RIR +1."},
        {"id": "R13", "title": "Upał > 28 °C", "text": "Cele tętna Z2–SS obniżone o 3–5 bpm, picie 750 ml/h + elektrolity, przy VO2 skróć do 4 powtórzeń."},
        {"id": "R14", "title": "Program o stałej długości", "text": "40 tygodni po kolei od tygodnia pomiarowego (21.09.2026). Data celu nie rozciąga ani nie skraca faz."},
        {"id": "R15", "title": "Zamiana dni", "text": "Dozwolona w obrębie tygodnia. Walidacja: brak dwóch akcentów dzień po dniu i siłowni nóg 48 h przed testem."},
        {"id": "R16", "title": "Skalowanie objętości", "text": "Ustawienie 0,7–1,0 skraca jazdy Z2 i długie (min. 45 min dla Z2, 90 min dla długiej). Akcenty i testy bez zmian."},
    ],
    "hierarchy": [
        "Środowy akcent",
        "Poniedziałkowa długa jazda",
        "Piątkowy akcent",
        "Siłownia w sobotę",
        "Sobotnie Z2",
        "Czwartkowe Z2",
    ],
    "tests": [
        {
            "id": "FTP_TEST",
            "name": "Test FTP (20 min, moc)",
            "when": "tydz. 0 (niedziela 27.09), 11, 21, 27 i 39 (środa)",
            "protocol": "Rozgrzewka z krótkimi przyspieszeniami, potem 20 min maksymalnie równego wysiłku – najlepiej na trenażerze w trybie wolnym (nie ERG), zawsze w tych samych warunkach. Pierwsze 5 min nie za mocno.",
            "result": "FTP = 0,95 × średnia moc z 20 min; tętno progowe = średnie tętno z ostatnich 10 min.",
        },
    ],
    # jedyna sesja w tygodniu – nie ma dnia, na który dałoby się ją przenieść bez szkody dla poniedziałkowej długiej
    "gym_catchup": {"A": "drop", "B": "drop", "C": "drop"},
    "long_catchup_onto": [],
    "deload_note": "Tydzień lżejszy: bez interwałów, piątek wolny, długa krótsza. Na siłowni ciężar −10%, serie −40%, RIR +1. Nogi mają wyjść świeższe.",
}


def gym_for(wk, weekday):
    """Jedna sesja w tygodniu: Sesja A (siła nóg) w dniu z `gym_days.A`. Slot w programie to „wed”,
    aplikacja mapuje go na sobotę przez ustawienie – tak samo jak w programie alpejskim."""
    stage = wk.get("gym_stage")
    if not stage or weekday != DEFAULT_SETTINGS["gym_days"]["A"]:
        return None
    s = gen.sess_A(stage, wk["gym_week"])
    return gen.deloadify(s) if wk["type"] == "deload" else s


def build_calendar(settings=DEFAULT_SETTINGS):
    # tydzień 0 to pierwszy tydzień programu (układ „fixed”), inaczej niż w programie alpejskim
    week0 = dt.date.fromisoformat(settings["program_start"])
    days = []
    for wno in sorted(WEEKS):
        wk = WEEKS[wno]
        monday = week0 + dt.timedelta(weeks=wno)
        for i, dn in enumerate(DAY_NAMES):
            date = monday + dt.timedelta(days=i)
            wid, dur = wk[dn] or ("REST", 0)
            w = BIKE_WORKOUTS[wid]
            if dur is None:
                dur = w["duration_min"]
            gym = gym_for(wk, dn)
            key = w.get("key", False) or wid.startswith(("SS_", "THR_", "VO2_", "TEST", "WATTBIKE", "FTP"))
            fallback = "INDOOR_4x4" if (wk["phase"] == "II" and wid.startswith(("SS_", "THR_"))) else None
            if wid == "FTP_TEST" and wk["phase"] == "II":
                fallback = "WATTBIKE_TEST"
            if wid == "REST":
                day_type = "gym" if gym else "rest"
            else:
                day_type = "key" if key else ("long" if dur >= 120 else "easy")
            flags = []
            if wid.startswith(("TEST", "WATTBIKE", "FTP")):
                flags.append("test")
            if wk["type"] == "deload":
                flags.append("deload")
            bike_name = gen.bike_suggestion(BIKES, wk["phase"], wid)
            days.append({
                "date": date.isoformat(), "weekday": dn, "week": wno, "phase": wk["phase"], "week_type": wk["type"],
                "day_type": day_type,
                "bike": None if wid == "REST" else {"workout_id": wid, "name": w["name"], "duration_min": dur,
                                                    "bike": bike_name, "fallback_workout_id": fallback},
                "gym": None if not gym else {"session": gym["session"], "name": gym["name"], "est_min": gym["est_min"], "items": gym["items"]},
                "nutrition": gen.nutrition_for(NUTRITION, wk["phase"], day_type, 0 if wid == "REST" else dur, key),
                "flags": flags,
                # silnik dokłada uwagi tygodnia tylko do poniedziałku – trzymamy się tego samego
                **({"week_notes": wk["notes"]} if (wk.get("notes") and dn == "mon") else {}),
            })
    return days


def main():
    days = build_calendar()
    # średnia liczba dni z deficytem w tygodniach budujących – mianownik doboru deficytu z masy
    build = [w for w, t in WEEKS.items() if t["type"] == "build" and NUTRITION["deficit_by_phase"].get(t["phase"])]
    per_week = [sum(1 for d in days if d["week"] == w and d["nutrition"]["energy"].startswith("deficit")) for w in build]
    NUTRITION["weight_based"]["deficit_days_per_week"] = round(sum(per_week) / len(per_week), 1)
    weeks_out = {}
    for k, v in WEEKS.items():
        t = {kk: vv for kk, vv in v.items() if kk != "gym_week"}
        weeks_out[str(k)] = t
    program = {
        "version": PROGRAM_VERSION,
        "meta": META,
        "nutrition": NUTRITION,
        "bikes": BIKES,
        "goal": GOAL,
        "cadence": CADENCE,
        "rules": RULES,
        "features": FEATURES,
        "default_settings": {**DEFAULT_SETTINGS, "program_id": PROGRAM_ID},
        "hr_zones_lthr_fraction": gen.HR_ZONES,
        "power_zones_ftp_fraction": gen.POWER_ZONES,
        "phases": PHASES,
        "bike_workouts": BIKE_WORKOUTS,
        "exercises": gen.EX,
        "gym_prescription_stages": {
            "intro": "tydz. 0–1 (wdrożenie, RIR 4)", "I_a": "tydz. 2–5", "I_b": "tydz. 6–10",
            "transition": "tydz. 11", "II_a": "tydz. 12–15", "II_b": "tydz. 16–19", "II_c": "tydz. 20–23",
            "test": "tydz. 24–25", "III": "tydz. 26–36 (podtrzymanie siły)"},
        "weeks": weeks_out,
        "gym_prescriptions": {str(k): {"wed": g} for k, v in WEEKS.items() if (g := gym_for(v, DEFAULT_SETTINGS["gym_days"]["A"]))},
        "week_summary": gen.week_table(days),
        "layout": {"mode": "fixed"},
    }
    with open(os.path.join(HERE, f"program-{PROGRAM_ID}.json"), "w", encoding="utf-8") as f:
        json.dump(program, f, ensure_ascii=False, indent=1)
    with open(os.path.join(HERE, f"calendar-{PROGRAM_ID}.json"), "w", encoding="utf-8") as f:
        json.dump({"version": PROGRAM_VERSION, "settings": program["default_settings"], "days": days}, f, ensure_ascii=False, indent=1)
    print(f"{PROGRAM_ID}: dni {len(days)}, od {days[0]['date']} do {days[-1]['date']}, tygodni {len(WEEKS)}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Referencyjny generator programu treningowego (źródło prawdy dla danych).

Tworzy:
  data/program.json   – definicje: strefy, treningi rowerowe, ćwiczenia, sesje siłowe,
                        preskrypcje siłowe per tydzień (gym_prescriptions), tabela tygodni sezonu
  data/calendar.json  – kalendarz dzień po dniu dla ustawień domyślnych
                        (start 14.09.2026, wyjazd 11.09.2027)

Aplikacja powinna zaimplementować tę samą logikę w TypeScript (silnik planu),
a calendar.json służy jako "golden file" do testów jednostkowych.

Uruchom: python3 data/reference_generator.py
"""
import json, datetime as dt, os, copy

HERE = os.path.dirname(os.path.abspath(__file__))
D = dt.date
PROGRAM_VERSION = "2026.09.25-3"

DEFAULT_SETTINGS = {
    "program_start": "2026-09-14",          # poniedziałek tygodnia 1
    "trip_start": "2027-09-11",             # pierwszy dzień wyjazdu w Alpy (sobota)
    "athlete_name": "Luke",
    "body_weight_start_kg": 110,            # zmierzone we wrześniu 2026 (plan z 20.09: 110 → 102 kg do końca lutego)
    "body_weight_target_kg": 90,
    "bike_and_kit_kg": 12,
    "lthr_bpm": None,                       # z pierwszego testu (tydz. 1)
    "hr_max_bpm": None,
    "ftp_w_estimate": 220,                  # szacunek 200–240 W, brak miernika mocy
    "ftp_w_goal": 250,
    "power_meter": False,                   # True → cele mocy w planach na Wahoo (ELEMNT nie obsługuje celów tętna)
    "gym_days": {"A": "wed", "B": "fri", "C": "wed"},  # alternatywa: A=tue, B=fri
    "timezone": "Europe/Warsaw",
    "volume_scale": 1.0,                    # 0.7–1.0: skaluje czas jazd niekluczowych (Z2, długie, pagórki)
    "units": "metric",
    "language": "pl",
}

# ---------------------------------------------------------------- STREFY
HR_ZONES = [  # jako ułamek LTHR (tętno progowe)
    {"id": "Z1",  "name": "Regeneracja",            "low": 0.00, "high": 0.81, "rpe": [1, 2]},
    {"id": "Z2",  "name": "Wytrzymałość (baza)",    "low": 0.81, "high": 0.89, "rpe": [3, 4]},
    {"id": "Z3",  "name": "Tempo",                  "low": 0.90, "high": 0.93, "rpe": [5, 6]},
    {"id": "SS",  "name": "Sweet spot",             "low": 0.92, "high": 0.96, "rpe": [6, 7]},
    {"id": "Z4",  "name": "Podprogowa",             "low": 0.94, "high": 0.99, "rpe": [7, 8]},
    {"id": "THR", "name": "Progowa (interwały)",    "low": 0.95, "high": 1.00, "rpe": [7, 8]},
    {"id": "Z5a", "name": "Nadprogowa",             "low": 1.00, "high": 1.02, "rpe": [8, 9]},
    {"id": "Z5b", "name": "VO2max",                 "low": 1.03, "high": 1.06, "rpe": [9, 9]},
    {"id": "Z5c", "name": "Beztlenowa",             "low": 1.06, "high": 1.15, "rpe": [10, 10]},
]
POWER_ZONES = [  # jako ułamek FTP – na przyszłość (miernik mocy)
    {"id": "Z1", "low": 0.00, "high": 0.55}, {"id": "Z2", "low": 0.56, "high": 0.75},
    {"id": "Z3", "low": 0.76, "high": 0.90}, {"id": "SS", "low": 0.88, "high": 0.94},
    {"id": "Z4", "low": 0.91, "high": 1.05}, {"id": "THR", "low": 0.95, "high": 1.00},
    {"id": "Z5b", "low": 1.06, "high": 1.20}, {"id": "Z5c", "low": 1.21, "high": 1.50},
]
ZONE_BY_ID = {z["id"]: z for z in HR_ZONES}

# ---------------------------------------------------------------- PARAMETRY OSOBISTE BIBLIOTEKI
# Domyślnie wartości standardowe. Program alpejski (main() niżej) nadpisuje je pod konkretnego zawodnika
# PRZED zbudowaniem biblioteki. Inne programy importują ten moduł i dostają wersję standardową –
# ustalenia z danych jednej osoby (np. kadencja) nie mogą wyciekać na inne konta.
CAD_EASY = [85, 95]          # jazdy spokojne, rozgrzewki, przerwy w interwałach, testy
CAD_CD = [90, 100]           # schłodzenie
Z2_NOTE = "Kadencja 85–95."
TEST_NOTE = ""

# ---------------------------------------------------------------- KROKI TRENINGU
def step(name, minutes, zone, intensity="active", cadence=None, note=None, rpe=None):
    z = ZONE_BY_ID[zone]
    s = {"name": name, "duration_s": int(minutes * 60), "zone": zone,
         "target": {"type": "threshold_hr", "low": z["low"], "high": z["high"]},
         "rpe": rpe or z["rpe"], "intensity_type": intensity}
    if cadence: s["cadence_rpm"] = cadence
    if note: s["note"] = note
    return s

def repeat(times, steps):
    return {"repeat": times, "steps": steps}

WU = lambda m=15: step("Rozgrzewka", m, "Z2", "wu", CAD_EASY, "Stopniowo od Z1 do górnej Z2; ostatnie 3 min z 2×20 s przyspieszenia.")
CD = lambda m=10: step("Schłodzenie", m, "Z1", "cd", CAD_CD)

def total_s(steps):
    t = 0
    for s in steps:
        if "repeat" in s: t += s["repeat"] * total_s(s["steps"])
        else: t += s["duration_s"]
    return t

HR_LAG = "Pierwsze 2–3 min interwału prowadź po odczuciu (RPE) – tętno dogania wysiłek z opóźnieniem. Nie goń tętna na starcie."

def interval_workout(wid, name, category, reps, work_min, rec_min, zone, cadence, description, wu=15, cd=10, extra_before=None):
    steps = [WU(wu)]
    if extra_before: steps += extra_before
    steps.append(repeat(reps, [step(f"Interwał {work_min} min", work_min, zone, "lt" if zone in ("THR", "Z4") else ("map" if zone == "Z5b" else "active"), cadence, HR_LAG),
                               step("Przerwa", rec_min, "Z1", "recover", CAD_EASY)]))
    steps.append(CD(cd))
    return {"id": wid, "name": name, "category": category, "key": True, "steps": steps,
            "duration_min": round(total_s(steps) / 60), "description": description}

BIKE_WORKOUTS = {}
def add(w): BIKE_WORKOUTS[w["id"]] = w

# Kadencja na jazdach spokojnych celowo szeroka: zawodnik ma mocne nogi i naturalnie kręci ~80 rpm,
# a wymuszanie 90 podnosi mu tętno przy tej samej mocy. Pracę nad kadencją robimy w Z2_CADENCE, nie na każdej jeździe.
def endurance(wid, name, minutes, zone="Z2", desc="", category="endurance", cadence=None, key=False, extras=None):
    steps = [step(name, minutes, zone, "active", list(cadence or CAD_EASY), desc)]
    w = {"id": wid, "name": name, "category": category, "key": key, "steps": steps,
         "duration_min": minutes, "description": desc, "parametric_duration": True}
    if extras: w.update(extras)
    return w

SS_DESC = "Sweet spot: mocno, ale kontrolowanie (RPE 6–7), tętno 92–96% LTHR. Na podjeździe lub płaskim bez przerw na skrzyżowania. Kadencja 80–90."
THR_DESC = "Interwały progowe pod górę (lub pod wiatr): RPE 7–8, tętno 95–100% LTHR pod koniec interwału. Kadencja 75–85 – jak na alpejskim podjeździe, na miękkim przełożeniu."
VO2_DESC = "VO2max: 3 min mocno, ale równo (RPE 9) – nie sprint na starcie. Tętno dojdzie do 103–106% LTHR dopiero w końcówce kolejnych powtórzeń. Przerwa 3 min bardzo luźno."


def build_library():
    """Buduje bibliotekę treningów z aktualnych PARAMETRÓW OSOBISTYCH. Wywołaj ponownie po ich zmianie."""
    BIKE_WORKOUTS.clear()
    add(endurance("REST", "Odpoczynek", 0, "Z1", "Pełny dzień wolny. Spacer, sen, rozciąganie zginaczy bioder 5 min.", "rest"))
    add(endurance("Z1_RECOVERY", "Jazda regeneracyjna", 45, "Z1", "Bardzo luźno, miękki bieg, bez podjazdów. Opcjonalna – jeśli nogi są ciężkie, lepiej odpocząć.", "recovery", (90, 100)))
    add(endurance("Z2", "Baza tlenowa Z2", 60, "Z2", f"Równe tempo w Z2, możesz rozmawiać pełnymi zdaniami. {Z2_NOTE} Bez zatrzymywania się w chłodzie.", "endurance"))
    z2c = endurance("Z2_CADENCE", "Z2 + praca nad kadencją", 60, "Z2",
                    "Z2 z blokiem kadencji: w środku jazdy 5×2 min przy 100–110 rpm (tętno nadal w Z2) / 2 min swobodnie. Celem nie jest zmiana stylu jazdy, tylko zapas: na trzeciej godzinie nogi siadają wcześniej niż oddech i wtedy wyższa kadencja ratuje tempo.",
                    # W planie tego zawodnika nieużywany (patrz docs/13 § 24.09.2026): jego ograniczeniem jest układ
                    # oddechowo-sercowy, a wysoka kadencja przenosi koszt właśnie na niego. Trening zostaje w bibliotece.
                    "endurance", extras={"insert": repeat(5, [
                        step("Wysoka kadencja 100–110 rpm", 2, "Z2", "active", [100, 110], "Lżejszy bieg, kręcisz szybciej – nie mocniej. Biodra spokojne, bez podskakiwania w siodle."),
                        step("Swobodnie", 2, "Z2", "recover", CAD_EASY)])})
    add(z2c)
    add(endurance("Z2_FORCE", "Z2 + siła na niskiej kadencji", 75, "Z2", "Z2 z blokami siły: 4×5 min w górnej Z2/dolnej Z3 na twardym biegu przy 55–65 rpm (siedząc, tułów spokojny, nacisk przez całe koło) / 5 min Z2 swobodnie. Buduje siłę specyficzną bez dodatkowego zmęczenia układu krążenia. Kolana bez bólu – inaczej wyższa kadencja.", "endurance", extras={"insert": repeat(4, [step("Siła 55–65 rpm", 5, "Z3", "active", [55, 65], "Twardy bieg, siedząc; tętno może zostać w Z2 – liczy się nacisk na pedał."), step("Z2 swobodnie", 5, "Z2", "recover", CAD_EASY)])}))
    add(endurance("Z2_HEAT", "Z2 w upale (adaptacja cieplna)", 75, "Z2", "Jazda w najcieplejszej porze dnia (≥25 °C). Tętno w Z2 – prędkość będzie niższa, to normalne. 750 ml płynu/h + elektrolity. Przerwij przy zawrotach głowy.", "endurance"))
    add(endurance("LONG", "Długa jazda", 150, "Z2", "Główny trening objętościowy. Z2, podjazdy spokojnie (max górna Z3). Jedz od 45. minuty: 60–80 g węglowodanów/h, 500–750 ml/h. Na płaskich prostych ćwicz pozycję z przedramionami równolegle do ziemi.", "long"))
    add(endurance("LONG_TEMPO", "Długa jazda z tempem 30 km/h", 210, "Z2", "Z2 z blokiem tempa: w środku jazdy 3×15 min w Z3 (cel 30–32 km/h na płaskim, pozycja aero na klamkach, kadencja 88–95) / 5 min Z2. Jedzenie jak w długiej jeździe.", "long", extras={"insert": repeat(3, [step("Tempo 30–32 km/h", 15, "Z3", "tempo", [88, 95]), step("Z2", 5, "Z2", "recover", CAD_EASY)])}))
    add(endurance("HILLS", "Pagórki / gravel", 105, "Z2", "Teren pofałdowany lub szuter. Podjazdy w Z3 na miękkim przełożeniu (kadencja 75–85), zjazdy i płaskie w Z2. Bez „mielenia” na twardym biegu.", "hills"))
    add(endurance("DELOAD_WED", "Tydzień lżejszy: Z2 z pobudzeniem", 60, "Z2", "60 min Z2, w środku 3×1 min Z3–Z4 z 3 min luzu. Nogi mają wyjść świeższe.", "endurance"))

    # --- test progowy
    test_steps = [WU(15), step("Luźno przed testem", 5, "Z1", "recover"),
                  step("TEST 30 min – maksymalny równy wysiłek", 30, "THR", "ftp", CAD_EASY,
                       "Samotnie, płaska trasa lub równy lekki podjazd, zawsze ta sama. Pierwsze 5 min nie za mocno. LTHR = średnie tętno z minut 10–30. Zapisz też prędkość średnią, rower, temperaturę, wiatr.", [9, 9]),
                  CD(10)]
    add({"id": "TEST_LTHR", "name": "Test progowy 30 min (LTHR)", "category": "test", "key": True, "steps": test_steps,
         "duration_min": round(total_s(test_steps) / 60),
         "description": "Test Friela: 30 min maksymalnego równego wysiłku w pojedynkę. LTHR = średnie tętno z ostatnich 20 min. Po teście aplikacja przelicza strefy. Zimą (tydz. 16, 24) domyślnie wariant WATTBIKE_TEST.",
         "result_fields": ["avg_hr_last20", "avg_speed_kmh", "distance_km", "route", "bike", "temp_c", "wind", "notes"],
         "alternative": "WATTBIKE_TEST"})
    wb_steps = [WU(15), step("Luźno", 5, "Z1", "recover"),
                step("TEST 20 min all-out (Wattbike)", 20, "Z5a", "ftp", [85, 100], "Równy maksymalny wysiłek. FTP = 95% średniej mocy. LTHR ≈ 97% średniego tętna z 20 min.", [9, 10]), CD(10)]
    add({"id": "WATTBIKE_TEST", "name": "Test 20 min na Wattbike (FTP + LTHR)", "category": "test", "key": True, "steps": wb_steps,
         "duration_min": round(total_s(wb_steps) / 60),
         "description": "Wariant na siłowni (zima, gołoledź) lub dodatkowo do testu terenowego. Daje FTP w watach: FTP = 0,95 × średnia moc z 20 min; LTHR ≈ 0,97 × średnie tętno.",
         "result_fields": ["avg_power_w", "avg_hr", "notes"]})

    ftp_steps = [step("Rozgrzewka", 20, "Z2", "wu", CAD_EASY, "Z2; w środku 3×1 min z kadencją 100 rpm."),
                 step("5 min mocno", 5, "Z4", "lt", CAD_EASY, "Mocno, ale nie do upadku – otwiera nogi przed testem."),
                 step("Luz", 10, "Z1", "recover", CAD_EASY),
                 step("TEST 20 min – maksymalnie równo", 20, "Z5a", "ftp", CAD_EASY,
                      f"Płaska, prosta trasa bez świateł, zawsze ta sama.{TEST_NOTE} Najczęstszy błąd: wystrzelić na starcie – pierwsze 5 min świadomie wolniej niż chcesz. FTP = 95% średniej mocy. Tętno progowe = średnie HR z ostatnich 10 min.", [9, 10]),
                 CD(10)]
    add({"id": "FTP_TEST", "name": "Test FTP 20 min (moc)", "category": "test", "key": True, "steps": ftp_steps,
         "duration_min": round(total_s(ftp_steps) / 60),
         "description": "Test progowy z miernikiem mocy: 20 min maksymalnie równo. FTP = 0,95 × średnia moc, tętno progowe = średnie tętno z ostatnich 10 min. Bez miernika: wariant terenowy po tętnie (TEST_LTHR) albo Wattbike na siłowni. Powtarzaj co 6 tygodni – strefy mocy licz z wyniku, nie ze starych ustawień.",
         "result_fields": ["avg_power_w", "avg_hr_last10", "avg_speed_kmh", "route", "bike", "temp_c", "wind", "notes"],
         "alternative": "WATTBIKE_TEST"})

    for reps, m, rec in [(2, 10, 5), (2, 12, 5), (3, 10, 5), (2, 15, 5), (3, 12, 5), (3, 15, 5), (2, 20, 5), (3, 20, 5)]:
        add(interval_workout(f"SS_{reps}x{m}", f"Sweet spot {reps}×{m} min", "sweet_spot", reps, m, rec, "SS", [80, 90], SS_DESC))
    for reps, m, rec in [(4, 6, 4), (4, 8, 4), (3, 12, 5), (3, 15, 5), (2, 20, 6)]:
        add(interval_workout(f"THR_{reps}x{m}", f"Próg pod górę {reps}×{m} min", "threshold", reps, m, rec, "THR", [75, 85], THR_DESC))
    for reps in (5, 4):
        add(interval_workout(f"VO2_{reps}x3", f"VO2max {reps}×3 min", "vo2max", reps, 3, 3, "Z5b", [85, 95], VO2_DESC, wu=20))
    add(interval_workout("INDOOR_4x4", "Wersja pod dachem: 4×4 min (Wattbike/rowerek)", "indoor", 4, 4, 3, "Z5b", [85, 95],
                         "Na gołoledź, śnieg lub mróz poniżej −5 °C. Zastępuje środowy akcent. Po nim Sesja A na siłowni.", wu=10, cd=5))
    cr_steps = [WU(20), repeat(8, [step("Podjazd tempem", 5, "Z4", "lt", [75, 85], "Najdłuższy lokalny podjazd. Tętno max 85% HRmax (~94–99% LTHR). Równe tempo, siedząc."),
                                   step("Zjazd / powrót", 4, "Z1", "recover")]), CD(15)]
    add({"id": "CLIMB_REPEATS", "name": "Powtórzenia podjazdu 6–10×", "category": "threshold", "key": True, "steps": cr_steps,
         "duration_min": round(total_s(cr_steps) / 60),
         "description": "Symulacja długiej wspinaczki: 6–10 powtórzeń najdłuższego podjazdu w okolicy pod rząd. Ćwicz jedzenie co 20 min i równe tempo."})
    add({"id": "OPENERS", "name": "Pobudzenie przed wyjazdem", "category": "taper", "key": False,
         "steps": [WU(15), repeat(3, [step("Tempo 3 min", 3, "Z4", "lt", [85, 95]), step("Luźno", 3, "Z1", "recover")]),
                   repeat(5, [step("Przyspieszenie 30 s", 0.5, "Z5b", "ac", [95, 110], rpe=[8, 9]), step("Luźno 90 s", 1.5, "Z1", "recover")]), CD(10)],
         "duration_min": 60, "description": "Taper: krótko i świeżo. Objętość tygodnia −40%, intensywność tylko w krótkich pobudzeniach."})
    add(endurance("MOUNTAIN_DAY", "Dzień w górach", 240, "Z2", "Długie podjazdy: start 10–15 uderzeń poniżej progu, kadencja 72–85 na 40/50, jedzenie co 20 min (70–80 g węgli/h), picie 500–750 ml/h. Zjazdy: pozycja nisko, hamowanie pulsacyjne (mocno–puść), nigdy ciągłe. Test sprzętu: przełożenia, klocki, sakwy.", "mountain", cadence=(72, 85), key=True))
    add(endurance("B2B_DAY", "Blok back-to-back", 300, "Z2", "120 km z przewyższeniem 1000–1200 m. Z2, podjazdy maks. górna Z3. Następnego dnia to samo – uczysz się jechać zmęczony. Jedzenie 60–80 g węgli/h od pierwszej godziny.", "long", key=True))
    add(endurance("BLOCK_DAY1", "Blok 3-dniowy – dzień 1", 240, "Z2", "100 km spokojnie w Z2. Otwiera 3-dniowy blok symulujący wyjazd (pt–nd), najlepiej z docelowym bagażem.", "long", key=True))
    add(endurance("TRIP", "Wyjazd w Alpy", 0, "Z2", "Dzień wyjazdu. Pacing, jedzenie i hamowanie wg Części „Strategia na przełęcz”.", "trip"))
    add(endurance("TRAVEL_REST", "Odpoczynek / dojazd", 0, "Z1", "Dojazd w góry lub pakowanie. Bez treningu albo 20–30 min bardzo luźno.", "rest"))


build_library()

# ---------------------------------------------------------------- ĆWICZENIA
EX = {}
def ex(eid, name, pattern, equipment, cues, why, alternatives=None, unit="kg", per_side=False):
    EX[eid] = {"id": eid, "name": name, "pattern": pattern, "equipment": equipment, "cues": cues,
               "why": why, "alternatives": alternatives or [], "load_unit": unit, "per_side": per_side}

ex("back_squat", "Przysiad ze sztangą na plecach", "squat", ["sztanga", "stojak"],
   ["Stopy na szerokość bioder–barków, palce lekko na zewnątrz.", "Biodro co najmniej do wysokości kolana.",
    "Kolana w linii palców, nie do środka.", "Wdech w brzuch i napięcie tułowia przed zejściem; wydech po minięciu najtrudniejszego punktu.",
    "Tempo 3-0-X: 3 s w dół, w górę z maksymalną intencją szybkości."],
   "Siła maksymalna nóg – każdy obrót korby to mniejszy % Twoich możliwości, mniej zmęczenia na godzinnym podjeździe.",
   ["Przysiad do skrzyni (ból kolana)", "Wypychanie na suwnicy"])
ex("rdl", "Martwy ciąg rumuński (RDL)", "hinge", ["sztanga"],
   ["Kolana lekko ugięte i „zamrożone”.", "Biodra jadą do tyłu, sztanga sunie po udach.",
    "Schodzisz do mocnego rozciągnięcia tyłu uda (zwykle połowa piszczeli).", "Plecy neutralne przez cały ruch."],
   "Tylna taśma (pośladki, dwugłowe) – napęd na podjazdach i zdrowe lędźwie w pozycji kolarskiej.", ["Hip thrust + wyprosty (ból lędźwi)"])
ex("trap_bar_deadlift", "Martwy ciąg z trap bar", "hinge", ["sztanga heksagonalna"],
   ["Wysokie uchwyty.", "Biodra wyżej niż w przysiadzie.", "„Odpychasz podłogę” nogami, plecy neutralne.", "Wydech na górze, pełny wyprost bioder bez odchylania."],
   "Najbezpieczniejszy ciężki martwy ciąg dla kolarza – duża siła nóg i bioder przy małym obciążeniu lędźwi.", ["RDL", "Hip thrust"])
ex("db_row", "Wiosłowanie hantlem jednorącz", "pull", ["hantel", "ławka"],
   ["Podparcie o ławkę, plecy równolegle do podłogi.", "Łokieć sunie wzdłuż żeber.", "Tułów się nie obraca."],
   "Mięśnie, które trzymają Cię na kierownicy przez 4 h.", per_side=True)
ex("calf_raise", "Wspięcia na palce stojąc", "calf", ["maszyna lub Smith"],
   ["Pięta nisko pod krawędzią stopnia.", "Pauza 1 s na górze.", "Pełny zakres ruchu."],
   "Łydki i ścięgna Achillesa – jazda na stojąco i długie podjazdy.")
ex("pallof_press", "Pallof press", "core_antirotation", ["wyciąg lub guma"],
   ["Stoisz bokiem do wyciągu.", "Wypychasz rękojeść przed klatkę i trzymasz 2 s.", "Tułów nie daje się obrócić."],
   "Stabilny tułów – moc nie ucieka w bujanie na siodle.", unit="reps", per_side=True)
ex("dead_bug", "Dead bug", "core", ["mata"],
   ["Lędźwie przyklejone do podłogi.", "Przeciwna ręka i noga powoli w dół.", "Wydech przy wyproście."],
   "Kontrola miednicy i żeber – podstawa pozycji aero.", unit="reps", per_side=True)
ex("side_plank", "Plank bokiem", "core", ["mata"], ["Ciało w jednej linii.", "Biodro wysoko."], "Mięśnie skośne – stabilizacja przy jeździe na stojąco.", unit="s", per_side=True)
ex("step_up", "Wejścia na skrzynię z hantlami", "single_leg", ["skrzynia 40–50 cm", "hantle"],
   ["Udo ok. poziomo przy stopie na skrzyni.", "Pchasz wyłącznie nogą na skrzyni – tylna się nie odbija.", "Schodzisz powoli."],
   "Najbardziej „kolarskie” ćwiczenie: jedna noga, kąt kolana jak w górnym punkcie korby.", per_side=True)
ex("bulgarian_split_squat", "Przysiad bułgarski", "single_leg", ["hantle", "ławka"],
   ["Tylna stopa na ławce.", "Ciężar głównie na przedniej nodze.", "Tułów lekko pochylony – mocniej pracują pośladki."],
   "Wyrównuje różnice siły między nogami.", per_side=True)
ex("hip_thrust", "Hip thrust ze sztangą", "hinge", ["sztanga", "ławka", "podkładka"],
   ["Plecy oparte o ławkę.", "Broda do klatki, żebra w dół.", "Pauza 2 s na górze, ruch z pośladków, nie z lędźwi."],
   "Pośladki to główny silnik przy jeździe w siodle pod górę.")
ex("pull_up", "Podciąganie nachwytem", "pull", ["drążek", "guma asekuracyjna"],
   ["Pełny zwis, łopatki w dół na starcie.", "Klatka do drążka, bez bujania."],
   "Plecy i ramiona do trzymania pozycji na klamkach.", ["Ściąganie drążka wyciągu (jeśli < 5 powtórzeń)"], unit="reps")
ex("push_up", "Pompki", "push", ["podłoga"], ["Ciało w jednej linii.", "Łokcie ok. 45° od tułowia."],
   "Równoważy „zamkniętą” pozycję na rowerze – postawa, nie siła.", ["Wyciskanie hantli na ławce skośnej"], unit="reps")
ex("farmer_walk", "Spacer farmera", "carry", ["hantle lub kettlebell"],
   ["Hantle łącznie ok. 0,6–0,8 × masa ciała.", "Idziesz wyprostowany, krótkie kroki."], "Nośność tułowia i chwyt.", unit="m")
ex("back_extension", "Wyprosty tułowia na ławce rzymskiej", "hinge", ["ławka rzymska"], ["Bez przeprostu na górze.", "Ruch z bioder."], "Zdrowe lędźwie przy długich godzinach w siodle.", unit="reps")
ex("copenhagen_plank", "Copenhagen plank", "core", ["ławka"], ["Bokiem, górna noga na ławce.", "Biodro wysoko."], "Przywodziciele stabilizują kolano w każdym obrocie korby.", unit="s", per_side=True)
ex("plank_reach", "Plank przodem z unoszeniem ręki", "core", ["mata"], ["Biodra nie rotują przy unoszeniu ręki."], "Anty-rotacja w pozycji podporu – jak na kierownicy.", unit="reps", per_side=True)
ex("jump_squat", "Wyskoki z hantlami", "power", ["hantle"], ["Hantle 10–15% masy ciała.", "Szybki skok, miękkie lądowanie."], "Zamiana siły w moc (Faza III).", unit="reps")
ex("kb_swing", "Swing kettlebell", "power", ["kettlebell 24–32 kg"], ["Ruch z bioder, nie przysiad.", "Mocny wyprost na górze."], "Szybki wyprost bioder – moc na podjazdach.", unit="kg")
ex("box_jump", "Wskoki na skrzynię", "power", ["skrzynia"], ["Schodzisz ze skrzyni, nie zeskakujesz.", "Pełny reset między skokami."], "Moc i reaktywność nóg.", unit="reps")
ex("mobility_circuit", "Obwód mobilności", "warmup", ["guma", "kettlebell 12–16 kg"],
   ["Biodra 90/90 – 5 zmian/stronę", "Wykrok z rotacją (world’s greatest stretch) – 4/stronę", "Mostek biodrowy – 10",
    "Przysiad goblet z 5 s pauzą na dole – 5", "Band pull-apart – 15", "Koci grzbiet – 6"],
   "Przygotowanie bioder i odcinka piersiowego po godzinach w siodle i przy biurku.", unit="rounds")
ex("cooldown_stretch", "Schłodzenie – rozciąganie", "mobility", ["mata"],
   ["Zginacze bioder w półklęku 45 s/stronę", "Pośladek („gołąb”) 45 s/stronę", "Łydka o ścianę 30 s/stronę", "Klatka w framudze 45 s/stronę", "Tył uda z gumą 45 s/stronę"],
   "Zginacze bioder są skrócone po każdej jeździe – to rozciąganie ma dla Ciebie największe znaczenie.", unit="min")

def P(sets, reps, rir=None, rest_s=None, note=None, load_hint=None):
    d = {"sets": sets, "reps": reps}
    if rir is not None: d["rir"] = rir
    if rest_s: d["rest_s"] = rest_s
    if note: d["note"] = note
    if load_hint: d["load_hint"] = load_hint
    return d

WARMUP = {"exercise": "mobility_circuit", "rx": P(2, "obwód", note="5 min rowerek/wioślarz luźno + 2 rundy obwodu. Serie wstępne do 1. ćwiczenia: pusta sztanga×8 → 50%×5 → 70%×3 → 85%×1–2.")}
COOLDOWN = {"exercise": "cooldown_stretch", "rx": P(1, "4–5 min")}

def sess_A(stage, week):
    """Sesja A – środa, 'Siła nóg' (ciężka)."""
    sq = {
        "intro": P(2, 10, 4, 120), "I_a": {3: P(3, 10, 3, 120), 4: P(4, 8, 3, 120), 5: P(4, 8, 3, 120)},
        "I_b": {7: P(4, 8, 3, 120), 8: P(4, 6, "2–3", 150), 9: P(4, 6, 2, 150)},
        "transition": P(3, 6, 2, 180),
        "II_a": {12: P(4, 6, 2, 180), 13: P(5, 5, 2, 180), 14: P(5, 5, 2, 180)},
        "II_b": {16: P(5, 5, 2, 180), 17: P(5, 4, 2, 180), 18: P(5, 4, 2, 180)},
        "II_c": {20: P(5, 4, 2, 180), 21: P(5, 3, 2, 180), 22: P(5, 3, 1, 180)},
        "test": P(1, 5, 1, 180, "Sprawdzian: 1 seria ciężka na 5 powtórzeń, potem 2×3 lekko (RIR 4)."),
        "III": P(3, 3, 2, 180),
    }
    hinge_id = "rdl" if stage in ("intro", "I_a", "I_b") else "trap_bar_deadlift"
    hi = {
        "intro": P(2, 10, 4, 120), "I_a": {3: P(3, 10, 3, 120), 4: P(3, 10, 3, 120), 5: P(3, 8, 3, 120)},
        "I_b": P(3, 8, "2–3", 150), "transition": P(3, 6, 2, 150, "Wprowadzenie trap bar – ustal ciężar na Fazę II."),
        "II_a": {12: P(4, 5, 2, 150), 13: P(4, 5, 2, 150), 14: P(4, 4, 2, 150)},
        "II_b": {16: P(4, 4, 2, 180), 17: P(4, 4, 2, 180), 18: P(5, 3, 2, 180)},
        "II_c": {20: P(5, 3, 2, 180), 21: P(5, 3, 2, 180), 22: P(5, 3, "1–2", 180)},
        "test": P(1, 5, 1, 180, "Sprawdzian."), "III": P(3, 3, 2, 180),
    }
    def pick(tbl):
        v = tbl[stage]
        if isinstance(v, dict) and v and all(isinstance(k, int) for k in v):
            if week in v: return v[week]
            earlier = [k for k in v if k <= week]
            return v[max(earlier)] if earlier else v[min(v)]
        return v
    acc = {"intro": (2, 10, 2, 15, 2, 30), "I_a": (3, 10, 3, 15, 3, 30), "I_b": (3, 10, 3, 15, 3, 30), "transition": (3, 10, 3, 15, 3, 30),
           "II_a": (3, 8, 3, 10, 3, 45), "II_b": (3, 8, 3, 10, 3, 45), "II_c": (3, 8, 3, 10, 3, 45), "test": (2, 8, 2, 10, 2, 45), "III": (3, 8, 2, 10, 2, 45)}[stage]
    items = [WARMUP,
             {"exercise": "back_squat", "rx": pick(sq), "block": "1"}]
    if stage == "III": items.append({"exercise": "jump_squat", "rx": P(3, 5, rest_s=90, load_hint="hantle 10–15% masy ciała"), "block": "1b"})
    items.append({"exercise": hinge_id, "rx": pick(hi), "block": "2"})
    if stage == "III": items.append({"exercise": "kb_swing", "rx": P(3, 8, rest_s=90, load_hint="24–32 kg"), "block": "2b"})
    items += [{"exercise": "db_row", "rx": P(acc[0], acc[1], 2, 60, "superseria 3A/3B"), "block": "3A"},
              {"exercise": "calf_raise", "rx": P(acc[2], acc[3], 2, 60, "pauza 1 s na górze"), "block": "3B"},
              {"exercise": "pallof_press", "rx": P(acc[4], 10, rest_s=30), "block": "4", "circuit": "core_A"},
              {"exercise": "dead_bug", "rx": P(acc[4], 8, rest_s=30), "block": "4", "circuit": "core_A"},
              {"exercise": "side_plank", "rx": P(acc[4], f"{acc[5]} s", rest_s=30), "block": "4", "circuit": "core_A"},
              COOLDOWN]
    return {"session": "A", "name": "Sesja A – Siła nóg (ciężka)", "est_min": 70, "items": items}

def sess_B(stage, week):
    """Sesja B – piątek, 'Jedna noga, tułów, postawa' (średnia)."""
    t = {
        "intro":      dict(su=P(2, 8, 4, 90), bss=P(2, 10, 4, 90), ht=P(2, 10, 3, 90, "pauza 2 s na górze"), pu=P(2, "max−2", rest_s=75, note="lub ściąganie drążka 2×10"), ps=P(2, "10", rest_s=60), core=2, cop="15 s"),
        "I_a":        dict(su=P(3, 8, 3, 90), bss=P(3, 10, 3, 90), ht=P(3, 10, 2, 90, "pauza 2 s na górze"), pu=P(3, "max−1", rest_s=75, note="lub ściąganie drążka 3×10"), ps=P(3, "10–15", rest_s=60), core=3, cop="15 s"),
        "I_b":        dict(su=P(3, 8, 3, 90), bss=P(3, 10, 3, 90), ht=P(3, 10, 2, 90, "pauza 2 s na górze"), pu=P(3, "max−1", rest_s=75, note="lub ściąganie drążka 3×10"), ps=P(3, "10–15", rest_s=60), core=3, cop="15 s"),
        "transition": dict(su=P(3, 8, 3, 90), bss=P(3, 10, 3, 90), ht=P(3, 10, 2, 90), pu=P(3, "max−1", rest_s=75), ps=P(3, "10–15", rest_s=60), core=3, cop="15 s"),
        "II_a":       dict(su=P(4, 6, 2, 90), bss=P(3, 8, 2, 90), ht=P(4, 8, 2, 90), pu=P(4, 6, 2, 90, "z gumą lub obciążeniem wg potrzeby"), ps=P(3, "8–12", rest_s=60, note="lub wyciskanie hantli na skosie"), core=3, cop="20 s"),
        "II_b":       dict(su=P(4, 6, 2, 90), bss=P(3, 8, 2, 90), ht=P(4, 8, 2, 90), pu=P(4, 6, 2, 90), ps=P(3, "8–12", rest_s=60), core=3, cop="20 s"),
        "II_c":       dict(su=P(4, 6, 2, 90), bss=P(3, 8, 2, 90), ht=P(4, 8, 2, 90), pu=P(4, 6, 2, 90), ps=P(3, "8–12", rest_s=60), core=3, cop="20 s"),
        "test":       dict(su=P(2, 6, 3, 90), bss=P(2, 8, 3, 90), ht=P(2, 8, 3, 90), pu=P(2, 6, 3, 90), ps=P(2, "10", rest_s=60), core=2, cop="20 s"),
        "III":        dict(su=P(3, 5, 2, 90, "dynamicznie"), bss=P(2, 6, 2, 90), ht=P(3, 6, 2, 90), pu=P(3, 6, 2, 90), ps=P(2, "10", rest_s=60), core=2, cop="20 s"),
    }[stage]
    items = [WARMUP, {"exercise": "step_up", "rx": t["su"], "block": "1"}]
    if stage == "III": items.append({"exercise": "box_jump", "rx": P(3, 5, rest_s=90), "block": "1b"})
    items += [{"exercise": "bulgarian_split_squat", "rx": t["bss"], "block": "2"},
              {"exercise": "hip_thrust", "rx": t["ht"], "block": "3"},
              {"exercise": "pull_up", "rx": t["pu"], "block": "4A"},
              {"exercise": "push_up", "rx": t["ps"], "block": "4B"},
              {"exercise": "farmer_walk", "rx": P(t["core"], "30–40 m", rest_s=45), "block": "5", "circuit": "core_B"},
              {"exercise": "back_extension", "rx": P(t["core"], 12, rest_s=45), "block": "5", "circuit": "core_B"},
              {"exercise": "copenhagen_plank", "rx": P(t["core"], t["cop"], rest_s=45), "block": "5", "circuit": "core_B"},
              {"exercise": "plank_reach", "rx": P(t["core"], 8, rest_s=45), "block": "5", "circuit": "core_B"},
              COOLDOWN]
    return {"session": "B", "name": "Sesja B – Jedna noga, tułów, postawa (średnia)", "est_min": 68, "items": items}

def sess_C(week, deload=False, box_jumps=True):
    s = 2 if deload else 3
    items = [{"exercise": "mobility_circuit", "rx": P(1, "obwód", note="3 min rowerek + 1 runda obwodu mobilności")},
             {"exercise": "back_squat", "rx": P(1 if deload else s, 3, "3–4" if deload else "2–3", 180, "Ciężar jak w lutym na 5 powtórzeń. Nie gonisz rekordów."), "block": "1"},
             {"exercise": "trap_bar_deadlift", "rx": P(1 if deload else 2, 3, 4 if deload else 3, 150), "block": "2"},
             {"exercise": "step_up", "rx": P(1 if deload else 2, 5, 4 if deload else 3, 90, "dynamicznie"), "block": "3"}]
    if box_jumps and not deload: items.append({"exercise": "box_jump", "rx": P(3, 3, rest_s=60), "block": "4"})
    items += [{"exercise": "pallof_press", "rx": P(2, 10, rest_s=30), "block": "5", "circuit": "core_C"},
              {"exercise": "side_plank", "rx": P(2, "45 s", rest_s=30), "block": "5", "circuit": "core_C"},
              {"exercise": "farmer_walk", "rx": P(2, "30 m", rest_s=30), "block": "5", "circuit": "core_C"}]
    return {"session": "C", "name": "Sesja C – Podtrzymanie" + (" (tydzień lżejszy)" if deload else ""), "est_min": 30 if deload else 42, "items": items}

def sess_core_home():
    return {"session": "CORE", "name": "Core i mobilność w domu", "est_min": 20,
            "items": [{"exercise": "mobility_circuit", "rx": P(2, "obwód")},
                      {"exercise": "dead_bug", "rx": P(2, 8)}, {"exercise": "side_plank", "rx": P(2, "45 s")},
                      {"exercise": "plank_reach", "rx": P(2, 8)}, COOLDOWN]}

def deloadify(session):
    s = copy.deepcopy(session)
    s["name"] += " – tydzień rozładowania"
    for it in s["items"]:
        rx = it["rx"]
        if isinstance(rx.get("sets"), int) and it["exercise"] not in ("mobility_circuit", "cooldown_stretch"):
            rx["sets"] = max(1, round(rx["sets"] * 0.6))
            if isinstance(rx.get("rir"), int):
                rx["rir"] = rx["rir"] + 1
            elif isinstance(rx.get("rir"), str) and "–" in rx["rir"]:
                a, b = rx["rir"].split("–")
                rx["rir"] = f"{int(a) + 1}–{int(b) + 1}"
            rx["note"] = ((rx.get("note") + " · ") if rx.get("note") else "") + "Rozładowanie: −40% serii, ciężar −10%, RIR +1."
    s["est_min"] = round(s["est_min"] * 0.7)
    return s

# ---------------------------------------------------------------- TYGODNIE SEZONU
def W(**kw): return kw
# Legenda: tue/wed/thu/fri/sat/sun = (workout_id, duration_min) ; gym = etap preskrypcji ; type = build|deload|test|taper|prep
WEEKS = {
 # Plan z 20.09.2026 („Faza 1 — baza przed Alpami”): 3 jazdy + 2 siłownie. Wt Z2, śr Sesja A, CZW akcent, pt Sesja B,
 # sb długa, nd wolne. Objętość 4,5 → 7,5 h, rozładowanie co 4. tydzień, test FTP 20 min w tyg. 2 (reset), 14 i 24.
 0:  W(phase="PREP", type="prep", tue=None, wed=None, thu=None, fri=("Z2", 60), sat=("LONG", 120), sun=("Z2", 90), gym_stage=None,
       notes="Tydzień przygotowawczy: zamów/zamontuj napęd, ustaw aplikację i profil, sprawdź wagę startową."),
 1:  W(phase="PREP", type="prep", tue=("Z2", 60), wed=("REST", 0), thu=("Z2", 45), fri=("REST", 0), sat=("LONG", 120), sun=("Z2", 90), gym_stage="intro",
       notes="Wyjście ze zmęczenia po Great Escape. Jedź lekko, siłownia celowo lekko (RIR 4)."),
 2:  W(phase="PREP", type="test", tue=("Z2", 45), wed=("Z2", 60), thu=("REST", 0), fri=("Z2", 50), sat=("FTP_TEST", None), sun=("REST", 0), gym_stage=None,
       notes="Tydzień resetu przed fazą: trzy spokojne jazdy (wt/śr/pt, wszystkie w Z2 – żadnych interwałów), bez siłowni, w sobotę test FTP 20 min. Zważ się rano na czczo trzy razy – to punkt zero redukcji. Skalibruj miernik (zeruj offset przed każdą jazdą). Jeśli nogi ciężkie – test w niedzielę i faza tydzień później."),
 # Blok 5 jazd bez siłowni (28.09–15.11): korzystamy z ostatnich tygodni, w których da się jeździć na zewnątrz.
 # Rytm: pn wolne, wt Z2, śr akcent, czw wolne, pt Z2 lekko, sb długa, nd Z2. Siłownia wraca w tygodniu 10 (16.11).
 3:  W(phase="I", type="build", tue=("Z2", 60), wed=("SS_2x12", None), thu=("REST", 0), fri=("Z2", 60), sat=("LONG", 120), sun=("Z2", 75), gym_stage=None,
       notes="Start bloku 5 jazd bez siłowni – jeździmy, póki pogoda pozwala (do 15.11). Jedyny dzień, na którym wolno się zmęczyć, to środa; wtorek, piątek i niedziela mają być nudne (rozmowa pełnymi zdaniami). Kadencja na każdym podjeździe min. 75 rpm (38×46). Minimalna jazda 40 min Z2 liczy się jako wykonana."),
 4:  W(phase="I", type="build", tue=("Z2", 60), wed=("SS_2x15", None), thu=("REST", 0), fri=("Z2", 60), sat=("LONG", 135), sun=("Z2", 90), gym_stage=None),
 5:  W(phase="I", type="build", tue=("Z2_FORCE", 75), wed=("SS_2x15", None), thu=("REST", 0), fri=("Z2", 60), sat=("LONG", 150), sun=("Z2", 90), gym_stage=None,
       notes="Do 18.10 kup lampę przednią ≥ 800 lm i tył z radarem – od zmiany czasu (25.10) wtorek, środa i piątek to jazda po ciemku."),
 6:  W(phase="I", type="deload", tue=("Z2", 60), wed=("Z2", 60), thu=("REST", 0), fri=("REST", 0), sat=("LONG", 90), sun=("Z2", 60), gym_stage=None,
       notes="Tydzień lżejszy: cztery jazdy, żadnych interwałów. Po nim wracamy do akcentów w środy."),
 7:  W(phase="I", type="build", tue=("Z2", 60), wed=("SS_3x12", None), thu=("REST", 0), fri=("Z2", 60), sat=("LONG", 150), sun=("Z2", 90), gym_stage=None),
 8:  W(phase="I", type="build", tue=("Z2_FORCE", 75), wed=("SS_2x20", None), thu=("REST", 0), fri=("Z2", 60), sat=("LONG", 165), sun=("Z2", 90), gym_stage=None),
 9:  W(phase="I", type="build", tue=("Z2", 60), wed=("SS_3x15", None), thu=("REST", 0), fri=("Z2", 60), sat=("LONG", 165), sun=("Z2", 90), gym_stage=None,
       notes="Ostatni tydzień bloku 5 jazd. Od 16.11 wracają dwie sesje siłowni i plan schodzi do 3 jazd – zimą i tak nie wyjedziesz pięć razy w tygodniu."),
 10: W(phase="I", type="deload", tue=("Z2", 60), wed=("REST", 0), thu=("Z2", 60), fri=("REST", 0), sat=("LONG", 120), sun=("REST", 0), gym_stage="intro",
       notes="Przed zimą: pełne błotniki SKS Bluemels 45, odzież (merino, rękawice trójpalczaste, ochraniacze na buty), ciśnienie w oponach −0,3 bara."),
 11: W(phase="I", type="build", tue=("Z2", 75), wed=("REST", 0), thu=("SS_3x15", None), fri=("REST", 0), sat=("LONG", 180), sun=("REST", 0), gym_stage="I_a",
       notes="Powrót do siły po siedmiu tygodniach przerwy: zacznij o 20 % lżej niż we wrześniu, RIR 4. Ciężary dobiera aplikacja z tego, co wpiszesz."),
 12: W(phase="I", type="build", tue=("Z2_FORCE", 75), wed=("REST", 0), thu=("SS_2x20", None), fri=("REST", 0), sat=("LONG", 180), sun=("REST", 0), gym_stage="I_b"),
 13: W(phase="I", type="build", tue=("Z2", 90), wed=("REST", 0), thu=("SS_3x20", None), fri=("REST", 0), sat=("LONG", 210), sun=("REST", 0), gym_stage="II_a",
       notes="Największy tydzień fazy. Jeśli pogoda go zabierze, przenieś 3:30 na tydzień wcześniej i potraktuj ten jako rozładowanie. Nie odrabiaj straconych godzin."),
 14: W(phase="I", type="test", tue=("Z2", 75), wed=("REST", 0), thu=("Z2", 60), fri=("REST", 0), sat=("FTP_TEST", None), sun=("REST", 0), gym_stage="II_a",
       notes="Test FTP 20 min w sobotę – koniec Fazy 1. Zapisz W/kg (FTP ÷ masa)."),
 # Zima (21.12–28.02): ta sama struktura, długa 2:00–2:30. Akcent w czwartek: powyżej −5 °C sweet spot na rowerze, −5…−10 °C skrócony,
 # poniżej −10 °C / gołoledź – 4×4 min na rowerku przed Sesją A (przycisk „pod dachem”).
 15: W(phase="II", type="deload", tue=("Z2", 60), wed=("REST", 0), thu=("Z2", 60), fri=("REST", 0), sat=("LONG", 120), sun=("REST", 0), gym_stage="II_a",
       notes="Święta – tydzień lżejszy. Zima: domyślnie Checkpoint z błotnikami. Czwartek poniżej −10 °C lub gołoledź = INDOOR_4x4 przed Sesją A."),
 16: W(phase="II", type="build", tue=("Z2_FORCE", 75), wed=("REST", 0), thu=("SS_2x15", None), fri=("REST", 0), sat=("LONG", 135), sun=("REST", 0), gym_stage="II_b"),
 17: W(phase="II", type="build", tue=("Z2", 75), wed=("REST", 0), thu=("SS_3x12", None), fri=("REST", 0), sat=("LONG", 150), sun=("REST", 0), gym_stage="II_b"),
 18: W(phase="II", type="build", tue=("Z2_FORCE", 75), wed=("REST", 0), thu=("SS_2x20", None), fri=("REST", 0), sat=("LONG", 150), sun=("REST", 0), gym_stage="II_b"),
 19: W(phase="II", type="deload", tue=("Z2", 60), wed=("REST", 0), thu=("Z2", 60), fri=("REST", 0), sat=("LONG", 120), sun=("REST", 0), gym_stage="II_b"),
 20: W(phase="II", type="build", tue=("Z2_FORCE", 75), wed=("REST", 0), thu=("SS_3x15", None), fri=("REST", 0), sat=("LONG", 150), sun=("REST", 0), gym_stage="II_c"),
 21: W(phase="II", type="build", tue=("Z2", 90), wed=("REST", 0), thu=("SS_2x20", None), fri=("REST", 0), sat=("LONG", 150), sun=("REST", 0), gym_stage="II_c"),
 22: W(phase="II", type="build", tue=("Z2_FORCE", 90), wed=("REST", 0), thu=("SS_3x20", None), fri=("REST", 0), sat=("LONG", 150), sun=("REST", 0), gym_stage="II_c"),
 23: W(phase="II", type="deload", tue=("Z2", 60), wed=("REST", 0), thu=("Z2", 60), fri=("REST", 0), sat=("LONG", 120), sun=("REST", 0), gym_stage="II_c"),
 24: W(phase="II", type="test", tue=("FTP_TEST", None), wed=("REST", 0), thu=("Z2", 60), fri=("REST", 0), sat=("LONG", 150), sun=("REST", 0), gym_stage="test",
       notes="Tydzień sprawdzianów: wtorek test FTP (świeże nogi po wolnym poniedziałku; przy gołoledzi Wattbike), środa sprawdzian siłowy (przysiad i trap bar 1×5 RIR 1). Kryteria wejścia do fazy III: ≥ 2,7 dnia jazdy/tydz. (śr. z 12 tyg.), FTP ≥ 200 W, masa ≤ 102 kg, kadencja na podjazdach ≥ 78 rpm, 3,5 h Z2 pod Łodzią zimą. Przy 2–3 spełnionych przesuń fazę III o 3–4 tygodnie i skróć IV."),
 25: W(phase="III", type="build", tue=("Z2", 75), wed=("THR_4x6", None), thu=("Z2", 60), sat=("LONG_TEMPO", 180), sun=("HILLS", 120), gym_stage="III"),
 26: W(phase="III", type="build", tue=("Z2", 90), wed=("THR_4x8", None), thu=("Z2", 60), sat=("LONG_TEMPO", 195), sun=("HILLS", 135), gym_stage="III"),
 27: W(phase="III", type="build", tue=("Z2", 90), wed=("THR_3x12", None), thu=("Z2", 60), sat=("LONG_TEMPO", 210), sun=("HILLS", 135), gym_stage="III",
       notes="Pierwsze 100 km z blokiem tempa 30–32 km/h."),
 28: W(phase="III", type="deload", tue=("Z2", 60), wed=("DELOAD_WED", 60), thu=("REST", 0), sat=("LONG", 135), sun=("Z2", 90), gym_stage="III"),
 29: W(phase="III", type="test", tue=("Z2", 90), wed=("TEST_LTHR", None), thu=("Z2", 60), fri=("Z1_RECOVERY", 45), sat=("LONG_TEMPO", 210), sun=("HILLS", 150), gym_stage="C",
       notes="Od teraz siłownia 1×/tydz. (Sesja C). Piątek wolny lub luźna jazda."),
 30: W(phase="III", type="build", tue=("Z2", 90), wed=("THR_2x20", None), thu=("Z2", 60), fri=("Z1_RECOVERY", 45), sat=("LONG_TEMPO", 210), sun=("HILLS", 150), gym_stage="C",
       notes="Serwis wiosenny: klocki (spiek, jeśli zaciski SRAM HRD), płyn hamulcowy, zużycie łańcucha; przegląd Dogmy."),
 31: W(phase="III", type="build", tue=("Z2", 90), wed=("VO2_5x3", None), thu=("Z2", 60), fri=("Z1_RECOVERY", 45), sat=("LONG_TEMPO", 225), sun=("HILLS", 150), gym_stage="C"),
 32: W(phase="III", type="deload", tue=("Z2", 60), wed=("DELOAD_WED", 60), thu=("REST", 0), fri=("REST", 0), sat=("LONG", 135), sun=("Z2", 90), gym_stage="C_deload"),
 33: W(phase="IV", type="build", tue=("Z2", 90), wed=("THR_3x12", None), thu=("Z2", 60), fri=("REST", 0), sat=("LONG", 240), sun=("HILLS", 150), gym_stage="C",
       notes="Decyzja o oponach na lato/Alpy dla Checkpointa (GP 5000 S TR 32c z dętkami lub AS TR 35c) – kup w tym tygodniu."),
 34: W(phase="IV", type="build", tue=("Z2", 90), wed=("VO2_5x3", None), thu=("Z2", 60), fri=("REST", 0), sat=("LONG", 240), sun=("HILLS", 180), gym_stage="C_nobox"),
 35: W(phase="IV", type="build", tue=("Z2", 90), wed=("THR_3x12", None), thu=("Z2", 45), fri=("TRAVEL_REST", 0), sat=("MOUNTAIN_DAY", 240), sun=("MOUNTAIN_DAY", 210), gym_stage="C_nobox",
       event="Weekend w górach #1: Karkonosze (Kowary → Przełęcz Okraj; Przesieka → Przełęcz Karkonoska). Checkpoint."),
 36: W(phase="IV", type="deload", tue=("Z2", 60), wed=("DELOAD_WED", 60), thu=("REST", 0), fri=("REST", 0), sat=("LONG", 150), sun=("Z2", 90), gym_stage="C_deload"),
 37: W(phase="IV", type="test", tue=("Z2", 90), wed=("TEST_LTHR", None), thu=("Z2", 60), fri=("REST", 0), sat=("LONG", 270), sun=("HILLS", 180), gym_stage="C_nobox"),
 38: W(phase="IV", type="build", tue=("Z2_HEAT", 90), wed=("VO2_5x3", None), thu=("Z2", 60), fri=("REST", 0), sat=("B2B_DAY", 300), sun=("B2B_DAY", 300), gym_stage="C_nobox",
       event="Weekend back-to-back #1: sobota 120 km / 1000 m, niedziela 120 km / 1200 m."),
 39: W(phase="IV", type="build", tue=("Z2_HEAT", 90), wed=("THR_2x20", None), thu=("Z2", 45), fri=("TRAVEL_REST", 0), sat=("MOUNTAIN_DAY", 270), sun=("MOUNTAIN_DAY", 210), gym_stage="C_nobox",
       event="Weekend w górach #2: Beskid Śląski (Przełęcz Salmopolska, Kubalonka, Koniaków)."),
 40: W(phase="IV", type="deload", tue=("Z2", 60), wed=("DELOAD_WED", 60), thu=("REST", 0), fri=("REST", 0), sat=("LONG", 150), sun=("Z2", 90), gym_stage="C_deload"),
 41: W(phase="IV", type="build", tue=("Z2_HEAT", 90), wed=("THR_2x20", None), thu=("Z2", 60), fri=("REST", 0), sat=("LONG", 270), sun=("HILLS", 180), gym_stage="C_nobox"),
 42: W(phase="IV", type="build", tue=("Z2_HEAT", 90), wed=("CLIMB_REPEATS", None), thu=("Z2", 60), fri=("REST", 0), sat=("B2B_DAY", 300), sun=("B2B_DAY", 300), gym_stage="C_nobox",
       event="Weekend back-to-back #2."),
 43: W(phase="IV", type="build", tue=("Z2_HEAT", 90), wed=("VO2_5x3", None), thu=("Z2", 45), fri=("TRAVEL_REST", 0), sat=("MOUNTAIN_DAY", 270), sun=("MOUNTAIN_DAY", 240), gym_stage="C_nobox",
       event="Weekend w górach #3: Pradziad (CZ, Jeseniki) lub Tatry słowackie – najdłuższe dostępne podjazdy 8–10 km."),
 44: W(phase="IV", type="deload", tue=("Z2", 60), wed=("DELOAD_WED", 60), thu=("REST", 0), fri=("REST", 0), sat=("LONG", 150), sun=("Z2", 90), gym_stage="C_deload"),
 45: W(phase="V", type="test", tue=("Z2_HEAT", 90), wed=("TEST_LTHR", None), thu=("Z2", 60), fri=("REST", 0), sat=("LONG", 300), sun=("HILLS", 180), gym_stage="C_nobox",
       notes="Szlif alpejski. Ostatni test przed wyjazdem – ustaw pacing na przełęcze (LTHR − 10–15 uderzeń na start)."),
 46: W(phase="V", type="build", tue=("Z2_HEAT", 90), wed=("THR_2x20", None), thu=("Z2", 60), fri=("REST", 0), sat=("B2B_DAY", 300), sun=("B2B_DAY", 300), gym_stage="C_nobox",
       event="Weekend back-to-back #3 – z docelowym bagażem (sakwy Ortlieb)."),
 47: W(phase="V", type="build", tue=("Z2_HEAT", 90), wed=("VO2_5x3", None), thu=("Z2", 45), fri=("TRAVEL_REST", 0), sat=("MOUNTAIN_DAY", 300), sun=("MOUNTAIN_DAY", 240), gym_stage="C_nobox",
       event="Weekend w górach #4 – generalka: pełny sprzęt wyjazdowy, pacing i jedzenie jak w Alpach."),
 48: W(phase="V", type="deload", tue=("Z2", 60), wed=("DELOAD_WED", 60), thu=("REST", 0), fri=("REST", 0), sat=("LONG", 150), sun=("Z2", 90), gym_stage="C_deload",
       notes="Serwis przedwyjazdowy: łańcuch (miernik), klocki, opony, linki/płyn, śruby, hak przerzutki na zapas."),
 49: W(phase="V", type="build", tue=("Z2", 60), wed=("THR_3x15", None), thu=("REST", 0), fri=("BLOCK_DAY1", 210), sat=("B2B_DAY", 270), sun=("B2B_DAY", 270), gym_stage="C_nobox",
       event="Blok 3-dniowy (pt–nd): 100 km + 120 km/1000 m + 120 km/1200 m – symulacja wyjazdu."),
 50: W(phase="V", type="build", tue=("Z2", 75), wed=("VO2_4x3", None), thu=("Z2", 60), fri=("REST", 0), sat=("LONG", 210), sun=("Z2", 120), gym_stage="C_last",
       notes="Ostatnia sesja siłowa z nogami (≥10 dni przed wyjazdem)."),
 51: W(phase="TAPER", type="taper", tue=("Z2", 60), wed=("OPENERS", 60), thu=("Z2", 45), fri=("REST", 0), sat=("Z2", 150), sun=("Z2", 90), gym_stage="CORE",
       notes="Taper: objętość −40%, intensywność tylko w krótkich pobudzeniach. Siłownia: tylko core i mobilność."),
 52: W(phase="TAPER", type="taper", tue=("OPENERS", 45), wed=("Z2", 45), thu=("REST", 0), fri=("Z1_RECOVERY", 30), sat=("TRIP", 0), sun=("TRIP", 0), gym_stage=None,
       notes="Tydzień wyjazdu. Czwartek: pakowanie wg checklisty. Sobota: start wyjazdu."),
}

PHASES = [
    {"id": "PREP", "name": "Przygotowanie i reset", "goal": "Napęd, konfiguracja aplikacji, wyjście ze zmęczenia po Great Escape, test FTP, waga startowa.", "weeks": [0, 2]},
    {"id": "I", "name": "Faza I – Baza przed Alpami", "goal": "3 jazdy + 2 siłownie: Z2 nudne, jeden akcent sweet spot w czwartek, długa w sobotę. Kadencja ≥ 75 rpm na podjazdach, redukcja 110 → 102 kg.", "weeks": [3, 14]},
    {"id": "II", "name": "Faza II – Zima: podtrzymanie bazy i siła maksymalna", "goal": "Ta sama struktura w chłodzie, akcent warunkowy (pod dachem poniżej −10 °C), siła maksymalna na siłowni, redukcja masy.", "weeks": [15, 24]},
    {"id": "III", "name": "Faza III – Wiosenna prędkość i próg", "goal": "Interwały progowe pod górę, tempo 30 km/h, 100 km, zamiana siły w moc, siłownia → podtrzymanie.", "weeks": [25, 32]},
    {"id": "IV", "name": "Faza IV – Sezon letni i góry w Polsce", "goal": "Długie jazdy 4–5 h, back-to-back, weekendy w górach, adaptacja do upału, dojście do 90 kg.", "weeks": [33, 44]},
    {"id": "V", "name": "Faza V – Szlif alpejski", "goal": "Symulacje wyjazdu z bagażem, blok 3-dniowy, generalka w górach, zero deficytu kalorycznego.", "weeks": [45, 50]},
    {"id": "TAPER", "name": "Taper i wyjazd", "goal": "Świeże nogi, pełne magazyny glikogenu, spakowany sprzęt.", "weeks": [51, 52]},
]

GYM_DEFAULT_DAYS = {"wed": "A", "fri": "B"}

def gym_for(week, weekday, wk):
    stage = wk.get("gym_stage")
    if not stage: return None
    only = wk.get("gym_only")
    if only and (weekday != "wed" if only == "A" else weekday != "fri"): return None
    deload = wk["type"] == "deload"
    if stage == "CORE":
        return sess_core_home() if weekday == "wed" else None
    if stage.startswith("C"):
        if weekday != "wed": return None
        if stage == "C_deload": return sess_C(week, deload=True)
        s = sess_C(week, deload=False, box_jumps=(stage == "C"))
        if stage == "C_last": s["name"] += " – ostatnia sesja z nogami"
        return s
    if weekday == "wed": s = sess_A(stage, week)
    elif weekday == "fri": s = sess_B(stage, week)
    else: return None
    if deload:
        s = deloadify(s)
    return s

DAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DAY_PL = {"mon": "Poniedziałek", "tue": "Wtorek", "wed": "Środa", "thu": "Czwartek", "fri": "Piątek", "sat": "Sobota", "sun": "Niedziela"}

# ---------------------------------------------------------------- SEKCJE OSOBISTE PROGRAMU (docs/18)
# Wszystko, co opisuje TEGO zawodnika, trafia do program.json jako dane – silnik nie ma własnych domyślnych.

NUTRITION = {
    # schodzenie ze 110 na 90 kg: deficyt w fazach bazy i zimy, od fazy IV tylko powyżej masy docelowej
    "deficit_by_phase": {"PREP": True, "I": True, "II": True, "III": True, "IV": "if_above_target", "V": False, "TAPER": False},
    "protein_g_per_kg": 1.8,
    "heavy_min": 120,
    "medium_min": 60,
    "buckets": {
        "no_deficit": {"energy": "maintenance", "label": "Bilans zerowy – jedz na pełną wydajność"},
        "heavy": {"energy": "maintenance", "label": "Dzień ciężki: bez deficytu, paliwo na trening"},
        "medium": {"energy": "deficit_300", "label": "Deficyt ok. 300 kcal"},
        "light": {"energy": "deficit_500", "label": "Dzień lekki: deficyt ok. 500 kcal"},
    },
    "if_above_target_suffix": " (tylko jeśli waga > celu)",
    "carbs_g_per_h": [[90, [60, 80]], [60, [30, 40]]],
    "post_workout": {"min_ride_min": 60, "text": "30–40 g białka + węglowodany w ciągu 1–2 h"},
    "trip": {"energy": "maintenance_plus", "label": "Wyjazd: jedz do syta, 70–80 g węgli/h na podjazdach", "protein_g_per_kg": 1.6, "carbs_g_per_h": [70, 80]},
}

BIKES = {
    # Wszystkie treningi na gravelu (decyzja 24.09.2026); Dogma czeka na rower endurance – raczej przyszły sezon.
    "default": "Checkpoint (gravel)",
    "indoor": "Wattbike / rowerek na siłowni",
    "by_workout": {w: "Checkpoint (przełożenie 40/50, tarczówki)" for w in ("MOUNTAIN_DAY", "B2B_DAY", "BLOCK_DAY1")},
    "by_phase": {"II": "Checkpoint (zima, błotniki)", "V": "Checkpoint (docelowy rower wyjazdowy)", "TAPER": "Checkpoint (docelowy rower wyjazdowy)"},
}

GOAL = {"kind": "speed", "kmh": 30, "label": "30 km/h przez 2–3 godziny", "short": "30 km/h"}
CADENCE = {"floor_rpm": 75, "goal_rpm": 78, "tip": "siłę na niskiej kadencji zostaw na bloki Z2_FORCE"}
META = {
    "name": "Alpy 2027 – baza i góry",
    "short": "Alpy 2027",
    "target": {"label": "Data wyjazdu", "short": "wyjazd", "until": "do wyjazdu", "today": "Dzień wyjazdu!", "after": "Wyjazd trwa"},
}
FEATURES = ["trip"]


def load_gear_tasks():
    """Zadania sprzętowe planu sezonu (terminy z tygodni). Rowery to dane użytkownika, więc tu zostaje tylko opis.
    Kontrola łańcucha poszła do szablonu serwisu cyklicznego (data/gear_templates.json)."""
    labels = {"checkpoint": "Checkpoint", "dogma": "Dogma", "both": "Oba rowery"}
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "gear_tasks_alps.json"), encoding="utf-8") as f:
        raw = json.load(f)
    out = []
    for t in raw:
        if t.get("recurring"):
            continue
        task = {k: v for k, v in t.items() if k not in ("bike", "recurring")}
        task["bike_label"] = labels.get(t.get("bike")) if t.get("bike") else None
        out.append(task)
    return out
GYM_DAY_OPTIONS = [{"value": "wed", "label": "środa (A/C) + piątek (B)"}, {"value": "tue", "label": "wtorek (A/C) + piątek (B)"}]

# Zasady adaptacji (docs/18, krok 2) – teksty dla człowieka i parametry reguł silnika. Osobiste dla tego programu.
RULES = {
    "text": [
    {
        "id": "R1",
        "title": "Pominięty środowy akcent",
        "text": "Przenieś na czwartek (zamiast Z2); piątkowa Sesja B wtedy lżejsza (−1 seria, RIR +1). Pominięty też w czwartek → przepada. Nigdy nie dokładaj akcentu w piątek/sobotę ani dwóch akcentów dzień po dniu."
    },
    {
        "id": "R2",
        "title": "Pominięta sobotnia długa jazda",
        "text": "Przenieś na niedzielę (zastępuje niedzielny trening). Nie dokładaj w poniedziałek."
    },
    {
        "id": "R3",
        "title": "Pominięta sesja siłowa",
        "text": "Sesja A → zrób w czwartek (po Z2 lub zamiast). Sesja B → przepada w tym tygodniu, nie przenoś na sobotę."
    },
    {
        "id": "R4",
        "title": "Gołoledź, śnieg, poniżej −5 °C",
        "text": "Akcent → INDOOR_4x4 na Wattbike + siłownia. Z2 → 45–60 min na rowerku/wioślarzu lub marsz 60 min. Długa jazda → 90 min rowerek Z2 albo przesunięcie na drugi dzień weekendu."
    },
    {
        "id": "R5",
        "title": "Choroba",
        "text": "Gorączka lub objawy „poniżej szyi” → zero treningu. Katar bez gorączki → tylko Z1 do 45 min, bez siłowni. Po ≥ 3 dniach przerwy: 2 dni krótkiego Z2. Po ≥ 7 dniach: powtórz poprzedni tydzień (w fazach I–III), w IV–V skróć zamiast przesuwać."
    },
    {
        "id": "R6",
        "title": "Słaby poranny check-in",
        "text": "Tętno spoczynkowe > średnia 7-dniowa + 7 bpm dwa dni z rzędu albo suma ocen (sen + nogi + motywacja) ≤ 6 → obniż dzień: akcent → Z2 60 min, Sesja A/B → lżejsza (−1 seria, RIR +1)."
    },
    {
        "id": "R7",
        "title": "Rower ma pierwszeństwo",
        "text": "Jeśli 2 tygodnie z rzędu akcent „nie wyszedł” (RPE ≥ 9 przy niewykonanych celach), a ciężary rosną → −1 seria w Sesjach A i B do końca bloku."
    },
    {
        "id": "R8",
        "title": "Progresja ciężarów",
        "text": "Wszystkie serie z zadanym RIR → +2,5 kg (sztanga; +5 kg przy RIR ≥ cel + 2), +1–2 kg na hantel. 1 seria z brakiem → ten sam ciężar. ≥ 2 serie z brakami drugi raz z rzędu → −10%. Mniej powtórzeń w nowym tygodniu → +2,5–5 kg. Rozładowanie: −10% ciężaru, −40% serii, RIR +1."
    },
    {
        "id": "R9",
        "title": "48 h ochrony",
        "text": "Brak Sesji A w ciągu 48 h przed testem, weekendem back-to-back, weekendem w górach i blokiem 3-dniowym. Przy naruszeniu: ostrzeżenie i propozycja przeniesienia Sesji A wcześniej lub zamiany na core."
    },
    {
        "id": "R10",
        "title": "Tempo redukcji masy",
        "text": "Spadek > 1% masy/tydz. przez 2 tygodnie → +200–300 kcal. Spadek LTHR/FTP > 3% w teście przy redukcji → pauza w deficycie na 2 tygodnie. Waga ≤ cel → deficyt wyłączony."
    },
    {
        "id": "R11",
        "title": "Nowy wynik testu",
        "text": "Strefy przeliczone od następnego dnia; aplikacja pokazuje różnicę względem poprzedniego testu i przypomina o ustawieniu stref w ELEMNT."
    },
    {
        "id": "R12",
        "title": "Tydzień rozładowania",
        "text": "Rower: bez interwałów poza DELOAD_WED, objętość ok. −40%. Siła: −40% serii, −10% ciężaru, RIR +1."
    },
    {
        "id": "R13",
        "title": "Upał > 28 °C",
        "text": "Cele tętna Z2–SS obniżone o 3–5 bpm, picie 750 ml/h + elektrolity, przy VO2 skróć do 4 powtórzeń."
    },
    {
        "id": "R14",
        "title": "Zmiana daty wyjazdu",
        "text": "Kalendarz liczony od końca: taper = 2 ostatnie tygodnie, faza V = 6 tygodni przed taperem, faza IV wypełnia resztę od 26.04.2027. Fazy I–III przypięte do dat. Gdy na fazę IV zostaje < 6 tygodni, skracana jest faza III (tydzień testowy zostaje)."
    },
    {
        "id": "R15",
        "title": "Zamiana dni",
        "text": "Dozwolona w obrębie tygodnia. Walidacja: brak dwóch akcentów dzień po dniu, R9, poniedziałek wolny może zamienić się z czwartkiem."
    },
    {
        "id": "R16",
        "title": "Skalowanie objętości",
        "text": "Ustawienie 0,7–1,0 skraca jazdy Z2, długie i pagórki (min. 45 min dla Z2, 90 min dla długiej). Akcenty, testy, góry i back-to-back bez zmian."
    }
],
    "hierarchy": [
    "Środowy akcent rowerowy",
    "Sobotnia długa jazda (lub góry / back-to-back)",
    "Sesja siłowa A (C)",
    "Niedzielna jazda",
    "Sesja siłowa B",
    "Wtorkowe Z2",
    "Czwartkowe Z2"
],
    "tests": [
    {
        "id": "TEST_LTHR",
        "name": "Test progowy terenowy (30 min)",
        "when": "tydz. 1, 7, 29, 37, 45 (środa)",
        "protocol": "15 min rozgrzewki (z 2×20 s przyspieszeniami), 5 min luźno, 30 min maksymalnego równego wysiłku w pojedynkę, 10 min schłodzenia. Zawsze ta sama trasa, bez grupy. Pierwsze 5 min nie za mocno.",
        "result": "LTHR = średnie tętno z minut 10–30. Zapisz prędkość średnią, dystans, rower, temperaturę, wiatr."
    },
    {
        "id": "WATTBIKE_TEST",
        "name": "Test na Wattbike (20 min)",
        "when": "tydz. 16 (środa) i 24 (wtorek)",
        "protocol": "15 min rozgrzewki, 5 min luźno, 20 min all-out, 10 min schłodzenia.",
        "result": "FTP = 0,95 × średnia moc; LTHR ≈ 0,97 × średnie tętno z 20 min."
    }
],
    "pass_strategy": [
    "Przełożenie 40/50: 7,5 km/h ≈ 72 rpm (przy 8,5 km/h ≈ 81 rpm).",
    "Pierwsze 2 km: 10–15 uderzeń poniżej LTHR. Kiedy inni odjeżdżają – ignoruj. Równe tempo wygrywa po 4. km.",
    "Jedzenie: 1 bidon izotoniku (~40 g węgli) + 1 żel (30–40 g) na godzinę wspinaczki, małe łyki co 10 min.",
    "Na podjazdach > 1 h: 500–750 ml płynu/h.",
    "Zjazdy: pozycja nisko, hamowanie pulsacyjne (mocno–puść), nigdy ciągłe. Patrz w wyjście z zakrętu."
],
    # R3: Sesję A/C można odrobić w ciągu 2 dni, Sesja B przepada (nie przenosimy jej na sobotę przed długą)
    "gym_catchup": {"A": "move", "C": "move", "B": "drop"},
    # R2: pominiętą sobotnią długą przenosimy na niedzielną spokojną jazdę
    "long_catchup_onto": ["easy"],
    "deload_note": "Tydzień lżejszy: bez interwałów poza środą, objętość niżej o 40%. Na siłowni ciężar −10%, serie −40%, RIR +1. Nogi mają wyjść świeższe.",
}


def nutrition_for(policy, phase, day_type, bike_min, key):
    """Port 1:1 `nutritionFor` z src/engine/nutrition.ts – liczy wyłącznie z polityki programu."""
    if day_type == "trip" and policy.get("trip"):
        t = policy["trip"]
        return {"energy": t["energy"], "label": t["label"], "protein_g_per_kg": t["protein_g_per_kg"], "on_bike_carbs_g_per_h": list(t["carbs_g_per_h"])}
    d = policy["deficit_by_phase"].get(phase, False)
    heavy = key or bike_min >= policy["heavy_min"]
    b = policy["buckets"]
    bucket = b["no_deficit"] if d is False else (b["heavy"] if heavy else (b["medium"] if bike_min >= policy["medium_min"] else b["light"]))
    energy, label = bucket["energy"], bucket["label"]
    if d == "if_above_target" and energy.startswith("deficit"):
        label += policy["if_above_target_suffix"]
        energy += "_if_above_target"
    carbs = next((list(c) for m, c in policy["carbs_g_per_h"] if bike_min >= m), [0, 0])
    return {"energy": energy, "label": label, "protein_g_per_kg": policy["protein_g_per_kg"],
            "on_bike_carbs_g_per_h": carbs,
            "post_workout": policy["post_workout"]["text"] if (bike_min >= policy["post_workout"]["min_ride_min"] or key) else None,
            **({"deficit_share": bucket["deficit_share"]} if "deficit_share" in bucket else {})}


def bike_suggestion(bikes, phase, wid):
    """Port 1:1 `bikeSuggestion` z src/engine/calendar.ts."""
    if wid in ("WATTBIKE_TEST", "INDOOR_4x4"): return bikes["indoor"]
    return bikes.get("by_workout", {}).get(wid) or bikes.get("by_phase", {}).get(phase) or bikes["default"]

def build_calendar(settings=DEFAULT_SETTINGS):
    start = D.fromisoformat(settings["program_start"])
    trip = D.fromisoformat(settings["trip_start"])
    days = []
    week0 = start - dt.timedelta(days=7)
    for wno in range(0, 53):
        wk = WEEKS[wno]
        monday = week0 + dt.timedelta(weeks=wno)
        for i, dn in enumerate(DAY_NAMES):
            date = monday + dt.timedelta(days=i)
            if date >= trip + dt.timedelta(days=2): break
            if wno == 0 and date < D(2026, 9, 11): continue
            if dn == "mon":
                bike = ("REST", 0)
            else:
                bike = wk.get(dn)
                if bike is None:
                    bike = {"thu": ("Z1_RECOVERY", 45), "fri": ("REST", 0), "tue": ("Z2", 60), "wed": ("Z2", 60)}.get(dn, ("REST", 0)) if wno > 0 else ("REST", 0)
            wid, dur = bike
            w = BIKE_WORKOUTS[wid]
            if dur is None: dur = w["duration_min"]
            gym = gym_for(wno, dn, wk)
            key = w.get("key", False) or wid.startswith(("SS_", "THR_", "VO2_", "TEST", "WATTBIKE", "FTP"))
            fallback = "INDOOR_4x4" if (wk["phase"] == "II" and wid.startswith(("SS_", "THR_"))) else None
            if wid == "FTP_TEST" and wk["phase"] == "II": fallback = "WATTBIKE_TEST"
            if wid in ("REST", "TRAVEL_REST"):
                day_type = "gym" if gym else "rest"
            elif wid == "TRIP":
                day_type = "trip"
            else:
                day_type = "key" if key else ("long" if dur >= 120 else "easy")
            flags = []
            if wid.startswith(("TEST", "WATTBIKE", "FTP")): flags.append("test")
            if w["category"] == "mountain": flags.append("mountain_weekend")
            if wid in ("B2B_DAY", "BLOCK_DAY1"): flags.append("back_to_back")
            if wk["type"] == "deload": flags.append("deload")
            if wid == "Z2_HEAT": flags.append("heat")
            day = {
                "date": date.isoformat(), "weekday": dn, "week": wno, "phase": wk["phase"], "week_type": wk["type"],
                "day_type": day_type,
                "bike": None if wid in ("REST",) else {"workout_id": wid, "name": w["name"], "duration_min": dur,
                                                       "bike": bike_suggestion(BIKES, wk["phase"], wid), "fallback_workout_id": fallback},
                "gym": None if not gym else {"session": gym["session"], "name": gym["name"], "est_min": gym["est_min"], "items": gym["items"]},
                "nutrition": nutrition_for(NUTRITION, wk["phase"], day_type, dur if wid not in ("REST", "TRAVEL_REST", "TRIP") else 0, key),
                "flags": flags,
            }
            if dn == "mon" and wk.get("notes"): day["week_notes"] = wk["notes"]
            if wk.get("event") and dn == "sat": day["event"] = wk["event"]
            days.append(day)
    return days

def week_table(days):
    weeks = {}
    for d in days:
        w = weeks.setdefault(d["week"], {"week": d["week"], "phase": d["phase"], "type": d["week_type"], "start": d["date"], "bike_min": 0, "gym": [], "key": [], "sat": None, "sun": None})
        if d["bike"] and d["bike"]["workout_id"] not in ("TRIP", "TRAVEL_REST"): w["bike_min"] += d["bike"]["duration_min"]
        if d["gym"]: w["gym"].append(f'{d["gym"]["session"]}({d["weekday"]})')
        if d["weekday"] in ("wed", "thu") and d["bike"] and d["day_type"] == "key": w["key"].append(d["bike"]["workout_id"])
        if d["weekday"] == "sat" and d["bike"]: w["sat"] = f'{d["bike"]["workout_id"]} {d["bike"]["duration_min"]}′'
        if d["weekday"] == "sun" and d["bike"]: w["sun"] = f'{d["bike"]["workout_id"]} {d["bike"]["duration_min"]}′'
        if d["weekday"] == "fri" and d["bike"] and d["bike"]["workout_id"] == "BLOCK_DAY1": w["key"].append("BLOCK_DAY1(pt)")
        w["end"] = d["date"]
    for wno, wk in WEEKS.items():
        if wno in weeks:
            weeks[wno]["event"] = wk.get("event"); weeks[wno]["notes"] = wk.get("notes")
    return [weeks[k] for k in sorted(weeks)]

def main():
    # Parametry osobiste TEGO zawodnika – ustalone z jego danych, nie ogólne prawdy.
    # Ustawiamy je przed przebudowaniem biblioteki, żeby nie wyciekły na inne programy (docs/13 § 24.09.2026).
    global CAD_EASY, CAD_CD, Z2_NOTE, TEST_NOTE
    CAD_EASY = [80, 95]
    CAD_CD = [85, 100]
    Z2_NOTE = "Kadencja naturalna (80–95) – nie wymuszaj szybszego kręcenia."
    TEST_NOTE = " Kadencja naturalna – nie wymuszaj szybszego kręcenia, bo kosztuje waty."
    build_library()

    days = build_calendar()
    program = {
        "version": PROGRAM_VERSION,
        "meta": META,
        "nutrition": NUTRITION,
        "bikes": BIKES,
        "goal": GOAL,
        "cadence": CADENCE,
        "rules": RULES,
        "features": FEATURES,
        "gear_tasks": load_gear_tasks(),
        "gym_day_options": GYM_DAY_OPTIONS,
        "default_settings": DEFAULT_SETTINGS,
        "hr_zones_lthr_fraction": HR_ZONES,
        "power_zones_ftp_fraction": POWER_ZONES,
        "phases": PHASES,
        "bike_workouts": BIKE_WORKOUTS,
        "exercises": EX,
        "gym_prescription_stages": {
            "intro": "tydz. 1–2 (reset, RIR 4)", "I_a": "tydz. 3–6", "I_b": "tydz. 7–10", "transition": "tydz. 11",
            "II_a": "tydz. 12–15", "II_b": "tydz. 16–19", "II_c": "tydz. 20–23", "test": "tydz. 24",
            "III": "tydz. 25–28", "C": "tydz. 29–33 (z wskokami)", "C_nobox": "tydz. 34–49", "C_deload": "tygodnie lżejsze od tydz. 32",
            "C_last": "tydz. 50", "CORE": "tydz. 51"},
        "weeks": {str(k): v for k, v in WEEKS.items()},
        # preskrypcje siłowe per tydzień szablonu: slot "wed" (Sesja A / C / core) i "fri" (Sesja B);
        # aplikacja mapuje sloty na dni z ustawienia gym_days
        "gym_prescriptions": {str(k): {dn: g for dn in ("wed", "fri") if (g := gym_for(k, dn, v))}
                              for k, v in WEEKS.items()},
        "week_summary": week_table(days),
    }
    with open(os.path.join(HERE, "program.json"), "w", encoding="utf-8") as f:
        json.dump(program, f, ensure_ascii=False, indent=1)
    with open(os.path.join(HERE, "calendar.json"), "w", encoding="utf-8") as f:
        json.dump({"version": PROGRAM_VERSION, "settings": DEFAULT_SETTINGS, "days": days}, f, ensure_ascii=False, indent=1)
    print("days:", len(days), "first:", days[0]["date"], "last:", days[-1]["date"])

if __name__ == "__main__":
    main()

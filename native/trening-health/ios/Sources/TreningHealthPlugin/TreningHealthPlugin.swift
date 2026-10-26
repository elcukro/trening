import Capacitor
import Foundation
import HealthKit

/**
 * Apple Health dla aplikacji Trening (docs/27 § 2): odczyt jednego dnia – waga, tętno spoczynkowe, HRV z nocy, sen.
 * Liczby wraca w jednostkach aplikacji (kg, bpm, ms, minuty); co z nimi zrobić, decyduje kod TS (`src/day/health.ts`).
 * iOS nie mówi aplikacji, czy odmówiono odczytu – brak danych wygląda tak samo jak brak pomiarów.
 */
@objc(TreningHealthPlugin)
public class TreningHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TreningHealthPlugin"
    public let jsName = "TreningHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readDay", returnType: CAPPluginReturnPromise)
    ]

    private let store = HKHealthStore()
    private let zone = TimeZone(identifier: "Europe/Warsaw") ?? .current

    private var readTypes: Set<HKObjectType> {
        var out = Set<HKObjectType>()
        for id in [HKQuantityTypeIdentifier.bodyMass, .restingHeartRate, .heartRateVariabilitySDNN] {
            if let t = HKObjectType.quantityType(forIdentifier: id) { out.insert(t) }
        }
        if let s = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { out.insert(s) }
        return out
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["granted": false])
            return
        }
        var share = Set<HKSampleType>()
        #if DEBUG
        if seedRequested { share = readTypes.compactMap { $0 as? HKSampleType }.reduce(into: Set<HKSampleType>()) { $0.insert($1) } }
        #endif
        store.requestAuthorization(toShare: share, read: readTypes) { ok, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            #if DEBUG
            if ok && self.seedRequested {
                self.seedDemoData { call.resolve(["granted": ok]) }
                return
            }
            #endif
            // „granted” znaczy tylko, że okno uprawnień się zamknęło – nie, że zawodnik zgodził się na odczyt
            call.resolve(["granted": ok])
        }
    }

    /** `date` = YYYY-MM-DD w strefie Europe/Warsaw. */
    @objc func readDay(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve([:])
            return
        }
        guard let dateStr = call.getString("date"), let dayStart = startOfDay(dateStr) else {
            call.reject("Zła data")
            return
        }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = zone
        let dayEnd = cal.date(byAdding: .day, value: 1, to: dayStart)!
        // noc kończąca się rano tego dnia: od 18:00 poprzedniego do 14:00
        let nightStart = cal.date(byAdding: .hour, value: -6, to: dayStart)!
        let nightEnd = cal.date(byAdding: .hour, value: 14, to: dayStart)!

        let group = DispatchGroup()
        var out: [String: Any] = [:]
        let lock = NSLock()
        func put(_ key: String, _ value: Any) {
            lock.lock()
            out[key] = value
            lock.unlock()
        }

        group.enter()
        latest(.bodyMass, unit: .gramUnit(with: .kilo), from: dayStart, to: dayEnd) { v in
            if let v = v { put("weight_kg", v) }
            group.leave()
        }
        group.enter()
        latest(.restingHeartRate, unit: HKUnit.count().unitDivided(by: .minute()), from: dayStart, to: dayEnd) { v in
            if let v = v { put("resting_hr", v) }
            group.leave()
        }
        group.enter()
        average(.heartRateVariabilitySDNN, unit: .secondUnit(with: .milli), from: nightStart, to: nightEnd) { v in
            if let v = v { put("hrv_ms", v) }
            group.leave()
        }
        group.enter()
        sleepMinutes(from: nightStart, to: nightEnd) { v in
            if let v = v { put("sleep_min", v) }
            group.leave()
        }
        group.notify(queue: .main) { call.resolve(out) }
    }

    // MARK: - zapytania

    private func startOfDay(_ s: String) -> Date? {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = zone
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: s)
    }

    private func samples(_ type: HKSampleType, from: Date, to: Date, done: @escaping ([HKSample]) -> Void) {
        let predicate = HKQuery.predicateForSamples(withStart: from, end: to, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let q = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, results, _ in
            done(results ?? [])
        }
        store.execute(q)
    }

    /** Ostatni pomiar w oknie (waga z wagi łazienkowej, tętno spoczynkowe liczone przez zegarek). */
    private func latest(_ id: HKQuantityTypeIdentifier, unit: HKUnit, from: Date, to: Date, done: @escaping (Double?) -> Void) {
        guard let type = HKObjectType.quantityType(forIdentifier: id) else { return done(nil) }
        samples(type, from: from, to: to) { rows in
            done((rows.first as? HKQuantitySample)?.quantity.doubleValue(for: unit))
        }
    }

    /** Średnia z pomiarów w oknie (HRV z nocy). */
    private func average(_ id: HKQuantityTypeIdentifier, unit: HKUnit, from: Date, to: Date, done: @escaping (Double?) -> Void) {
        guard let type = HKObjectType.quantityType(forIdentifier: id) else { return done(nil) }
        samples(type, from: from, to: to) { rows in
            let values = rows.compactMap { ($0 as? HKQuantitySample)?.quantity.doubleValue(for: unit) }
            done(values.isEmpty ? nil : values.reduce(0, +) / Double(values.count))
        }
    }

    /**
     * Sen główny: suma faz snu (rdzeń, głęboki, REM, „śpi” bez fazy) bez „w łóżku” i „przebudzony”. Zegarek i telefon
     * zapisują tę samą noc osobno – przedziały łączymy, żeby nie liczyć snu dwa razy.
     */
    private func sleepMinutes(from: Date, to: Date, done: @escaping (Int?) -> Void) {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { return done(nil) }
        samples(type, from: from, to: to) { rows in
            // wartości: 0 w łóżku, 1 śpi (bez fazy), 2 przebudzony, 3 rdzeń, 4 głęboki, 5 REM
            let asleep: Set<Int> = [1, 3, 4, 5]
            let spans = rows.compactMap { $0 as? HKCategorySample }
                .filter { asleep.contains($0.value) }
                .map { (max($0.startDate, from), min($0.endDate, to)) }
                .filter { $0.0 < $0.1 }
                .sorted { $0.0 < $1.0 }
            guard !spans.isEmpty else { return done(nil) }
            var total: TimeInterval = 0
            var cur = spans[0]
            for s in spans.dropFirst() {
                if s.0 <= cur.1 { cur.1 = max(cur.1, s.1) } else { total += cur.1.timeIntervalSince(cur.0); cur = s }
            }
            total += cur.1.timeIntervalSince(cur.0)
            done(Int((total / 60).rounded()))
        }
    }

    // MARK: - dane przykładowe (tylko Debug, symulator)

    #if DEBUG
    /** `xcrun simctl launch <urządzenie> <bundle> -TreningHealthSeed YES` – przykładowe dane do testów w symulatorze. */
    private var seedRequested: Bool { UserDefaults.standard.bool(forKey: "TreningHealthSeed") }

    private func seedDemoData(done: @escaping () -> Void) {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = zone
        let today = cal.startOfDay(for: Date())
        var out: [HKSample] = []
        let kg = HKUnit.gramUnit(with: .kilo)
        let bpm = HKUnit.count().unitDivided(by: .minute())
        let ms = HKUnit.secondUnit(with: .milli)
        for back in 0..<14 {
            let day = cal.date(byAdding: .day, value: -back, to: today)!
            let morning = cal.date(byAdding: .minute, value: 6 * 60 + 40, to: day)!
            let night = cal.date(byAdding: .hour, value: 3, to: day)!
            let w = 104.6 - Double(13 - back) * 0.08
            // ostatnie dwie noce z niższym HRV i wyższym tętnem – pokazuje sygnał zmęczenia
            let tired = back < 2
            let hrv = tired ? 31.0 : 44.0 + Double(back % 3) * 2
            let rhr = tired ? 58.0 : 51.0 + Double(back % 2)
            out.append(HKQuantitySample(type: .quantityType(forIdentifier: .bodyMass)!, quantity: HKQuantity(unit: kg, doubleValue: w), start: morning, end: morning))
            out.append(HKQuantitySample(type: .quantityType(forIdentifier: .restingHeartRate)!, quantity: HKQuantity(unit: bpm, doubleValue: rhr), start: morning, end: morning))
            out.append(HKQuantitySample(type: .quantityType(forIdentifier: .heartRateVariabilitySDNN)!, quantity: HKQuantity(unit: ms, doubleValue: hrv), start: night, end: night))
            let bed = cal.date(byAdding: .minute, value: -50, to: day)!
            let wake = cal.date(byAdding: .minute, value: tired ? 5 * 60 + 50 : 6 * 60 + 35, to: day)!
            out.append(HKCategorySample(type: .categoryType(forIdentifier: .sleepAnalysis)!, value: 3, start: bed, end: wake))
        }
        store.save(out) { _, _ in done() }
    }
    #else
    private var seedRequested: Bool { false }
    #endif
}

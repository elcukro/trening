import Capacitor
import Foundation

/**
 * Plik .fit wysłany do aplikacji Trening z arkusza „Udostępnij” / „Otwórz w” (Pliki, Safari po pobraniu z mywhoosh.com –
 * docs/33 § 7a). Aplikacja deklaruje typ dokumentu `.fit` w Info.plist (`CFBundleDocumentTypes`), więc iOS pokazuje ją
 * na liście odbiorców i kopiuje plik do `Documents/Inbox`. Capacitor przekazuje adres pliku przez `capacitorOpenURL`
 * (także przy zimnym starcie – po pierwszym `viewDidAppear`); wtyczka czyta plik, usuwa kopię i wysyła go do JS
 * zdarzeniem `fitFile` – zatrzymanym, aż `/m` doda słuchacza.
 */
@objc(TreningFilesPlugin)
public class TreningFilesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TreningFilesPlugin"
    public let jsName = "TreningFiles"
    public let pluginMethods: [CAPPluginMethod] = []

    /// Jak w Edge Function `fit-upload` – większy plik to na pewno nie jazda.
    private let maxBytes = 8 * 1024 * 1024

    override public func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(openURL(_:)), name: .capacitorOpenURL, object: nil)
    }

    @objc private func openURL(_ note: Notification) {
        guard let object = note.object as? [String: Any], let url = object["url"] as? URL, url.isFileURL, url.pathExtension.lowercased() == "fit" else { return }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url), data.count > 0, data.count <= maxBytes else {
            notifyListeners("fitFile", data: ["name": url.lastPathComponent, "error": "Nie udało się odczytać pliku albo jest za duży (do 8 MB)"], retainUntilConsumed: true)
            return
        }
        // kopia w Inbox jest nasza – po odczycie niepotrzebna (oryginał zostaje w aplikacji, z której przyszedł)
        if url.path.contains("/Inbox/") { try? FileManager.default.removeItem(at: url) }
        notifyListeners("fitFile", data: ["name": url.lastPathComponent, "data": data.base64EncodedString()], retainUntilConsumed: true)
    }
}

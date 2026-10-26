import AuthenticationServices
import Capacitor
import Foundation

/**
 * Logowanie Google i Stravą w aplikacji Trening (docs/28): strona logowania otwiera się w systemowym oknie
 * ASWebAuthenticationSession, a nie w WebView – Google blokuje OAuth w osadzonych przeglądarkach. Okno samo łapie
 * powrót na schemat `trening://`, więc aplikacja nie rejestruje schematu w Info.plist i żadna inna aplikacja
 * nie dostaje adresu powrotu. Ciasteczka są wspólne z Safari (zalogowane konto Google nie pyta o hasło).
 */
@objc(TreningAuthPlugin)
public class TreningAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "TreningAuthPlugin"
    public let jsName = "TreningAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]

    private var session: ASWebAuthenticationSession?

    /// `{ url, callbackScheme }` → `{ url }` adresu powrotu; anulowanie przez użytkownika odrzuca z kodem `CANCELED`.
    @objc func open(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw), let scheme = call.getString("callbackScheme") else {
            call.reject("Brak adresu logowania albo schematu powrotu")
            return
        }
        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { callback, error in
                self.session = nil
                if let callback = callback {
                    call.resolve(["url": callback.absoluteString])
                } else if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin {
                    call.reject("Anulowano logowanie", "CANCELED")
                } else {
                    call.reject(error?.localizedDescription ?? "Logowanie nie powiodło się")
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                self.session = nil
                call.reject("Nie udało się otworzyć okna logowania")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return bridge?.webView?.window ?? ASPresentationAnchor()
    }
}

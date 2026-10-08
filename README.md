# Kochfaul – Wochen-Essensplaner

Web-App fürs Handy: Budget eingeben, Mahlzeiten wählen → Wochenplan mit den aktuellen
Prospekt-Angeboten (Aldi, Lidl, REWE, EDEKA, Netto, Penny, Kaufland, Norma) in Stralsund,
Einkaufsliste und Rezepten mit Schritt-für-Schritt-Anleitung.

## Funktionen
- **Profil:** Personen, PLZ, Märkte, Allergien (14 EU-Allergene + Fruktose/Histamin), weitere No-Gos,
  Ernährungsform, Vorlieben/Abneigungen, Lieblingsgerichte, max. Kochzeit, Küchengeräte, Vorrat.
- **Planen:** Budget, Woche, Mahlzeiten pro Tag (Mittag/Abend), Wünsche, Anzahl Lieblingsgerichte.
- **Angebote:** werden pro PLZ aus den Prospektdaten von marktguru geladen (6 h Cache).
  Klappt das nicht, sucht die KI die Angebote per Websuche.
- **Automatische Prüfung jedes Plans:** echte Angebotspreise statt KI-Schätzung, Budget,
  Allergene/Ernährungsform/Abneigungen per Stichwortliste. Bei Problemen korrigiert die KI den Plan
  (bis zu 2 Runden); was dann noch auffällt, wird rot markiert.
- **Einkaufsliste** nach Markt sortiert, abhaken, teilen.
- **Rezeptbuch:** Rezepte werden beim ersten Antippen von der KI geschrieben und dauerhaft gespeichert.
  Gleiches Gericht = kein neuer KI-Aufruf. Neue Pläne bekommen die bekannten Gerichte mitgeschickt und
  verwenden sie bevorzugt wieder (Abwechslung zur Vorwoche bleibt) – die Kosten sinken mit der Zeit.
- **Kosten:** Standardmodell Claude Sonnet 5.5; die KI-Kosten jedes Plans werden unter dem Plan angezeigt.
- Alle Daten liegen nur auf dem Gerät (localStorage); Export/Import im Profil.

## Starten
```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY eintragen (oder DEMO_MODE=1)
npm run dev
```
Logik-Test: `npx tsx scripts/check-logic.ts`

## Deployment (Vercel)
Repo bei Vercel importieren, Umgebungsvariable `ANTHROPIC_API_KEY` setzen, fertig.
Auf dem iPhone: Seite in Safari öffnen → Teilen → „Zum Home-Bildschirm“.

## Hinweise
- Die marktguru-Schnittstelle ist inoffiziell und kann sich ändern (`src/lib/offers.ts`).
- Die Allergieprüfung ist eine zusätzliche Absicherung, ersetzt aber nicht den Blick auf die Packung.

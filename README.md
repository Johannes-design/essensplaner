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
- **Gemeinsamer Haushalt:** Mit Haushalts-Code + Redis-Datenbank teilen alle Geräte ein Profil, die Pläne,
  die Häkchen der Einkaufsliste und das Rezeptbuch (Abgleich beim Öffnen und alle 20 s).
  Ohne Datenbank bleiben die Daten nur auf dem Gerät. Export/Import im Profil.
- **Kostenschutz:** Ohne gültigen Haushalts-Code keine KI-Anfragen; vor jedem Wochenplan fragt die App nach.

## Starten
```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY eintragen (oder DEMO_MODE=1)
npm run dev
```
Logik-Test: `npx tsx scripts/check-logic.ts` · Lokal mit Test-Datenbank: `REDIS_MOCK=1 HOUSEHOLD_CODE=test DEMO_MODE=1 npm run dev`

## Deployment (Vercel)
1. Repo bei Vercel importieren, Umgebungsvariable `ANTHROPIC_API_KEY` setzen.
2. `HOUSEHOLD_CODE` setzen (der Code, den alle im Haushalt einmal eingeben).
3. Storage → „Upstash for Redis“ (kostenloser Tarif) anlegen und mit dem Projekt verbinden
   (setzt `KV_REST_API_URL`/`KV_REST_API_TOKEN` bzw. `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`).
4. Neu deployen.
Auf dem iPhone: Seite in Safari öffnen → Teilen → „Zum Home-Bildschirm“.

## Hinweise
- Die marktguru-Schnittstelle ist inoffiziell und kann sich ändern (`src/lib/offers.ts`).
- Die Allergieprüfung ist eine zusätzliche Absicherung, ersetzt aber nicht den Blick auf die Packung.

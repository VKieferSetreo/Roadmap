-- News-Eintrag: Zuständige Stelle + Kontakt je Fund (T-614). published_at = now() (Deploy-Zeit).
INSERT INTO news (kategorie, titel, body, created_by) VALUES (
  'version',
  'Neu: Zuständige Stelle & Kontakt direkt am Fund',
  'Jeder Fund zeigt jetzt die zuständige Stelle samt erreichbarem Kontakt — als eigene Kachel unter dem Ticket. Autobahn-Funde verweisen auf die zuständige Großraum- und Schwertransport-Niederlassung der Autobahn GmbH (inkl. GST-Postfach), Bundes- und Landesstraßen auf den jeweiligen Landesbetrieb Straßenbau des Bundeslandes, innerörtliche Straßen auf das Tiefbauamt der Stadt — jeweils mit E-Mail, Telefon und Adresse (Standort als Google-Maps-Link). Die Zuordnung erfolgt automatisch für jeden Fund anhand von Lage und Straßenklasse; die Kontaktdaten stammen aus amtlichen Quellen und werden laufend geprüft.',
  NULL
);

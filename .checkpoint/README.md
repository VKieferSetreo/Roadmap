# Checkpoint 2026-08-09

Rueckfallpunkt vor dem Aufraeum- und Juli-Strang-Block (Bestandsaufnahme T-644).

- **Tag:** `checkpoint-2026-08-09` auf `61e4a923` (auch auf origin gepusht)
- **Branch-Liste:** `branches-2026-08-09.txt` (lokal + remote, je mit SHA)

## Zurueck auf den Stand

    git reset --hard checkpoint-2026-08-09     # Arbeitsbaum auf den Checkpoint
    git checkout -b rettung checkpoint-2026-08-09   # oder als eigener Zweig

## Geloeschten Branch wiederherstellen

    # SHA aus branches-2026-08-09.txt nehmen
    git branch <name> <sha>

Alle beim Aufraeumen geloeschten Branches waren zum Zeitpunkt der Loeschung
restlos in main gemerged (`git cherry main <branch>` = 0 unique Commits).

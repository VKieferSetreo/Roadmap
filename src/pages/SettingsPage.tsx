// Einstellungen — Profil, Kartendarstellung, Demo-Daten.

import { toast } from "sonner"
import { PageContainer } from "@/components/layout/PageContainer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input, Label } from "@/components/ui/Input"
import { Select } from "@/components/ui/Select"
import { Switch } from "@/components/ui/Switch"
import { Button } from "@/components/ui/Button"
import { TILE_LAYERS, useSettingsStore, type TileStyle } from "@/store/settings"
import { useProjectStore } from "@/store/projects"

export function SettingsPage() {
  const { profile, tileStyle, autoFit, setProfile, setTileStyle, setAutoFit } = useSettingsStore()
  const resetToSeed = useProjectStore((s) => s.resetToSeed)

  return (
    <div className="h-full overflow-y-auto">
      <PageContainer
        title="Einstellungen"
        description="Profil und Darstellung der Anwendung."
        width="narrow"
      >
        <div className="flex flex-col gap-5">
          {/* Konto */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Konto</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={profile.name}
                  onChange={(e) => setProfile({ name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="email">E-Mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={profile.email}
                  onChange={(e) => setProfile({ email: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Karte */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Karte</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div>
                <Label htmlFor="tile">Kartenstil</Label>
                <Select
                  id="tile"
                  value={tileStyle}
                  onChange={(e) => setTileStyle(e.target.value as TileStyle)}
                >
                  {Object.entries(TILE_LAYERS).map(([key, t]) => (
                    <option key={key} value={key}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-800">Strecke automatisch einpassen</p>
                  <p className="text-xs text-neutral-500">
                    Kartenausschnitt beim Öffnen auf die gesamte Route zoomen.
                  </p>
                </div>
                <Switch checked={autoFit} onCheckedChange={setAutoFit} ariaLabel="Auto-Einpassen" />
              </div>
            </CardContent>
          </Card>

          {/* Daten */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daten</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-800">Demo-Daten zurücksetzen</p>
                <p className="text-xs text-neutral-500">
                  Ersetzt alle lokalen Projekte durch die Beispieldaten.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  resetToSeed()
                  toast.success("Demo-Daten zurückgesetzt.")
                }}
              >
                Zurücksetzen
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    </div>
  )
}

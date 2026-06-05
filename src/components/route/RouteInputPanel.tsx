import { useState } from "react"
import { Calendar, MapPin, Navigation, Search, Truck } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { mockVehicleProfiles, type VehicleProfile } from "@/data/mockRoute"

export function RouteInputPanel({
  onCheck,
}: {
  onCheck?: () => void
}) {
  const [origin, setOrigin] = useState("Hamburg Hafen")
  const [destination, setDestination] = useState("Berlin BMW-Werk")
  const [profile, setProfile] = useState<VehicleProfile>(mockVehicleProfiles[0])
  const [date, setDate] = useState("2026-06-08")

  return (
    <div className="flex flex-col gap-3 p-4 border-b border-neutral-200">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        <Navigation className="h-3.5 w-3.5" />
        Streckenprüfung
      </div>

      {/* Start / Ziel */}
      <div className="relative flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-[10px] font-bold">
            A
          </span>
          <input
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            className="input-base flex-1"
            placeholder="Start"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
            B
          </span>
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="input-base flex-1"
            placeholder="Ziel"
          />
        </div>
        <div className="absolute left-3 top-9 w-px h-3 bg-neutral-300" aria-hidden />
      </div>

      {/* Fahrzeug-Profil */}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-neutral-600 flex items-center gap-1.5">
          <Truck className="h-3.5 w-3.5" />
          Fahrzeug-Profil
        </span>
        <select
          value={profile.id}
          onChange={(e) =>
            setProfile(
              mockVehicleProfiles.find((p) => p.id === e.target.value) ?? mockVehicleProfiles[0],
            )
          }
          className="input-base"
        >
          {mockVehicleProfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      {/* Maße */}
      <div className="grid grid-cols-4 gap-2">
        <DimInput label="L (m)" value={profile.lengthM} />
        <DimInput label="B (m)" value={profile.widthM} />
        <DimInput label="H (m)" value={profile.heightM} />
        <DimInput label="t" value={profile.weightT} />
      </div>

      {/* Datum */}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-neutral-600 flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          Reisetag
        </span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input-base"
        />
      </label>

      <Button onClick={onCheck} className="w-full mt-1">
        <Search className="h-4 w-4" />
        Strecke prüfen
      </Button>
    </div>
  )
}

function DimInput({ label, value }: { label: string; value: number }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</span>
      <input
        defaultValue={value}
        className="input-base h-8 text-sm text-center tabular-nums"
      />
    </label>
  )
}

// kleines Icon-Marker-Helper export — keiner braucht's draußen, aber bleibt für Konsistenz
export const _MapPin = MapPin

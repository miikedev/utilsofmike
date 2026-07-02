import { createSignal } from "solid-js"

type Position = { lat: number; lng: number }

export default function LocationTool() {
  const [position, setPosition] = createSignal<Position | null>(null)
  const [address, setAddress] = createSignal("")
  const [error, setError] = createSignal("")
  const [loading, setLoading] = createSignal(false)

  async function getLocation() {
    setError("")
    setAddress("")
    setLoading(true)

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.")
      setLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setPosition({ lat, lng })

        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
            { headers: { "Accept-Language": "en" } }
          )
          const data = await res.json()
          setAddress(data.display_name || "")
        } catch {
          setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`)
        }

        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
    )
  }

  return (
    <div class="flex flex-col items-center justify-center min-h-[calc(100vh-12rem)]">
      <div class="rounded-xl border border-amber-200 bg-white p-8 shadow-sm w-full max-w-md">
        <div class="text-4xl mb-4 text-center">📍</div>
        <h2 class="text-xl font-semibold mb-4 text-center text-stone-800">Your Location</h2>

        {!position() && !error() && !loading() && (
            <p class="text-amber-700/70 text-sm text-center mb-4">
            Click the button below to detect your current location.
          </p>
        )}

        {loading() &&           <p class="text-amber-700/70 text-sm text-center mb-4">Getting location...</p>}

        {error() && (
          <p class="text-red-500 text-sm text-center mb-4">{error()}</p>
        )}

        {(() => {
          const pos = position()
          if (!pos) return null
          return (
            <div class="space-y-2 text-sm text-stone-600 mb-4">
              <p><span class="font-semibold">Latitude:</span> {pos.lat.toFixed(6)}</p>
              <p><span class="font-semibold">Longitude:</span> {pos.lng.toFixed(6)}</p>
              {address() && (
                <p class="pt-2 border-t border-amber-100 mt-2">
                  <span class="font-semibold">Address:</span> {address()}
                </p>
              )}
            </div>
          )
        })()}

        <button
          onClick={getLocation}
          disabled={loading()}
          class="w-full px-6 py-3 bg-amber-700 text-white font-semibold rounded-lg shadow-md hover:bg-amber-800 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading() ? "Detecting..." : "Detect My Location"}
        </button>
      </div>
    </div>
  )
}

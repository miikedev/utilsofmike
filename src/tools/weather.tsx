import { createSignal, Show, For } from "solid-js"
import { fetchWeatherApi } from "openmeteo"

type Position = { lat: number; lng: number }

type DailyRow = {
  date: string
  weatherCode: number
  windMean: number
  windMin: number
  windMax: number
  humidity: number
  uvIndex: number
  rain: number
}

const weatherIcons: Record<number, string> = {
  0: "☀️", 1: "🌤", 2: "⛅", 3: "☁️",
  45: "🌫", 48: "🌫",
  51: "🌦", 53: "🌦", 55: "🌦",
  56: "🌧", 57: "🌧",
  61: "🌧", 63: "🌧", 65: "🌧",
  66: "🌧", 67: "🌧",
  71: "🌨", 73: "🌨", 75: "🌨", 77: "❄️",
  80: "🌦", 81: "🌦", 82: "🌦",
  85: "🌨", 86: "🌨",
  95: "⛈", 96: "⛈", 99: "⛈",
}

const weatherDescriptions: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Foggy", 48: "Depositing rime fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
  56: "Light freezing drizzle", 57: "Dense freezing drizzle",
  61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
  66: "Light freezing rain", 67: "Heavy freezing rain",
  71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
  85: "Slight snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
}

function weatherInfo(code: number): { icon: string; description: string } {
  return {
    icon: weatherIcons[code] ?? "❓",
    description: weatherDescriptions[code] ?? "Unknown",
  }
}

function windDirection(deg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
  return dirs[Math.round(deg / 22.5) % 16]
}

export default function Weather() {
  const [position, setPosition] = createSignal<Position | null>(null)
  const [current, setCurrent] = createSignal<{
    temperature: number
    humidity: number
    apparentTemp: number
    weatherCode: number
    windSpeed: number
    windDirection: number
    windGusts: number
    cloudCover: number
    pressure: number
    surfacePressure: number
    rain: number
    showers: number
    precipitation: number
    snowfall: number
    isDay: boolean
    time: Date
  } | null>(null)
  const [daily, setDaily] = createSignal<DailyRow[]>([])
  const [error, setError] = createSignal("")
  const [loading, setLoading] = createSignal(false)
  const [locationName, setLocationName] = createSignal("")

  async function fetchWeather(pos: Position) {
    setError("")
    setCurrent(null)
    setDaily([])
    setLoading(true)
    setPosition(pos)

    try {
      const params = {
        latitude: [pos.lat],
        longitude: [pos.lng],
        current: ["rain", "weather_code", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "cloud_cover", "pressure_msl", "surface_pressure", "showers", "precipitation", "temperature_2m", "relative_humidity_2m", "apparent_temperature", "is_day", "snowfall"],
        daily: ["wind_speed_10m_mean", "relative_humidity_2m_mean", "wind_speed_10m_min", "uv_index_max", "rain_sum", "wind_speed_10m_max", "weather_code"],
        precipitation_unit: "inch",
        timezone: "auto",
      }
      const url = "https://api.open-meteo.com/v1/forecast"
      const responses = await fetchWeatherApi(url, params)
      const response = responses[0]

      const utcOffset = response.utcOffsetSeconds()

      const cur = response.current()!
      setCurrent({
        time: new Date((Number(cur.time()) + utcOffset) * 1000),
        rain: cur.variables(0)!.value(),
        weatherCode: cur.variables(1)!.value(),
        windSpeed: cur.variables(2)!.value(),
        windDirection: cur.variables(3)!.value(),
        windGusts: cur.variables(4)!.value(),
        cloudCover: cur.variables(5)!.value(),
        pressure: cur.variables(6)!.value(),
        surfacePressure: cur.variables(7)!.value(),
        showers: cur.variables(8)!.value(),
        precipitation: cur.variables(9)!.value(),
        temperature: cur.variables(10)!.value(),
        humidity: cur.variables(11)!.value(),
        apparentTemp: cur.variables(12)!.value(),
        isDay: cur.variables(13)!.value() === 1,
        snowfall: cur.variables(14)!.value(),
      })

      const dailyRaw = response.daily()!
      const dailyData: DailyRow[] = []
      const dayCount = (Number(dailyRaw.timeEnd()) - Number(dailyRaw.time())) / dailyRaw.interval()
      for (let i = 0; i < dayCount; i++) {
        const date = new Date((Number(dailyRaw.time()) + i * dailyRaw.interval() + utcOffset) * 1000)
        dailyData.push({
          date: date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
          windMean: dailyRaw.variables(0)!.valuesArray()![i],
          humidity: dailyRaw.variables(1)!.valuesArray()![i],
          windMin: dailyRaw.variables(2)!.valuesArray()![i],
          uvIndex: dailyRaw.variables(3)!.valuesArray()![i],
          rain: dailyRaw.variables(4)!.valuesArray()![i],
          windMax: dailyRaw.variables(5)!.valuesArray()![i],
          weatherCode: dailyRaw.variables(6)!.valuesArray()![i],
        })
      }
      setDaily(dailyData)

      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.lat}&lon=${pos.lng}&addressdetails=1`,
          { headers: { "Accept-Language": "en" } }
        )
        const data = await res.json()
        const addr = data.address
        const city = addr?.city || addr?.town || addr?.village || addr?.municipality || ""
        const country = addr?.country || ""
        setLocationName([city, country].filter(Boolean).join(", "))
      } catch {
        setLocationName(`${pos.lat.toFixed(2)}, ${pos.lng.toFixed(2)}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch weather data")
    }

    setLoading(false)
  }

  async function getLocationAndWeather() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.")
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => fetchWeather({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => setError(err.message),
    )
  }

  return (
    <div class="flex flex-col items-center justify-center min-h-[calc(100vh-12rem)] py-4">
      <div class="rounded-xl border border-amber-200 bg-white p-8 shadow-sm w-full max-w-lg">
        <div class="text-4xl mb-4 text-center">
          <Show when={current()} fallback={"🌤"}>
            {(cur) => weatherInfo(cur().weatherCode).icon}
          </Show>
        </div>
        <h2 class="text-xl font-semibold mb-1 text-center text-stone-800">Weather Forecast</h2>
        {locationName() && (
          <p class="text-amber-700/60 text-sm text-center mb-4">{locationName()}</p>
        )}

        {!current() && !error() && !loading() && (
          <p class="text-amber-700/70 text-sm text-center mb-4">
            Click the button below to detect your location and get the weather forecast.
          </p>
        )}

        {loading() && <p class="text-amber-700/70 text-sm text-center mb-4">Loading weather...</p>}

        {error() && (
          <p class="text-red-500 text-sm text-center mb-4">{error()}</p>
        )}

        <Show when={current()}>
          {(cur) => (
            <div class="mb-6">
              <div class="flex items-center justify-between mb-3">
                <div>
                  <p class="text-4xl font-bold text-stone-800">{Math.round(cur().temperature)}°C</p>
                  <p class="text-amber-700/70 text-sm">
                    Feels like {Math.round(cur().apparentTemp)}°C
                  </p>
                </div>
                <div class="text-right text-sm text-stone-600">
                  <p>{weatherInfo(cur().weatherCode).description}</p>
                  <p class="text-amber-700/60">{cur().time.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
              </div>

              <div class="grid grid-cols-3 gap-3 text-sm text-stone-600 border-t border-amber-100 pt-3">
                <div class="text-center">
                  <p class="font-semibold">{Math.round(cur().humidity)}%</p>
                  <p class="text-amber-700/60 text-xs">Humidity</p>
                </div>
                <div class="text-center">
                  <p class="font-semibold">{Math.round(cur().windSpeed)} km/h</p>
                  <p class="text-amber-700/60 text-xs">{windDirection(cur().windDirection)}</p>
                </div>
                <div class="text-center">
                  <p class="font-semibold">{Math.round(cur().pressure)} hPa</p>
                  <p class="text-amber-700/60 text-xs">Pressure</p>
                </div>
              </div>

              <div class="grid grid-cols-4 gap-2 text-xs text-stone-500 border-t border-amber-100 pt-3 mt-3">
                <div class="text-center">
                  <p class="font-semibold">{Math.round(cur().windGusts)} km/h</p>
                  <p class="text-amber-700/50">Gusts</p>
                </div>
                <div class="text-center">
                  <p class="font-semibold">{cur().cloudCover}%</p>
                  <p class="text-amber-700/50">Clouds</p>
                </div>
                <div class="text-center">
                  <p class="font-semibold">{cur().precipitation.toFixed(2)}"</p>
                  <p class="text-amber-700/50">Precip</p>
                </div>
                <div class="text-center">
                  <p class="font-semibold">{cur().rain.toFixed(2)}"</p>
                  <p class="text-amber-700/50">Rain</p>
                </div>
              </div>
            </div>
          )}
        </Show>

        <Show when={daily().length > 0}>
          <div class="border-t border-amber-100 pt-4">
            <h3 class="text-sm font-semibold text-stone-600 mb-3">7-Day Forecast</h3>
            <div class="space-y-1">
              <For each={daily()}>
                {(day) => {
                  const info = weatherInfo(day.weatherCode)
                  return (
                    <div class="flex items-center justify-between text-sm py-1.5 border-b border-amber-50 last:border-0">
                      <span class="text-stone-600 w-14">{day.date.split(",")[0]}</span>
                      <span class="text-lg" title={info.description}>{info.icon}</span>
                      <span class="text-stone-600 w-16 text-center text-xs hidden sm:block">{info.description}</span>
                      <span class="text-stone-600 w-16 text-right text-xs">
                        <span class="font-semibold">{Math.round(day.windMean)}</span>
                        <span class="text-amber-700/50">/</span>
                        <span>{Math.round(day.windMax)} km/h</span>
                      </span>
                      <span class="text-amber-700/50 text-xs w-12 text-right">
                        {day.rain > 0 ? `${day.rain.toFixed(2)}"` : "—"}
                      </span>
                    </div>
                  )
                }}
              </For>
            </div>
          </div>
        </Show>

        <div class="flex gap-3 mt-6">
          <button
            onClick={getLocationAndWeather}
            disabled={loading()}
            class="flex-1 px-6 py-3 bg-amber-700 text-white font-semibold rounded-lg shadow-md hover:bg-amber-800 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading() ? "Loading..." : "Use My Location"}
          </button>
        </div>
      </div>
    </div>
  )
}

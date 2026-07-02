import { A } from "@solidjs/router"

const tools = [
  { title: "Dice Roller", description: "Roll a virtual 3D dice with realistic animation.", href: "/utils/dice", icon: "🎲" },
  { title: "Location", description: "Detect your current geographic location.", href: "/utils/location", icon: "📍" },
  { title: "Weather", description: "7-day weather forecast powered by Open-Meteo.", href: "/utils/weather", icon: "🌤" },
]

const Utils = () => {
  return (
    <div class="flex flex-col items-center min-h-[calc(100vh-12rem)] pt-8">
      <h1 class="text-4xl sm:text-5xl font-bold mb-3 text-amber-900">Utils</h1>
      <p class="text-amber-700/70 text-lg sm:text-xl mb-12 text-center">A growing collection of handy tools</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-4xl">
      {tools.map((tool) => (
        <A
          href={tool.href}
          class="block rounded-xl border border-amber-200 bg-white p-6 shadow-sm transition hover:shadow-md hover:border-amber-300 hover:-translate-y-0.5"
        >
          <div class="mb-3 text-4xl">{tool.icon}</div>
          <h2 class="text-xl font-semibold mb-1 text-stone-800">{tool.title}</h2>
          <p class="text-amber-700/70 text-sm">{tool.description}</p>
        </A>
      ))}
      </div>
    </div>
  )
}

export default Utils

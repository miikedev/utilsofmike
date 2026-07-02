import changelog from "../data/changelog.json"

const tagColors: Record<string, string> = {
  feature: "bg-amber-100 text-amber-800",
  enhancement: "bg-orange-100 text-orange-800",
  fix: "bg-red-100 text-red-800",
  setup: "bg-stone-200 text-stone-700",
}

const Development = () => {
  return (
    <div class="max-w-2xl mx-auto">
      <h1 class="text-3xl font-bold mb-2 text-amber-900">Development History</h1>
      <p class="text-amber-700/70 mb-8">Changelog of changes and additions to the app.</p>
      <div class="space-y-6">
        {[...changelog].reverse().map((entry) => (
          <div class="border border-amber-200 rounded-xl p-5 bg-white shadow-sm">
            <div class="flex items-start justify-between gap-4 mb-1">
              <h2 class="text-lg font-semibold text-stone-800">{entry.title}</h2>
              <span class="text-sm text-amber-600/60 whitespace-nowrap">{entry.date}</span>
            </div>
            <p class="text-stone-600 text-sm mb-3">{entry.description}</p>
            <div class="flex gap-2">
              {entry.tags.map((tag) => (
                <span class={`text-xs font-medium px-2.5 py-0.5 rounded-full ${tagColors[tag] || "bg-stone-100 text-stone-700"}`}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Development

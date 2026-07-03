import { createSignal } from "solid-js"

type Commit = {
  sha: string
  author: string
  avatar: string
  date: string
  title: string
  description: string
  tag: string
}

const tagColors: Record<string, string> = {
  feature: "bg-stone-100 text-stone-800",
  enhancement: "bg-orange-100 text-orange-800",
  fix: "bg-red-100 text-red-800",
  setup: "bg-stone-200 text-stone-700",
}

const Development = () => {
  const [commits, setCommits] = createSignal<Commit[]>([])
  const [loaded, setLoaded] = createSignal(false)
  const [error, setError] = createSignal(false)

  fetch("/data/commits.json")
    .then((r) => {
      if (!r.ok) throw new Error()
      return r.json()
    })
    .then((data) => {
      setCommits(data)
      setLoaded(true)
    })
    .catch(() => {
      setError(true)
      setLoaded(true)
    })

  return (
    <div class="max-w-2xl mx-auto py-5">
      <h1 class="text-3xl font-bold mb-2 text-stone-300">Development History</h1>
      <p class="text-stone-400 mb-8">Auto-synced from git commits.</p>

      {!loaded() && <p class="text-stone-500 text-center py-12">Loading...</p>}

      {error() && (
        <p class="text-stone-500 text-center py-12">
          No commit data yet. It will appear once the GitHub Actions sync runs.
        </p>
      )}

      {loaded() && !error() && (
        <div class="space-y-6">
          {commits().map((c) => (
            <div class="border border-stone-200 rounded-xl p-5 bg-white shadow-sm">
              <div class="flex items-start justify-between gap-4 mb-1">
                <h2 class="text-lg font-semibold text-stone-800 break-words min-w-0 flex-1">
                  {c.title}
                </h2>
                <span class="text-sm text-stone-500 whitespace-nowrap shrink-0">
                  {c.date}
                </span>
              </div>
              {c.description && (
                <p class="text-stone-600 text-sm mb-3 whitespace-pre-wrap">{c.description}</p>
              )}
              <div class="flex items-center justify-between">
                <span class={`text-xs font-medium px-2.5 py-0.5 rounded-full ${tagColors[c.tag] || "bg-stone-100 text-stone-700"}`}>
                  {c.tag}
                </span>
                <div class="flex items-center gap-2">
                  {c.avatar && (
                    <img src={c.avatar} alt={c.author} class="w-5 h-5 rounded-full" />
                  )}
                  <span class="text-xs text-stone-500">{c.author}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Development

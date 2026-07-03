import { A } from "@solidjs/router"
const sections = [
  { title: "Utils", description: "Handy tools like a dice roller and more.", href: "/utils", icon: "🛠️" },
  { title: "Demographics", description: "See data and concepts come to life.", href: "/demographics ", icon: "📊" },
  { title: "Blogs", description: "Thoughts, notes, and write-ups.", href: "/blogs", icon: "✍️" },
  { title: "About Us", description: "Learn more about this project.", href: "/about", icon: "ℹ️" },
]

const Home = () => {
  return (
    <div class="flex flex-col items-center justify-center min-h-[calc(100vh-20rem)] py-5 sm:pt-12">
      <h1 class="text-4xl sm:text-5xl font-bold mb-3 text-stone-300">Utils</h1>
      <p class="text-stone-400 text-lg sm:text-xl mb-4 text-center">A collection of tools and experiments</p>
      <div class="bg-gradient-to-r from-stone-50 to-stone-100 border border-stone-200 rounded-xl p-5 mb-10 max-w-2xl w-full text-center">
        <p class="text-stone-900 text-sm sm:text-base">
          Welcome to an open-source web app! 🚀 Feel free to contribute, build free tools for community, and level up your <strong>TypeScript</strong> & <strong>SolidJS</strong> skills.
        </p>
      </div> 
      <div class="bg-white border border-stone-200 rounded-xl p-6 mb-10 max-w-2xl w-full text-center">
        <h2 class="text-xl font-semibold text-stone-800 mb-2">Want to contribute?</h2>
        <p class="text-grey-500/70 text-sm mb-4">
          Whether it's fixing a bug, adding a new util, or improving docs — all skill levels welcome.
          Check out <span class="font-medium">good first issues</span> to get started.
        </p>
        <div class="flex flex-wrap justify-center gap-3">
          <a
            href="https://github.com/miikedev/utilsofmike"
            target="_blank"
            rel="noopener noreferrer"
            class="px-4 py-2 rounded-lg bg-stone-600 text-white text-sm font-medium hover:bg-stone-700 transition"
          >
            View on GitHub
          </a>
          <a
            href="https://github.com/miikedev/utilsofmike/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22"
            target="_blank"
            rel="noopener noreferrer"
            class="px-4 py-2 rounded-lg border border-stone-300 text-stone-800 text-sm font-medium hover:bg-stone-50 transition"
          >
            Good First Issues
          </a>
        </div>

      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
        {sections.map((s) => (
          <A
            href={s.href}
            class="block rounded-xl border border-stone-200 bg-white p-5 shadow-sm transition hover:shadow-md hover:border-stone-300 hover:-translate-y-0.5"
          >
            <div class="text-3xl mb-2">{s.icon}</div>
            <h2 class="text-lg font-semibold text-stone-800">{s.title}</h2>
            <p class="text-grey-400/70 text-sm">{s.description}</p>
          </A>
        ))}
      </div>
    </div>
  )
}

export default Home

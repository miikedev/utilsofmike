import AboutIllustration from "../components/about-illustration"

const About = () => {
  return (
    <div class="flex flex-col items-center justify-center min-h-[calc(100vh-12rem)]">
      <h1 class="text-3xl sm:text-4xl font-bold mb-6 text-amber-900">About</h1>
      <AboutIllustration />
      <div class="max-w-xl text-center text-stone-600 text-lg leading-relaxed space-y-4 mt-6">
        <p>
          Hi, I'm Mike. This is my little corner of the web — a place where I build
          tools, experiment with ideas, and share things I find interesting.
        </p>
        <p>
          Everything here is built with a focus on simplicity and practicality.
          If something catches your eye, feel free to explore.
        </p>
      </div>
    </div>
  )
}

export default About
import {A} from "@solidjs/router"
const navs = [
    "home", "visualization", "blogs", "news", "utils", "development", "about",
]
const Navbar = () => {
  return (
    <nav class='fixed top-0 left-1/2 -translate-x-1/2 p-3 sm:p-5 mt-5 z-50 bg-white/90 backdrop-blur-sm shadow-sm shadow-amber-200/40 sm:w-auto rounded-full'>
        <ul class='flex gap-2 sm:gap-4 justify-center'>
        {
            navs.map(n => (<A href={n} activeClass="underline decoration-amber-600 underline-offset-4"><li class="font-medium hover:text-amber-700 text-sm sm:text-base md:text-lg whitespace-nowrap text-stone-700 transition-colors">
                {n.charAt(0).toUpperCase() + n.slice(1)}
            </li></A>))
        }
        </ul>
    </nav>
  )
}

export default Navbar
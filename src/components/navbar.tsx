import {A, useLocation} from "@solidjs/router"

type NavItem = { label: string; href: string; comingSoon?: boolean }

const navs: NavItem[] = [
    { label: "Home", href: "/" },
    { label: "Demographics", href: "/demographics", comingSoon: true },
    { label: "Blogs", href: "/blogs", comingSoon: true },
    { label: "News", href: "/news", comingSoon: true },
    { label: "Utils", href: "/utils" },
    { label: "Development", href: "/development" },
    { label: "About", href: "/about" },
]
const Navbar = () => {
  const location = useLocation()
  return (
    <nav class='fixed top-0 left-1/2 -translate-x-1/2 p-3 sm:p-5 mt-5 z-50 bg-white/90 backdrop-blur-sm shadow-sm shadow-black/10 rounded-md sm:rounded-full min-w-[93vw] lg:min-w-[50vw]'>
        <ul class='flex flex-wrap gap-x-5 gap-y-1 sm:gap-4 justify-center'>
        {
            navs.map(n => n.comingSoon ? (
                <li class="font-medium text-lg sm:text-base md:text-lg whitespace-nowrap text-stone-400 cursor-not-allowed transition-colors relative group">
                    {n.label}
                    <span class="ml-1 text-[10px] align-top text-stone-500 font-semibold">soon</span>
                </li>
            ) : (
                <A href={n.href} end activeClass="underline decoration-stone-600 underline-offset-4">
                    <li class="font-medium hover:text-stone-900 text-xl sm:text-md md:text-lg whitespace-nowrap text-stone-700 transition-colors">
                        {n.label}
                    </li>
                </A>
            ))
        }
        </ul>
    </nav>
  )
}

export default Navbar
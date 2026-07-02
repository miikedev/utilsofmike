import { A } from "@solidjs/router"
import type { JSX } from "solid-js"

type Props = {
  title: string
  description: string
  href: string
  icon?: JSX.Element
}

export default function FeatureCard(props: Props) {
  return (
    <A
      href={props.href}
      class="block rounded-xl border border-amber-200 bg-white p-6 shadow-sm transition hover:shadow-md hover:border-amber-300"
    >
      {props.icon && <div class="mb-3 text-3xl">{props.icon}</div>}
      <h2 class="text-xl font-semibold mb-1 text-stone-800 break-words">{props.title}</h2>
      <p class="text-amber-700/70 text-sm">{props.description}</p>
    </A>
  )
}

import type { JSX } from "solid-js"

const UtilsWrapper = (props: { children?: JSX.Element }) => {
  return (
    <div>
      {props.children}
    </div>
  )
}

export default UtilsWrapper

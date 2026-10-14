import React from "react"

// Number of streamed blocks already on screen. It starts at the first render's
// count, so blocks present when a message mounts (initial render, scrolling
// back into view) never animate; only blocks committed later do. Growth is
// recorded after commit, so blocks that mount in the growing render still see
// the old count and animate.
//
// `placeholder` marks the single plain block a large reply shows while the
// worker parses it. The worker's split of that same text is not new content,
// so leaving the placeholder resets the count during render, before the split
// blocks mount.
export const useEnteredBlockCount = (blockCount: number, live: boolean, placeholder = false): number => {
  const [state, setState] = React.useState({ entered: blockCount, placeholder })
  if (state.placeholder !== placeholder) {
    setState({ entered: blockCount, placeholder })
  }
  React.useEffect(() => {
    if (!live || placeholder) setState((current) => ({ ...current, entered: blockCount }))
    else if (blockCount > state.entered) setState((current) => ({ ...current, entered: blockCount }))
  }, [blockCount, live, placeholder, state.entered])
  return state.placeholder !== placeholder ? blockCount : state.entered
}

import React from "react"

// Number of streamed blocks already on screen. It starts at the first render's
// count, so blocks present when a message mounts (initial render, scrolling
// back into view) never animate; only blocks committed later do.
export const useEnteredBlockCount = (blockCount: number, live: boolean): number => {
  const [entered, setEntered] = React.useState(blockCount)
  React.useEffect(() => {
    if (!live) setEntered(blockCount)
    else if (blockCount > entered) setEntered(blockCount)
  }, [blockCount, entered, live])
  return entered
}

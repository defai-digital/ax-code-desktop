const OUTPUT_CHARACTER_THRESHOLD = 32_768
const OUTPUT_LINE_THRESHOLD = 200

export const shouldVirtualizeToolOutput = (text: string): boolean => {
  if (text.length >= OUTPUT_CHARACTER_THRESHOLD) return true
  let lines = 1
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) === 10 && ++lines > OUTPUT_LINE_THRESHOLD) return true
  }
  return false
}

export const downloadToolOutput = (text: string): void => {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }))
  try {
    const link = document.createElement("a")
    link.href = url
    link.download = "tool-output.txt"
    document.body.appendChild(link)
    try {
      link.click()
    } finally {
      link.remove()
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

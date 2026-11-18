export const slugifyWorktreeName = (value: string): string => {
  return value
    .trim()
    .replace(/^refs\/heads\//, "")
    .replace(/^heads\//, "")
    .replace(/\s+/g, "-")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .join("-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

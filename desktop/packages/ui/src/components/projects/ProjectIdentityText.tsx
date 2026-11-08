import React from "react"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { compactProjectContext } from "@/lib/projectPathLabel"
import { formatPathForDisplay } from "@/lib/utils"

interface ProjectIdentityTextProps {
  label: string
}

/** Visible suffixes stay distinct; the complete identity remains available to assistive technology and hover. */
export function ProjectIdentityText(props: ProjectIdentityTextProps): React.ReactNode {
  const projects = useProjectsStore((state) => state.projects)
  const home = useDirectoryStore((state) => state.homeDirectory)
  const peers = React.useMemo(
    () => projects.map((project) => formatPathForDisplay(project.path, home)),
    [projects, home],
  )
  const compact = compactProjectContext(props.label, peers)
  const contextSeparator = props.label.lastIndexOf(" · ")
  const hasPathContext =
    contextSeparator >= 0 && /^(?:\/|~\/|[A-Za-z]:[\\/])/.test(props.label.slice(contextSeparator + 3))
  const separator = hasPathContext ? compact.lastIndexOf(" · ") : -1
  const pathStyle: React.CSSProperties = { direction: "rtl", textAlign: "left", unicodeBidi: "plaintext" }
  return (
    <span className="block min-w-0 max-w-full" title={props.label} aria-label={props.label}>
      {separator >= 0 ? <span className="block truncate">{compact.slice(0, separator)}</span> : null}
      <span className="block truncate" style={pathStyle}>
        {separator >= 0 ? compact.slice(separator + 3) : compact}
      </span>
    </span>
  )
}

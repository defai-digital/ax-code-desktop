# ADR-017: Analysis routing without a dedicated Streamlit runtime

Status: Accepted for user-authorized implementation on 2026-10-18.
Supersedes ADR-016 for the dedicated app handoff and the Streamlit-specific project execution behavior; preserves its ownership and permission boundaries.
PRD: PRD-2026-10-18-analysis-routing-v5.md.

Remove the dedicated Streamlit path from Desktop. Historical declarations remain readable Markdown. Migrate valid version-1 saved recipe settings to quoted generic commands only when the stored command matches the generated command; preserve explicitly edited commands. Keep normal project action and browser behavior, without Python provisioning or framework discovery.

AX Code owns canonical analysis-output routing and its ordinary MCP client. AX BI owns governed analytics, authentication and its upload/MCP interfaces. No second analytics runtime or SDK is added to Desktop. BI's external Streamlit catalog is independent and remains unchanged; Python orchestration is not relocated there.

Paired records: AX Code ADR-257; AX BI ADR-0007. Specification: SPEC-2026-10-18-analysis-routing-v2.md. Old and new runtime/Desktop combinations remain usable because fences are readable and static/generic project workflows remain available. Exact signed pins change only in a separately qualified release.

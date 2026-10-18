// Shared regression inputs for automated tests and the local browser fixture.
export const mermaidFixtures = {
  flowchart: 'flowchart LR\n A["\u958b\u59cb"] --> B["\u5b8c\u6210"]',
  "stateDiagram-v2": "stateDiagram-v2\n [*] --> Ready\n Ready --> Done",
  sequenceDiagram: "sequenceDiagram\n Alice->>Bob: Hello\n Bob-->>Alice: Ready",
  classDiagram: "classDiagram\n class Project {\n +String name\n }",
  erDiagram: "erDiagram\n PROJECT ||--o{ TASK : contains",
  "xychart-beta": 'xychart-beta\n x-axis [Jan, Feb]\n y-axis "Tasks" 0 --> 10\n bar [3, 8]',
  pie: 'pie title Project status\n "\u5b8c\u6210" : 60\n "\u9032\u884c\u4e2d" : 40',
  gantt:
    "gantt\n title Delivery\n dateFormat YYYY-MM-DD\n section Work\n Design :a1, 2026-10-01, 3d\n Build :after a1, 5d",
  mindmap: "mindmap\n root((Project))\n  Design\n  Build\n  Test",
  timeline: "timeline\n title Delivery\n 2026 : Design\n 2027 : Release",
  quadrantChart:
    "quadrantChart\n title Priorities\n x-axis Low effort --> High effort\n y-axis Low value --> High value\n Task: [0.3, 0.8]",
  "sankey-beta": "sankey-beta\n\nPlanned,Active,10\nActive,Done,7",
  "treemap-beta": 'treemap-beta\n "Project"\n  "Design": 30\n  "Build": 70',
}
export const largeMermaidFixture = `flowchart LR\n${Array.from({ length: 180 }, (_, i) => ` N${i} --> N${i + 1}`).join("\n")}`

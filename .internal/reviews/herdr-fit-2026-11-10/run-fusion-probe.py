"""Mount the existing fusion component with two identity boundary cases; leave product source untouched."""

import hashlib
import json
from pathlib import Path
import subprocess
import time


ROOT = Path(__file__).resolve().parents[3]
ARTIFACTS = Path(__file__).resolve().parent
BASE = ROOT / "desktop/packages/ui/src/components/multirun/MultiRunFusionDialog.test.tsx"
PROBE = BASE.with_name("MultiRunFusionDialog.herdr-audit-probe.test.tsx")
CASES = '''
  test("audit probe: fusion excludes another metadata group with the same title slug", () => {
    const lane = (id: string, groupId: string, title: string) => ({
      id, title, metadata: { multiRun: { groupId, variantId: `${groupId}.${id}` } },
    })
    primary = lane("s1", "launch-a", "demo/p1/m1/1")
    sibling = lane("s2", "launch-a", "demo/p2/m2/2")
    const anotherLaunch = lane("s3", "launch-b", "demo/p3/m3/3")
    liveSessions.current = [primary, sibling, anotherLaunch]
    projects.current = [{ id: "repo", path: "/repo" }]
    for (const id of ["s1", "s2", "s3"]) sessionDirectories.current.set(id, "/repo")
    renderDialog(true)
    expect(sourceRowTitles(container)).toEqual([primary.title, sibling.title])
  })

  test("audit probe: metadata grouping survives a renamed representative", () => {
    primary = {
      id: "s1", title: "Renamed primary",
      metadata: { multiRun: { groupId: "launch-a", variantId: "launch-a.1" } },
    }
    sibling = {
      id: "s2", title: "demo/p2/m2/2",
      metadata: { multiRun: { groupId: "launch-a", variantId: "launch-a.2" } },
    }
    liveSessions.current = [primary, sibling]
    renderDialog(true)
    expect(sourceRowTitles(container)).toHaveLength(2)
  })
'''


if __name__ == "__main__":
    if PROBE.exists():
        raise SystemExit("Refusing to overwrite an existing probe")
    source = BASE.read_text()
    source = source.replace(
        "type SessionStub = { id: string; title: string; time?: { created?: number; updated?: number } }",
        "type SessionStub = { id: string; title: string; time?: { created?: number; updated?: number }; "
        "metadata?: { multiRun: { groupId: string; variantId: string } } }",
    )
    offset = source.rfind("\n})")
    if offset < 0:
        raise SystemExit("Existing fixture shape changed")
    source = source[:offset] + "\n" + CASES + source[offset:]
    command = ["pnpm", "--dir", "desktop/packages/ui", "run", "test", str(PROBE.relative_to(ROOT / "desktop/packages/ui"))]
    started = time.monotonic()
    try:
        PROBE.write_text(source)
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=120)
        (ARTIFACTS / "fusion-probe.log").write_text(result.stdout + result.stderr)
        receipt = {
            "command": command, "exit_code": result.returncode,
            "elapsed_seconds": round(time.monotonic() - started, 2),
            "base_fixture": str(BASE.relative_to(ROOT)),
            "base_sha256": hashlib.sha256(BASE.read_bytes()).hexdigest(),
            "expected": "Seven existing tests pass; two new mounted-component identity expectations fail on current source.",
            "scope": "Mocked stores with the real fusion component; no provider calls, filesystem worktrees or app qualification.",
        }
        (ARTIFACTS / "fusion-probe.receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
        print(result.stdout + result.stderr)
    finally:
        PROBE.unlink(missing_ok=True)

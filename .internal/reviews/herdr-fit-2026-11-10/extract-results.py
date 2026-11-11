"""Export final text and model usage, excluding raw reasoning and transport/account metadata."""

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
RAW = Path("/tmp/ax-desktop-herdr-fit-20261110")


for round_name in ["independent", "challenge", "final"]:
    for name in ["claude", "grok", "muse"]:
        stem = f"{round_name}-{name}"
        receipt_file = ROOT / f"{stem}.receipt.json"
        receipt = json.loads(receipt_file.read_text())
        raw = (RAW / f"{stem}.stdout").read_text()
        if receipt["exit_code"] != 0:
            raise SystemExit(f"{stem}: consultation did not complete")
        if name == "muse":
            events = [json.loads(line) for line in raw.splitlines() if line.strip()]
            completed = [event for event in events if event.get("payload_type") == "run.terminal.completed"]
            if not completed:
                raise SystemExit(f"{stem}: no completed terminal event")
            answer = completed[-1]["payload"]["text"]
            usage = [event["payload"] for event in events if event.get("payload_type") == "run.usage"]
            receipt["reported_model_usage"] = usage[-1].get("models", []) if usage else []
        else:
            data = json.loads(raw)
            if data.get("is_error"):
                raise SystemExit(f"{stem}: model returned an error")
            answer = data.get("result", data.get("text", ""))
            receipt["reported_model_usage"] = data.get("modelUsage", {})
            receipt["reported_cost_usd"] = data.get("total_cost_usd")
            receipt["stop_reason"] = data.get("stopReason", data.get("stop_reason"))
        if not answer.strip():
            raise SystemExit(f"{stem}: empty answer")
        output = ROOT / f"{stem}.md"
        output.write_text(answer.rstrip() + "\n")
        receipt["output"] = output.name
        receipt["output_sha256"] = hashlib.sha256(output.read_bytes()).hexdigest()
        receipt["input_sha256"] = hashlib.sha256((ROOT / receipt["input"]).read_bytes()).hexdigest()
        receipt["identity_limit"] = "Requested CLI model and native usage receipt; not an independent attestation of vendor weights."
        receipt_file.write_text(json.dumps(receipt, indent=2) + "\n")
        print(stem, list(receipt["reported_model_usage"]) if name != "muse" else [row["model"] for row in receipt["reported_model_usage"]])

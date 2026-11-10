#!/usr/bin/env python3
"""Export the six aircraft from ww2_aircraft_builders.js to GLB for the Godot port.

Runs tools/export_aircraft_glb.html in headless Chromium (real canvas, so the painted camo and
insignia textures come out exactly as in the web game), reads the result back from the dumped DOM
and writes Aerials_godot/models/aircraft/<id>.glb + <id>.json (names of the animated parts).

Usage:  python3 Aerials_web/tools/export_aircraft_glb.py      (re-run whenever ww2_aircraft_builders.js changes)
"""
import base64
import html
import json
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = ROOT / "tools" / "export_aircraft_glb.html"
OUT = ROOT.parent / "Aerials_godot" / "models" / "aircraft"  # ROOT is Aerials_web/


def find_browser() -> str:
    for name in ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable"):
        path = shutil.which(name)
        if path:
            return path
    sys.exit("No Chromium / Chrome found on PATH.")


def main() -> None:
    dom = subprocess.run(
        [find_browser(), "--headless", "--disable-gpu", "--no-sandbox", "--allow-file-access-from-files",
         "--virtual-time-budget=60000", "--dump-dom", PAGE.as_uri()],
        capture_output=True, text=True, timeout=300, check=True,
    ).stdout
    match = re.search(r'<pre id="export">(.*?)</pre>', dom, re.S)
    if not match:
        sys.exit("Export page produced no output (did the builders throw before it finished?)")
    results = json.loads(html.unescape(match.group(1)))

    OUT.mkdir(parents=True, exist_ok=True)
    failed = False
    for plane_id, result in results.items():
        if "error" in result:
            print(f"{plane_id}: FAILED\n{result['error']}")
            failed = True
            continue
        glb = base64.b64decode(result["glb"])
        (OUT / f"{plane_id}.glb").write_bytes(glb)
        (OUT / f"{plane_id}.json").write_text(json.dumps(result["hooks"], indent=1))
        hooks = result["hooks"]
        print(f"{plane_id}: {len(glb) / 1024:.0f} KB, props={len(hooks['propellers'])}, "
              f"gear parts={len(hooks['gear'])}, elevators={len(hooks['elevators'])}, rudders={len(hooks['rudders'])}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

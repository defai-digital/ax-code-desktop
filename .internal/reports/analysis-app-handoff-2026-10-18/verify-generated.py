"""Verify the real model-produced artifact against Streamlit and the Desktop runner."""
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import subprocess
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET

from streamlit.testing.v1 import AppTest

base = Path(__file__).resolve().parent
receipt = json.loads((base / 'interactive-explicit-receipt.json').read_text())
fixture = base / 'fixtures/interactive-explicit'
events = [json.loads(line) for line in (base / 'interactive-explicit-raw.jsonl').read_text().splitlines()]
result = next(item for item in events if item['type'] == 'result')
assert result['status'] == 'completed'
artifact = json.loads(re.search(r'```ax-code-app\n(.*?)\n```', result['text'], re.S)[1])
assert artifact == {'version': 1, 'kind': 'streamlit', 'entrypoint': 'streamlit_app.py'}
os.chdir(fixture)
app = AppTest.from_file(str(fixture / artifact['entrypoint'])).run(timeout=20)
assert not app.exception
assert app.metric[1].value == '$850'
assert len(app.get('download_button')) == 1
app.sidebar.multiselect[0].set_value(['East']).run()
assert not app.exception and app.metric[1].value == '$360'
assert len(app.dataframe[0].value) == 3
app.sidebar.multiselect[0].set_value([]).run()
assert not app.exception and len(app.info) == 1

guided = AppTest.from_file(str(base / 'fixtures/interactive-guided/streamlit_app.py')).run(timeout=20)
assert not guided.exception and '360' in guided.markdown[0].value
assert len(guided.get('file_uploader')) == 1 and len(guided.get('download_button')) == 1
guided.selectbox[0].set_value('West').run()
assert not guided.exception and '490' in guided.markdown[0].value

static = base / 'fixtures/static'
svg = ET.parse(static / 'monthly_revenue.svg').getroot()
assert svg.tag == '{http://www.w3.org/2000/svg}svg'
assert '250' in ''.join(svg.itertext()) and '300' in ''.join(svg.itertext())
assert not any(element.tag.endswith('script') for element in svg.iter())

runner = base.parents[2] / 'desktop/packages/ui/src/lib/streamlitRunner.py'
options = {'version': 1, 'entrypoint': artifact['entrypoint'], 'interpreter': sys.executable, 'token': 'generated-app-smoke', 'setup': False}
log = base / 'generated-runner.log'
process = subprocess.Popen([sys.executable, str(runner), json.dumps(options)], cwd=fixture, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
selector = selectors.DefaultSelector()
selector.register(process.stdout, selectors.EVENT_READ)
lines = []
url = None
try:
    deadline = time.monotonic() + 25
    while time.monotonic() < deadline:
        for key, _ in selector.select(.2):
            line = key.fileobj.readline()
            lines.append(line)
            if line.startswith('AX_CODE_STREAMLIT '):
                event = json.loads(line[18:])
                assert event['stage'] not in ('failed', 'setup-required')
                if event['stage'] == 'launching': url = event['url']
        if url:
            try:
                with urllib.request.urlopen(url.rstrip('/') + '/_stcore/health', timeout=1) as response:
                    if response.status == 200: break
            except OSError:
                pass  # Connection refused until the server accepts; retry until the deadline.
        if process.poll() is not None: raise RuntimeError('Runner exited before ready')
    else: raise RuntimeError('Readiness timeout')
finally:
    process.terminate()
    process.wait(timeout=10)
    lines.append(process.stdout.read())
    selector.close()
    log.write_text(''.join(lines))
assert url and any(line.strip() == 'URL: ' + url.rstrip('/') for line in ''.join(lines).splitlines())
try:
    urllib.request.urlopen(url.rstrip('/') + '/_stcore/health', timeout=1)
except OSError:
    stopped = True
else:
    stopped = False
assert stopped
summary = {'completed': True, 'model': receipt['model'], 'artifact': artifact, 'defaultTotal': 850, 'eastTotal': 360, 'eastRows': 3, 'emptySelectionHandled': True, 'downloadControlPresent': True, 'guidedAppEastTotal': 360, 'guidedAppWestTotal': 490, 'guidedAppUploadControlPresent': True, 'svgXmlValid': True, 'runnerHttpReady': True, 'actualUrlObserved': True, 'stopFreedListener': stopped, 'python': sys.version, 'runnerSha256': hashlib.sha256(runner.read_bytes()).hexdigest(), 'qualification': 'Real generated app with Streamlit AppTest plus actual Python runner/HTTP lifecycle. Desktop renderer/click/terminal adapter are covered by React behavioral tests; this is not a signed installed-app end-to-end test.'}
(base / 'generated-app-validation.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary))

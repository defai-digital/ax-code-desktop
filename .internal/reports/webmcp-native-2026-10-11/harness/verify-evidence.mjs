// Validate the real native probe controls and repeated candidate observations.
// These records are research evidence, not AX Code execution receipts.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = name => JSON.parse(readFileSync(new URL(`../${name}.json`, import.meta.url), 'utf8'))
const controls = [
  ['electron-42.5.2-default', '42.5.2', false, null],
  ['electron-42.5.2-webmcp', '42.5.2', true, 'navigator'],
  ['electron-44.7.0-default', '44.7.0', false, null],
]
for (const [name, electron, enabled, api] of controls) {
  const result = read(name)
  assert.equal(result.electron, electron)
  assert.equal(result.webmcpFeatureEnabled, enabled)
  assert.equal(result.fixture.api, api)
  assert.equal(result.nativeSmokePassed, false)
  assert.equal(result.invocations.length, 0)
}
for (const name of ['electron-44.7.0-webmcp', 'electron-44.7.0-webmcp-repeat']) {
  const result = read(name)
  assert.equal(result.electron, '44.7.0')
  assert.equal(result.chromium, '152.0.7977.130')
  assert.equal(result.surface, 'WebContentsView')
  assert.equal(result.webmcpFeatureEnabled, true)
  assert.equal(result.installedChromeUsed, false)
  assert.equal(result.remoteDebuggingPortUsed, false)
  assert.equal(result.fixture.api, 'document')
  assert.equal(result.fixture.secureContext, true)
  assert.equal(result.fixture.nodeVisible, false)
  assert.equal(result.nativeDomainAvailable, true)
  assert.equal(result.nativeSmokePassed, true)
  assert.equal(result.productionQualified, false)
  assert.deepEqual(result.tools.map(tool => tool.name).sort(), ['probe_echo', 'probe_form'])
  assert.deepEqual(result.invocations.map(call => call.name).sort(), ['probe_echo', 'probe_form'])
  for (const invocation of result.invocations) {
    assert.equal(invocation.status, 'Completed')
    assert.deepEqual(invocation.output, { value: 'native-probe-value' })
  }
  assert.equal(result.fixtureAfterInvocation.executions, 1)
  assert.equal(result.fixtureAfterInvocation.submissions, 1)
  assert.equal(result.fixtureAfterInvocation.agentInvoked, true)
  assert.deepEqual(result.removalEvents.flatMap(event => event.params.tools.map(tool => tool.name)).sort(),
    ['probe_echo', 'probe_form'])
  assert.deepEqual(result.emptyDocumentTools, [])
}
console.log('Verified 3 native controls and 2 independent candidate processes on macOS arm64.')

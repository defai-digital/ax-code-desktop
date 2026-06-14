const { describe, expect, test } = require('bun:test')
const {
  collectOpenPathCandidates,
  normalizeCandidate,
} = require('./open-paths')

describe('normalizeCandidate', () => {
  test('resolves relative paths against cwd', () => {
    expect(normalizeCandidate('repo', {
      cwd: '/Users/example/work',
      platform: 'darwin',
    })).toBe('/Users/example/work/repo')
  })

  test('decodes file urls', () => {
    expect(normalizeCandidate('file:///Users/example/My%20Repo', {
      cwd: '/tmp',
      platform: 'darwin',
    })).toBe('/Users/example/My Repo')
  })

  test('rejects flags, non-file urls, and the app executable', () => {
    expect(normalizeCandidate('--inspect', {
      cwd: '/tmp',
      platform: 'darwin',
    })).toBeNull()
    expect(normalizeCandidate('https://example.com/repo', {
      cwd: '/tmp',
      platform: 'darwin',
    })).toBeNull()
    expect(normalizeCandidate('/Applications/AX Code Desktop.app/Contents/MacOS/AX Code Desktop', {
      cwd: '/tmp',
      platform: 'darwin',
      appExecutablePath: '/Applications/AX Code Desktop.app/Contents/MacOS/AX Code Desktop',
    })).toBeNull()
  })
})

describe('collectOpenPathCandidates', () => {
  test('deduplicates candidates with platform path semantics', () => {
    expect(collectOpenPathCandidates([
      'C:\\Users\\Example\\Repo',
      'c:\\Users\\Example\\Repo',
      '--enable-logging',
      'nested',
    ], {
      cwd: 'C:\\Users\\Example',
      platform: 'win32',
      appExecutablePath: 'C:\\Program Files\\AX Code Desktop\\AX Code Desktop.exe',
    })).toEqual([
      'C:\\Users\\Example\\Repo',
      'C:\\Users\\Example\\nested',
    ])
  })
})

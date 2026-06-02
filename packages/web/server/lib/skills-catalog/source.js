const GITHUB_HOST = 'github.com';

function normalizeGitOwnerRepo(owner, repo) {
  const normalizedOwner = String(owner || '').trim();
  const normalizedRepo = String(repo || '').trim().replace(/\.git$/i, '');
  if (!normalizedOwner || !normalizedRepo) {
    return null;
  }
  return { owner: normalizedOwner, repo: normalizedRepo };
}

function splitNonEmptyPath(value) {
  return String(value || '').split('/').filter(Boolean);
}

function parseRemoteSource(raw, urlFormat) {
  if (urlFormat === 'https') {
    const url = new URL(raw);
    const pathSegments = splitNonEmptyPath(url.pathname);
    return { host: url.host, pathSegments };
  }

  if (urlFormat === 'ssh') {
    const [, afterUser = ''] = raw.split('@');
    const [host, pathValue = ''] = afterUser.split(':');
    return { host, pathSegments: splitNonEmptyPath(pathValue) };
  }

  return null;
}

function repoPartsFromSegments(pathSegments) {
  if (!Array.isArray(pathSegments) || pathSegments.length < 2) {
    return null;
  }

  const repoName = pathSegments[pathSegments.length - 1];
  const gitOwner = pathSegments.slice(0, -1).join('/');
  return normalizeGitOwnerRepo(gitOwner, repoName);
}

function buildParsedRepoSource({ host, owner, repo, effectiveSubpath }) {
  return {
    ok: true,
    host,
    owner,
    repo,
    cloneUrlSsh: `git@${host}:${owner}/${repo}.git`,
    cloneUrlHttps: `https://${host}/${owner}/${repo}.git`,
    effectiveSubpath,
    normalizedRepo: `${owner}/${repo}`,
  };
}

export function parseSkillRepoSource(input, options = {}) {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) {
    return { ok: false, error: { kind: 'invalidSource', message: 'Repository source is required' } };
  }
  const explicitSubpath = typeof options.subpath === 'string' && options.subpath.trim() ? options.subpath.trim() : null;

  const urlFormat = raw.startsWith('https://') ? 'https' : raw.startsWith('git@') ? 'ssh' : 'shorthand';
  const remote = parseRemoteSource(raw, urlFormat);
  const gitHost = remote?.host ?? null;

  if (gitHost === null && urlFormat !== 'shorthand') {
    return { ok: false, error: { kind: 'invalidSource', message: 'Invalid repository URL format' } };
  }

  // SSH git@host:owner/repo(.git) or HTTPS https://host/owner/repo(.git)
  if (urlFormat === 'ssh' || urlFormat === 'https') {
    const parsed = repoPartsFromSegments(remote?.pathSegments);
    if (!parsed) {
      return { ok: false, error: { kind: 'invalidSource', message: `Invalid ${urlFormat} repository URL` } };
    }

    return buildParsedRepoSource({
      host: gitHost,
      owner: parsed.owner,
      repo: parsed.repo,
      // For SSH URLs, subpath is only accepted via options.subpath
      effectiveSubpath: explicitSubpath,
    });
  }

  // Shorthand: owner/repo[/subpath...]
  const shorthandMatch = raw.match(/^([^/\s]+)\/([^/\s]+)(?:\/(.+))?$/);
  if (shorthandMatch) {
    const parsed = normalizeGitOwnerRepo(shorthandMatch[1], shorthandMatch[2]);
    if (!parsed) {
      return { ok: false, error: { kind: 'invalidSource', message: 'Invalid repository source' } };
    }

    const shorthandSubpath = typeof shorthandMatch[3] === 'string' && shorthandMatch[3].trim() ? shorthandMatch[3].trim() : null;
    const effectiveSubpath = explicitSubpath || shorthandSubpath;

    return buildParsedRepoSource({
      host: GITHUB_HOST,
      owner: parsed.owner,
      repo: parsed.repo,
      effectiveSubpath,
    });
  }

  return { ok: false, error: { kind: 'invalidSource', message: 'Unsupported repository source format' } };
}

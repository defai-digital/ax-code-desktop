export const API_BASE_PATH = '/api' as const;

export const API_ENDPOINTS = {
  config: {
    settings: `${API_BASE_PATH}/config/settings`,
    reload: `${API_BASE_PATH}/config/reload`,
  },
  files: {
    findFile: `${API_BASE_PATH}/find/file`,
    fsList: `${API_BASE_PATH}/fs/list`,
    fsMkdir: `${API_BASE_PATH}/fs/mkdir`,
    fsStat: `${API_BASE_PATH}/fs/stat`,
    fsRead: `${API_BASE_PATH}/fs/read`,
    fsWrite: `${API_BASE_PATH}/fs/write`,
    fsDelete: `${API_BASE_PATH}/fs/delete`,
    fsRename: `${API_BASE_PATH}/fs/rename`,
    fsRaw: `${API_BASE_PATH}/fs/raw`,
    fsReveal: `${API_BASE_PATH}/fs/reveal`,
  },
  github: {
    authStatus: `${API_BASE_PATH}/github/auth/status`,
    authStart: `${API_BASE_PATH}/github/auth/start`,
    authComplete: `${API_BASE_PATH}/github/auth/complete`,
    auth: `${API_BASE_PATH}/github/auth`,
    authActivate: `${API_BASE_PATH}/github/auth/activate`,
    me: `${API_BASE_PATH}/github/me`,
    prStatus: `${API_BASE_PATH}/github/pr/status`,
    prCreate: `${API_BASE_PATH}/github/pr/create`,
    prUpdate: `${API_BASE_PATH}/github/pr/update`,
    prMerge: `${API_BASE_PATH}/github/pr/merge`,
    prReady: `${API_BASE_PATH}/github/pr/ready`,
    repoUpstream: `${API_BASE_PATH}/github/repo/upstream`,
    repoBranches: `${API_BASE_PATH}/github/repo/branches`,
    pullsList: `${API_BASE_PATH}/github/pulls/list`,
    pullsContext: `${API_BASE_PATH}/github/pulls/context`,
    issuesList: `${API_BASE_PATH}/github/issues/list`,
    issuesGet: `${API_BASE_PATH}/github/issues/get`,
    issuesComments: `${API_BASE_PATH}/github/issues/comments`,
  },
  tools: {
    ids: `${API_BASE_PATH}/experimental/tool/ids`,
  },
  notifications: {
    stream: `${API_BASE_PATH}/notifications/stream`,
  },
} as const;

export const HTTP_QUERY_STRINGS = {
  true: 'true',
  false: 'false',
  one: '1',
} as const;

export const HTTP_DEFAULTS = {
  method: {
    get: 'GET',
    post: 'POST',
    put: 'PUT',
    delete: 'DELETE',
  },
  headers: {
    acceptJson: {
      Accept: 'application/json',
    },
    contentTypeJson: {
      'Content-Type': 'application/json',
    },
    acceptAndContentTypeJson: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  },
  runtime: {
    web: 'web',
    desktop: 'desktop',
  },
  terminal: {
    defaultRetryMaxRetries: 3,
    defaultInitialRetryDelayMs: 1000,
    defaultMaxRetryDelayMs: 8000,
    defaultConnectionTimeoutMs: 10000,
  },
  cache: {
    noStore: 'no-store',
    default: 'default',
  },
} as const;

export const buildQueryUrl = (path: string, params?: URLSearchParams | string): string => {
  if (!params) {
    return path;
  }
  const query = typeof params === 'string' ? params : params.toString();
  if (!query) {
    return path;
  }
  return `${path}?${query}`;
};

// Synthetic credentials only. Shared by preview, export, and actual checker-entry tests.
export const secret = "AUDIT_FAKE_PASSWORD"
export const compoundKeys = ["api key", "access key", "private key", "one time", "card number", "key pair id", "client secret", "auth token"].flatMap((key) => ["  ", "\t", "._- \t", "\n"].map((separator) => key.replaceAll(" ", separator)))
const keys = [
  ...compoundKeys,
  "API key", "private key", "access token", "client secret", "secret key", "auth token", "session id", "x-api-key", "Api-Key",
  "token",
  "sig",
  "secret",
  "password",
  "passwd",
  "passphrase",
  "api_key",
  "accessKey",
  "private-key",
  "authorization",
  "cookie",
  "session",
  "otp",
  "pin",
  "cvv",
  "credential",
  "recovery",
  "seed",
  "client_secret",
  "prefix_auth_token_suffix",
]
const wrappers = [
  (text) => text,
  (text) => `Validation failed: {${text}}`,
  (text) => `\`\`\`json\n{${text}}\n\`\`\``,
  (text) => `Nested: ${JSON.stringify(`{${text}}`)}`,
  (text) => `Twice: ${JSON.stringify(JSON.stringify(`{${text}}`))}`,
  (text) => `Escaped: ${JSON.stringify(`{${text}}`).replaceAll("password", "\\u0070assword")}`,
]
export const credentialTextCases = keys.flatMap((key) =>
  ["", '"', "'", "`"].flatMap((quote) =>
    [":", "=", " : \n"].flatMap((separator) =>
      wrappers.map((wrap) => wrap(`${quote}${key}${quote}${separator}"${secret}"`)),
    ),
  ),
)

credentialTextCases.push(
  ...[
    `https://u:${secret}@example.test/`,
    `https://${secret}@example.test/`,
    `//u:${secret}@example.test/`,
    `https://example.test/?%74oken=${secret}`,
    ...["?", "#", "#/route?", "/route;", "/"].flatMap((prefix) =>
      ["access%5F%74%6f%6b%65%6e", "%2561pi%255fkey", "%ZZ%74oken"].map(
        (name) => `https://example.test/${prefix}${name}=${secret}`,
      ),
    ),
    `https://example.test/?ok=1&%61pi%5fkey=${secret}`,
    `https://example.test/%74oken=${secret}/../public`,
    `https://example.test/#safe=1&access%5F%74%6f%6b%65%6e=${secret}`,
    `https://example.test/#/route;safe=1;%61pi%5fkey=${secret}`,
    `/#access%5F%74%6f%6b%65%6e=${secret}`,
    `custom:route?%61pi%5fkey=${secret}`,
    `https://example.test/?%70assword=${secret}#details`,
  ].flatMap((url) => wrappers.map((wrap) => wrap(url))),
)

// Real-world credential URL shapes, using synthetic values only.
export const credentialUrlShapes = [
  ["Azure SAS", `https://account.blob.core.windows.net/container/file?sv=2024-11-04&sp=r&sr=b&se=2030-01-01&sig=${secret}`],
  ["AWS signature", `https://bucket.s3.amazonaws.com/file?X-Amz-Signature=${secret}`],
  ["AWS credential", `https://bucket.s3.amazonaws.com/file?X-Amz-Credential=${secret}`],
  ["AWS session", `https://bucket.s3.amazonaws.com/file?X-Amz-Security-Token=${secret}`],
  ["Google signature", `https://storage.googleapis.com/bucket/file?X-Goog-Signature=${secret}`],
  ["Google credential", `https://storage.googleapis.com/bucket/file?X-Goog-Credential=${secret}`],
  ["CloudFront", `https://cdn.example.test/file?Policy=${secret}&Key-Pair-Id=example`],
  ["CloudFront signature", `https://cdn.example.test/file?Signature=${secret}`],
  ["Generic signature", `https://example.test/file?signature=${secret}`],
  ["Encoded OAuth callback", `https://example.test/callback?%2563ode=${secret}&state=example`],
  ["OAuth callback", `https://example.test/callback?code=${secret}&state=example`],
]
credentialTextCases.push(...credentialUrlShapes.flatMap(([, url]) => wrappers.map((wrap) => wrap(url))))

// Explicit contexts protect even a single-character credential.
credentialTextCases.push(
  ...["a", "abc123"].flatMap((value) => [
    ...["Bearer", "Basic"].flatMap((scheme) => wrappers.map((wrap) => wrap(`${scheme} ${value}`))),
    ...keys.flatMap((key) => [
      ...wrappers.map((wrap) => wrap(`"${key}":"${value}"`)),
      ...["?", "#", "#/route?", "/route;", "/"].map((prefix) => `https://example.test/${prefix}${encodeURIComponent(key)}=${value}`),
    ]),
    `Authorization: ${value}`,
    `Authorization: Bearer ${value}`,
    `Authorization: Basic ${value}`,
  ]),
)

credentialTextCases.push(...["code", "state", "%2563ode", "%2573tate"].flatMap((key) => ["?", "#", "#/route?"].map((prefix) => `https://example.test/${prefix}${key}=a`)))

// Field-name context applies to every sibling value spelling, regardless of member order or depth.
export const fieldContextCases = [
  "name", "key", "field", "property", "path", "param", "parameter", "instancePath", "pointer",
].flatMap((fieldKey) => [
  "password", "account.password", "/account/password", "#/account/password", "/account/api~1key", "/account/api.key", "/account/sig",
  ["account", "password"],
  "recoveryCodes[0]", "/recoveryCodes/0", ["recoveryCodes", 0], "a.b.password.0",
  "/credentials/title", "account.password.title", ["password", "title"],
  "fields['password'][0]", "#/recoveryCodes/0", ["account", "recoveryCodes", 0, 1],
].flatMap((fieldName) => [
  "value", "got", "actual", "received", "input", "given", "provided", "data",
].map((valueKey) => ({
  fieldKey, fieldName, valueKey,
  input: { [valueKey]: secret, [fieldKey]: fieldName, constraint: "minLength" },
  expected: { [valueKey]: "[redacted]", [fieldKey]: fieldName, constraint: "minLength" },
}))))

// Text and structured diagnostic paths must agree at every preview/checker boundary.
credentialTextCases.push(...[
  'auth["api.key"]', "auth['private.key'][0]", "auth[api_key][0]", "auth[`sig`][0]",
].flatMap((name) => wrappers.map((wrap) => wrap(`${name} = ${secret}`))))

fieldContextCases.push(...[
  [{ got: secret }, { got: "[redacted]" }],
  [[{ received: secret }], [{ received: "[redacted]" }]],
  [{ nested: { actual: secret } }, { nested: { actual: "[redacted]" } }],
  [JSON.stringify({ got: secret }), JSON.stringify({ got: "[redacted]" })],
].map(([details, expected]) => ({
  fieldKey: "field", fieldName: "api_key", valueKey: "got",
  input: { field: "api_key", details, constraint: "minLength" },
  expected: { field: "api_key", details: expected, constraint: "minLength" },
})))

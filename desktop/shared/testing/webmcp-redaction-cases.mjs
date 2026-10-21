// Synthetic credentials only. Shared by preview, export, and actual checker-entry tests.
export const secret = "AUDIT_FAKE_PASSWORD"
const keys = [
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

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

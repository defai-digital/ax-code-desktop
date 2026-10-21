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

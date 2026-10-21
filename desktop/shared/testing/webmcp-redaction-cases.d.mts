export const secret: string
export const credentialTextCases: string[]

export const compoundKeys: string[]
export const fieldContextCases: {
  fieldKey: string
  fieldName: string | (string | number)[]
  valueKey: string
  input: Record<string, unknown>
  expected: Record<string, unknown>
}[]

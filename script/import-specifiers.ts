import path from "node:path"
import ts from "typescript"

export type ImportSpecifier = {
  specifier: string
  line: number
  column: number
}

function scriptKind(file: string) {
  switch (path.extname(file).toLowerCase()) {
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS
    case ".jsx":
      return ts.ScriptKind.JSX
    case ".tsx":
      return ts.ScriptKind.TSX
    default:
      return ts.ScriptKind.TS
  }
}

/**
 * Extract statically knowable module specifiers without matching comments,
 * string contents, or other source text that merely resembles an import.
 */
export function extractImportSpecifiers(source: string, file = "source.ts"): ImportSpecifier[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file))
  const specifiers: ImportSpecifier[] = []

  function unwrapParentheses(node: ts.Expression | undefined) {
    let current = node
    while (current && ts.isParenthesizedExpression(current)) current = current.expression
    return current
  }

  function add(node: ts.Expression | undefined) {
    const literal = unwrapParentheses(node)
    if (!literal || !ts.isStringLiteralLike(literal)) return
    const position = sourceFile.getLineAndCharacterOfPosition(literal.getStart(sourceFile))
    specifiers.push({
      specifier: literal.text,
      line: position.line + 1,
      column: position.character + 1,
    })
  }

  function isCreateRequireFactory(node: ts.Expression) {
    return (
      ts.isCallExpression(node) &&
      ((ts.isIdentifier(node.expression) && node.expression.text === "createRequire") ||
        (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "createRequire"))
    )
  }

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier)
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression)
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require"
      // `createRequire(import.meta.url)("../electron/src/x.js")` is a require call whose callee is
      // itself a call; the outer call's first argument is still a statically known specifier.
      const isCreateRequire = isCreateRequireFactory(node.expression)
      if (isDynamicImport || isRequire || isCreateRequire) add(node.arguments[0])
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return specifiers
}

import ts from 'typescript';

export interface InvalidFile {
  path: string;
  error: string;
}

/**
 * Parses each generated file and returns the ones that do not parse: JSON with
 * JSON.parse, JS/TS (and JSX/TSX) with the TypeScript parser. Syntax only; types and
 * imports are the project's own build's job.
 */
export function validateGeneratedFiles(files: Array<{ path: string; content: string }>): InvalidFile[] {
  const invalid: InvalidFile[] = [];
  for (const file of files) {
    const error = syntaxError(file.path, file.content);
    if (error) invalid.push({ path: file.path, error });
  }
  return invalid;
}

export function syntaxError(path: string, content: string): string | null {
  if (path.endsWith('.json')) {
    try {
      JSON.parse(content);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'invalid JSON';
    }
  }
  const match = path.match(/\.(tsx?|jsx?|mjs|cjs)$/);
  if (!match) return null;
  const result = ts.transpileModule(content, {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, allowJs: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, noEmit: false }
  });
  const syntactic = (result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (!syntactic.length) return null;
  return ts.flattenDiagnosticMessageText(syntactic[0].messageText, '\n');
}

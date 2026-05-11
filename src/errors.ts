export function formatError(error: unknown): string {
  if (error instanceof Error) return `Error: ${error.message}`;
  return `Error: ${String(error)}`;
}

export function ghError(stderr: string, path: string): string {
  if (stderr.includes('404')) return `Error: File not found: ${path}`;
  if (stderr.includes('409')) return `Error: Conflict writing ${path} — SHA mismatch, retry`;
  if (stderr.includes('401') || stderr.includes('403')) return `Error: GitHub auth failed. Run: gh auth login`;
  return `Error: GitHub operation failed for ${path}: ${stderr.slice(0, 200)}`;
}

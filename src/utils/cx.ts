/** Join class names, dropping falsy ones. No merge logic — ui/ owns the vocabulary. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

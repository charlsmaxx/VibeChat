/** Strip old cache-bust query params and append a fresh one for React Native Image. */
export function avatarDisplayUri(uri: string | null | undefined, revision: number): string | undefined {
  if (!uri) return undefined;
  const base = uri.replace(/([?&])(v|t)=[^&]*/g, '').replace(/[?&]$/, '');
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}t=${revision}`;
}

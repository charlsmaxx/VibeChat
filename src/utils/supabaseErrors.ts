/** User-facing copy for common PostgREST / Postgres errors from Supabase client. */
export function formatSupabaseWriteError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code?: string }).code ?? '');
    const message = String((err as { message?: string }).message ?? '');
    if (code === '23505' || message.includes('duplicate key')) {
      if (/phone_number|profiles_phone/i.test(message)) {
        return 'That phone number is already linked to another account. Use a different number or leave it empty.';
      }
      if (/username|profiles_username/i.test(message)) {
        return 'That username is already taken. Try another.';
      }
      return 'This value is already in use. Change username or phone and try again.';
    }
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}

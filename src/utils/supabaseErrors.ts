function readErr(err: unknown): { code: string; message: string } {
  if (!err || typeof err !== 'object') {
    return { code: '', message: err instanceof Error ? err.message : '' };
  }
  const o = err as { code?: string; message?: string; error?: string };
  const message = String(o.message ?? o.error ?? '');
  const code = String(o.code ?? o.error ?? '');
  return { code, message };
}

/** Maps storage / PostgREST errors to actionable messages (profile photo, uploads). */
export function formatSupabaseError(err: unknown): string {
  const { code, message } = readErr(err);
  const lower = message.toLowerCase();

  if (
    /database schema is invalid|schema is invalid|incompatible|databaseschemamismatch/i.test(message)
  ) {
    return (
      'Supabase Storage is not set up for this project. In the dashboard open Storage, then run ' +
      'supabase/fix_profiles_avatars.sql in the SQL Editor and try again.'
    );
  }

  if (lower.includes('infinite recursion')) {
    return 'Database chat policies need updating. Run supabase/fix_chat_rls_and_avatars.sql in the Supabase SQL Editor.';
  }

  if (code === 'PGRST204' || lower.includes('schema cache') || /column.*does not exist/i.test(message)) {
    return (
      'Your profiles table is missing columns (e.g. avatar_url or bio). ' +
      'Run supabase/fix_profiles_avatars.sql in the Supabase SQL Editor, then try again.'
    );
  }

  if (
    code === 'NoSuchBucket' ||
    lower.includes('bucket not found') ||
    /not_found/i.test(code) && lower.includes('bucket')
  ) {
    return 'The avatars storage bucket is missing. Run supabase/fix_profiles_avatars.sql in the SQL Editor.';
  }

  if (code === '23505' || lower.includes('duplicate key')) {
    if (/phone_number|profiles_phone/i.test(message)) {
      return 'That phone number is already used by another account.';
    }
    if (/username|profiles_username/i.test(message)) {
      return 'That username is already taken.';
    }
  }

  if (
    code === '403' ||
    lower.includes('row-level security') ||
    lower.includes('access denied') ||
    lower.includes('unauthorized') ||
    code === 'Unauthorized'
  ) {
    return 'Permission denied. Run supabase/fix_critical.sql in Supabase, then sign out and back in.';
  }

  if (code === 'InvalidMimeType' || lower.includes('mime')) {
    return 'That image format is not supported. Try another photo or take a new picture.';
  }

  if (message) return message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}

/** User-facing copy for common PostgREST / Postgres errors from Supabase client. */
export function formatSupabaseWriteError(err: unknown): string {
  const { code, message } = readErr(err);
  if (code === '23505' || message.includes('duplicate key')) {
    if (/phone_number|profiles_phone/i.test(message)) {
      return 'That phone number is already linked to another account. Use a different number or leave it empty.';
    }
    if (/username|profiles_username/i.test(message)) {
      return 'That username is already taken. Try another.';
    }
    return 'This value is already in use. Change username or phone and try again.';
  }
  return formatSupabaseError(err);
}

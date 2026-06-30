/** Stable Agora numeric uid from Supabase user uuid (non-zero). */
export function agoraUidFromUserId(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  const uid = Math.abs(hash) % 2147483646;
  return uid === 0 ? 1 : uid;
}

/** Treat a peer as offline if their last heartbeat is older than this. */
const ONLINE_STALENESS_MS = 90_000;

/**
 * A peer is "online" only when the DB flag is true AND their last_seen is recent.
 * Prevents a stale is_online=true (e.g. app killed without going background) from
 * showing "Online" forever.
 */
export function isPeerOnline(isOnline: boolean | null | undefined, lastSeen: string | null | undefined): boolean {
  if (!isOnline) return false;
  if (!lastSeen) return false;
  const ts = new Date(lastSeen).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < ONLINE_STALENESS_MS;
}

export function formatLastSeen(iso: string | null | undefined): string {
  if (!iso) return 'Offline';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Offline';

  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();

  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Last seen today at ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) return `Last seen yesterday at ${time}`;

  return `Last seen ${d.toLocaleDateString()} at ${time}`;
}

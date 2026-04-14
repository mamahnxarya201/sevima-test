/** Short relative label for UI subtitles (e.g. "Last updated …"). */
export function formatRelativeTime(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  const t = date.getTime();
  if (Number.isNaN(t)) return '';

  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

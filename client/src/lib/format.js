export function timeOfDay(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

export function firstName(name = '') {
  return name.trim().split(/\s+/)[0] || 'there';
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Theme-specific date line: editorial for Library, compact for Studio, ISO-ish for Lab. */
export function themedDate(theme, date = new Date()) {
  if (theme === 'library') {
    const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });
    const month = date.toLocaleDateString(undefined, { month: 'long' });
    return `${weekday}, the ${ordinal(date.getDate())} of ${month}`;
  }
  if (theme === 'lab') {
    const iso = date.toISOString().slice(0, 10);
    const t = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${iso} · ${t}`;
  }
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function formatDate(value, opts = { dateStyle: 'medium' }) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, opts).format(new Date(value));
}

export function relativeTime(value) {
  if (!value) return '—';
  const diff = (new Date(value).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, secs] of units) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return 'just now';
}

/** Best-effort human label for a user-agent string. */
export function describeUserAgent(ua = '') {
  if (!ua) return 'Unknown device';
  const browser =
    (/Edg\//.test(ua) && 'Edge') ||
    (/OPR\//.test(ua) && 'Opera') ||
    (/Firefox\//.test(ua) && 'Firefox') ||
    (/Chrome\//.test(ua) && 'Chrome') ||
    (/Safari\//.test(ua) && 'Safari') ||
    (/node|undici|curl|PostmanRuntime/i.test(ua) && 'API client') ||
    'Browser';
  const os =
    (/Windows/.test(ua) && 'Windows') ||
    (/Android/.test(ua) && 'Android') ||
    (/iPhone|iPad|iOS/.test(ua) && 'iOS') ||
    (/Mac OS X/.test(ua) && 'macOS') ||
    (/Linux/.test(ua) && 'Linux') ||
    '';
  return os ? `${browser} on ${os}` : browser;
}

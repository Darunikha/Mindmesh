import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeUserAgent, firstName, formatDate, relativeTime, themedDate, timeOfDay } from './format.js';
import { formatBytes, isBusy, resourceDetail, resourcePath } from '../components/library/resourceMeta.js';
import { cn } from './cn.js';

describe('timeOfDay', () => {
  it.each([
    [0, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [17, 'afternoon'],
    [18, 'evening'],
    [23, 'evening'],
  ])('at %i:00 it is %s', (hour, expected) => {
    expect(timeOfDay(new Date(2026, 0, 5, hour, 30))).toBe(expected);
  });
});

describe('firstName', () => {
  it('takes the first word, ignoring extra spaces', () => {
    expect(firstName('Ada Lovelace')).toBe('Ada');
    expect(firstName('   Grace   Hopper  ')).toBe('Grace');
    expect(firstName('Plato')).toBe('Plato');
  });
  it('falls back to “there” when there is no name', () => {
    expect(firstName('')).toBe('there');
    expect(firstName('   ')).toBe('there');
    expect(firstName()).toBe('there');
  });
});

describe('themedDate', () => {
  it('Lab uses an ISO date and a 24-hour time', () => {
    expect(themedDate('lab', new Date(Date.UTC(2026, 2, 5, 12, 0)))).toMatch(/^2026-03-05 · \d\d:\d\d$/);
  });

  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [23, '23rd'],
    [30, '30th'],
    [31, '31st'],
  ])('Library writes day %i as “the %s”', (day, ordinal) => {
    expect(themedDate('library', new Date(2026, 0, day, 12))).toContain(`the ${ordinal} of`);
  });

  it('Studio and any other theme use the short form, without the Library’s wording', () => {
    const d = new Date(2026, 2, 5, 12);
    expect(themedDate('studio', d)).not.toMatch(/the \d+(st|nd|rd|th) of/);
    expect(themedDate('studio', d)).toMatch(/5/);
    expect(themedDate('anything-else', d)).toBe(themedDate('studio', d));
  });
});

describe('formatDate and relativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  const ago = (seconds) => new Date(Date.now() - seconds * 1000).toISOString();

  it('shows a dash for missing dates', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
    expect(relativeTime(null)).toBe('—');
    expect(relativeTime(undefined)).toBe('—');
  });

  it('formats real dates', () => {
    expect(formatDate('2026-03-05T12:00:00Z')).toMatch(/2026/);
    expect(formatDate('2026-03-05T12:00:00Z', { year: 'numeric' })).toBe('2026');
  });

  it('says “just now” for the last minute', () => {
    expect(relativeTime(ago(0))).toBe('just now');
    expect(relativeTime(ago(45))).toBe('just now');
    expect(relativeTime(new Date(Date.now() + 30_000).toISOString())).toBe('just now');
  });

  it.each([
    [5 * 60, /5 minutes ago/],
    [60, /1 minute ago/],
    [3 * 3600, /3 hours ago/],
    [86400, /yesterday/],
    [3 * 86400, /3 days ago/],
    [14 * 86400, /2 weeks ago/],
    [60 * 86400, /2 months ago/],
    [2 * 365 * 86400, /2 years ago/],
  ])('%i seconds ago reads naturally', (seconds, pattern) => {
    expect(relativeTime(ago(seconds))).toMatch(pattern);
  });

  it('also handles the future', () => {
    expect(relativeTime(new Date(Date.now() + 3 * 3600 * 1000).toISOString())).toMatch(/in 3 hours/);
    expect(relativeTime(new Date(Date.now() + 86400 * 1000).toISOString())).toMatch(/tomorrow/);
  });
});

describe('describeUserAgent', () => {
  const ua = {
    edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0',
    opera: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 OPR/115.0',
    firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
    chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
    safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
    safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
    curl: 'curl/8.4.0',
    node: 'node',
    mystery: 'Totally/1.0 (SomeOS)',
  };

  it.each([
    ['edge', 'Edge on Windows'],
    ['opera', 'Opera on Windows'],
    ['firefox', 'Firefox on Linux'],
    ['chromeAndroid', 'Chrome on Android'],
    ['safariMac', 'Safari on macOS'],
    ['safariIphone', 'Safari on iOS'],
    ['curl', 'API client'],
    ['node', 'API client'],
    ['mystery', 'Browser'],
  ])('%s → %s', (key, expected) => {
    expect(describeUserAgent(ua[key])).toBe(expected);
  });

  it('copes with a missing agent', () => {
    expect(describeUserAgent()).toBe('Unknown device');
    expect(describeUserAgent('')).toBe('Unknown device');
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1, '1 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1024 * 1024 - 1, '1024.0 KB'],
    [1024 * 1024, '1.0 MB'],
    [25 * 1024 * 1024, '25.0 MB'],
  ])('%i bytes → %s', (n, expected) => {
    expect(formatBytes(n)).toBe(expected);
  });
  it('shows a dash when the size is unknown', () => {
    expect(formatBytes(undefined)).toBe('—');
    expect(formatBytes(null)).toBe('—');
  });
});

describe('resourceDetail, resourcePath and isBusy', () => {
  it('counts words in notes, and treats a missing count as zero', () => {
    expect(resourceDetail({ type: 'note', note: { wordCount: 1 } })).toBe('1 words');
    expect(resourceDetail({ type: 'note' })).toBe('0 words');
  });

  it('describes documents, with page counts only when known and correct pluralisation', () => {
    expect(resourceDetail({ type: 'document', file: { label: 'PDF', pageCount: 3, size: 2048 } })).toBe('PDF · 3 pages · 2.0 KB');
    expect(resourceDetail({ type: 'document', file: { label: 'Word', size: 100 } })).toBe('Word · 100 B');
    expect(resourceDetail({ type: 'document', file: { pageCount: 1, size: 5 } })).toBe('1 page · 5 B');
  });

  it('describes links by their site, or nothing', () => {
    expect(resourceDetail({ type: 'link', link: { domain: 'example.com' } })).toBe('example.com');
    expect(resourceDetail({ type: 'link' })).toBe('');
  });

  it('builds the address of an item', () => {
    expect(resourcePath({ id: 'abc123' })).toBe('/vault/abc123');
  });

  it('knows which items are still being processed', () => {
    expect(isBusy({ processing: { status: 'pending' } })).toBe(true);
    expect(isBusy({ processing: { status: 'processing' } })).toBe(true);
    expect(isBusy({ processing: { status: 'ready' } })).toBe(false);
    expect(isBusy({ processing: { status: 'failed' } })).toBe(false);
    expect(isBusy({})).toBe(false);
    expect(isBusy(undefined)).toBe(false);
  });
});

describe('cn', () => {
  it('joins class names, skipping anything falsy', () => {
    expect(cn('a', false, null, undefined, '', 'b', 0 && 'c')).toBe('a b');
  });
  it('flattens arrays and handles conditionals', () => {
    expect(cn(['a', false, 'b'], true && 'c', false && 'd')).toBe('a b c');
    expect(cn()).toBe('');
  });
});

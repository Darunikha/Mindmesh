import dns from 'node:dns';
import net from 'node:net';
import { Agent, fetch } from 'undici';
import * as cheerio from 'cheerio';
import env from '../config/env.js';
import { ExtractionError, extractPdf, htmlToText } from './extractors.js';

/**
 * Fetches user-supplied URLs safely (SSRF protection):
 *  - only http/https, max 5 redirects, each hop re-validated
 *  - every DNS answer is checked; private, loopback, link-local and metadata ranges are refused
 *    at connect time, which also defeats DNS-rebinding between check and connect
 *  - timeouts, a response size cap and a content-type allow-list
 *  - robots.txt is honoured: a disallowed page is saved as a bookmark only
 */

const USER_AGENT = 'MindmeshBot/0.2 (+personal knowledge library; fetches pages a user saves)';
const MAX_REDIRECTS = 5;

function ipv4ToInt(ip) {
  return ip.split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKS = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].map(([base, bits]) => [ipv4ToInt(base), bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0]);

export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKS.some(([base, mask]) => (n & mask) === (base & mask));
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return (
      lower === '::' ||
      lower === '::1' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      /^fe[89ab]/.test(lower) ||
      lower.startsWith('ff') ||
      lower.startsWith('64:ff9b:') ||
      lower.startsWith('2001:db8')
    );
  }
  return true;
}

export class FetchError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/** DNS lookup used for every outbound connection; exported for tests. */
export function guardedLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(new FetchError(`Could not find the website "${hostname}".`, 'FETCH_DNS'));
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: options.family || 4 }];
    if (!env.ALLOW_PRIVATE_LINK_FETCH && list.some((a) => isPrivateAddress(a.address))) {
      return callback(new FetchError('This address points to a private or local network and cannot be fetched.', 'FETCH_BLOCKED'));
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

const agent = new Agent({
  connect: { lookup: guardedLookup, timeout: 8000 },
  headersTimeout: env.LINK_FETCH_TIMEOUT_MS,
  bodyTimeout: env.LINK_FETCH_TIMEOUT_MS,
});

export function validatePublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchError('That does not look like a valid URL.', 'URL_INVALID');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new FetchError('Only http and https links can be saved.', 'URL_PROTOCOL');
  if (url.username || url.password) throw new FetchError('Links with embedded credentials are not allowed.', 'URL_CREDENTIALS');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && !env.ALLOW_PRIVATE_LINK_FETCH && isPrivateAddress(host)) {
    throw new FetchError('This address points to a private or local network and cannot be fetched.', 'FETCH_BLOCKED');
  }
  if (!env.ALLOW_PRIVATE_LINK_FETCH && /(^|\.)(localhost|internal|local)$/i.test(host)) {
    throw new FetchError('This address points to a private or local network and cannot be fetched.', 'FETCH_BLOCKED');
  }
  url.hash = '';
  return url;
}

async function readCapped(body, maxBytes) {
  const chunks = [];
  let total = 0;
  let truncated = false;
  for await (const chunk of body) {
    total += chunk.length;
    if (total > maxBytes) {
      chunks.push(chunk.subarray(0, chunk.length - (total - maxBytes)));
      truncated = true;
      break;
    }
    chunks.push(chunk);
  }
  if (truncated) await body.cancel?.().catch(() => {});
  return { buffer: Buffer.concat(chunks), truncated };
}

/** GET with manual, re-validated redirects. Returns { url, status, contentType, buffer, truncated }. */
export async function safeGet(rawUrl, { maxBytes = env.LINK_MAX_BYTES, accept = 'text/html,application/xhtml+xml,text/plain;q=0.9,application/pdf;q=0.8,*/*;q=0.5' } = {}) {
  let url = validatePublicUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res;
    try {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        dispatcher: agent,
        signal: AbortSignal.timeout(env.LINK_FETCH_TIMEOUT_MS),
        headers: { 'user-agent': USER_AGENT, accept, 'accept-language': 'en;q=0.9,*;q=0.5' },
      });
    } catch (err) {
      const cause = err?.cause;
      if (cause instanceof FetchError) throw cause;
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new FetchError('The website took too long to respond.', 'FETCH_TIMEOUT');
      throw new FetchError('The website could not be reached.', 'FETCH_UNREACHABLE');
    }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      await res.body?.cancel().catch(() => {});
      if (!location) throw new FetchError('The website returned a redirect without a destination.', 'FETCH_REDIRECT');
      url = validatePublicUrl(new URL(location, url).toString());
      continue;
    }
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.body) return { url: url.toString(), status: res.status, contentType, buffer: Buffer.alloc(0), truncated: false };
    const { buffer, truncated } = await readCapped(res.body, maxBytes);
    return { url: url.toString(), status: res.status, contentType, buffer, truncated };
  }
  throw new FetchError('The website redirected too many times.', 'FETCH_REDIRECT');
}

/** Minimal robots.txt evaluation (longest-match Allow/Disallow for our agent or *). */
export function robotsAllows(robotsTxt, path) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (current && (key === 'allow' || key === 'disallow')) current.rules.push({ allow: key === 'allow', path: value });
    }
  }
  const group = groups.find((g) => g.agents.some((a) => a && a !== '*' && 'mindmeshbot'.startsWith(a))) || groups.find((g) => g.agents.includes('*'));
  if (!group) return true;
  let best = null;
  for (const rule of group.rules) {
    if (!rule.path) continue;
    const pattern = new RegExp(`^${rule.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`);
    if (pattern.test(path) && (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow))) best = rule;
  }
  return best ? best.allow : true;
}

async function isAllowedByRobots(url) {
  try {
    const res = await safeGet(new URL('/robots.txt', url).toString(), { maxBytes: 256 * 1024, accept: 'text/plain' });
    if (res.status >= 400) return true;
    return robotsAllows(res.buffer.toString('utf8'), url.pathname + url.search);
  } catch {
    return true; // robots.txt unavailable: treat as allowed, per the robots convention
  }
}

function decode(buffer, contentType) {
  const charset = contentType.match(/charset=["']?([\w-]+)/i)?.[1] || 'utf-8';
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

function absolute(href, base) {
  if (!href) return '';
  try {
    const u = new URL(href, base);
    return ['http:', 'https:'].includes(u.protocol) ? u.toString().slice(0, 2048) : '';
  } catch {
    return '';
  }
}

export function parseHtmlMetadata(html, baseUrl) {
  const $ = cheerio.load(html);
  const meta = (sel) => $(sel).attr('content')?.trim() || '';
  const title = meta('meta[property="og:title"]') || $('title').first().text().trim() || $('h1').first().text().trim();
  const description = meta('meta[name="description"]') || meta('meta[property="og:description"]') || meta('meta[name="twitter:description"]');
  const siteName = meta('meta[property="og:site_name"]');
  const imageUrl = absolute(meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]'), baseUrl);
  const iconHref = $('link[rel~="icon"]').first().attr('href') || $('link[rel="apple-touch-icon"]').first().attr('href');
  const faviconUrl = absolute(iconHref || '/favicon.ico', baseUrl);
  return {
    title: title.replace(/\s+/g, ' ').slice(0, 300),
    description: description.replace(/\s+/g, ' ').slice(0, 1000),
    siteName: siteName.slice(0, 200),
    imageUrl,
    faviconUrl,
  };
}

/**
 * Fetches a saved link. Returns { metadata, segments, finalUrl } or throws FetchError/ExtractionError.
 * `metadata` is still returned (via err.metadata) when the page loaded but had no usable text.
 */
export async function fetchLink(rawUrl) {
  const url = validatePublicUrl(rawUrl);
  if (!(await isAllowedByRobots(url))) {
    throw new FetchError("This website's robots.txt does not allow automated access, so only the link was saved.", 'ROBOTS_DISALLOWED');
  }

  const res = await safeGet(url.toString());
  if (res.status === 401 || res.status === 403) throw new FetchError(`The website refused access (HTTP ${res.status}). It may require signing in.`, 'FETCH_FORBIDDEN');
  if (res.status === 404 || res.status === 410) throw new FetchError(`The page was not found (HTTP ${res.status}).`, 'FETCH_NOT_FOUND');
  if (res.status === 429) throw new FetchError('The website is rate-limiting requests. Try again later.', 'FETCH_RATE_LIMITED');
  if (res.status >= 400) throw new FetchError(`The website returned an error (HTTP ${res.status}).`, 'FETCH_HTTP_ERROR');

  const finalUrl = res.url;
  const ct = res.contentType;

  if (ct.includes('application/pdf') || res.buffer.subarray(0, 5).toString() === '%PDF-') {
    if (res.truncated) throw new FetchError('This PDF is larger than the link size limit. Download it and upload it as a document instead.', 'FETCH_TOO_LARGE');
    const { segments, pageCount } = await extractPdf(res.buffer);
    return { finalUrl, metadata: { title: '', description: '', siteName: '', imageUrl: '', faviconUrl: absolute('/favicon.ico', finalUrl) }, segments, pageCount };
  }

  if (ct.includes('text/html') || ct.includes('application/xhtml') || (!ct && res.buffer.subarray(0, 512).toString().toLowerCase().includes('<html'))) {
    const html = decode(res.buffer, ct);
    const metadata = parseHtmlMetadata(html, finalUrl);
    const text = htmlToText(html);
    return { finalUrl, metadata, segments: [{ text }], truncated: res.truncated };
  }

  if (ct.startsWith('text/')) {
    return { finalUrl, metadata: { title: '', description: '', siteName: '', imageUrl: '', faviconUrl: '' }, segments: [{ text: decode(res.buffer, ct) }] };
  }

  throw new ExtractionError(`This link points to a file type that can't be read (${ct.split(';')[0] || 'unknown'}).`, 'FETCH_UNSUPPORTED_TYPE');
}

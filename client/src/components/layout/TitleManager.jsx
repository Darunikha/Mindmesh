import { useLocation } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';

const STATIC_TITLES = {
  '/': 'Home',
  '/login': 'Sign in',
  '/register': 'Create account',
  '/onboarding': 'Welcome',
  '/vault': 'Knowledge Vault',
  '/collections': 'Collections & tags',
  '/assistant': 'Assistant',
  '/search': 'Smart Search',
  '/graph': 'Knowledge Graph',
  '/timeline': 'Timeline',
  '/flashcards': 'Review',
  '/quiz': 'Quiz me',
};

const SETTINGS_TITLES = {
  profile: 'Profile',
  account: 'Account',
  appearance: 'Appearance',
  ai: 'AI assistant',
  library: 'Knowledge library',
  security: 'Security',
};

/**
 * Returns the title for a URL, or `undefined` when the page sets its own (a note or chat
 * uses its own name). Unknown paths get the "not found" title.
 */
export function titleFor(pathname, search = '') {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (/^\/vault\/[^/]+$/.test(path) || /^\/assistant\/[^/]+$/.test(path)) return undefined;
  if (path === '/search') {
    const q = new URLSearchParams(search).get('q');
    return q ? `“${q}” · Smart Search` : 'Smart Search';
  }
  const settings = path.match(/^\/settings(?:\/([^/]+))?$/);
  if (settings) return `Settings${SETTINGS_TITLES[settings[1] || 'profile'] ? ` · ${SETTINGS_TITLES[settings[1] || 'profile']}` : ''}`;
  return STATIC_TITLES[path] ?? 'Page not found';
}

/** Keeps the browser tab title in step with the current page. Renders nothing. */
export default function TitleManager() {
  const { pathname, search } = useLocation();
  useDocumentTitle(titleFor(pathname, search));
  return null;
}

import { FolderTree, History, House, LibraryBig, Search, Sparkles, Waypoints } from 'lucide-react';

/**
 * Single source of truth for app navigation.
 * `phase` marks modules that are not built yet. They render as disabled, labelled
 * items rather than links to empty pages.
 */
export const NAV_SECTIONS = [
  {
    id: 'workspace',
    titles: { library: 'The Reading Room', studio: 'Workspace', lab: '01 / Core' },
    items: [
      { to: '/', label: 'Home', icon: House, end: true, tint: 'accent' },
      { to: '/assistant', label: 'Assistant', icon: Sparkles, phase: 3, tint: 'accent-2' },
    ],
  },
  {
    id: 'knowledge',
    titles: { library: 'The Stacks', studio: 'Knowledge', lab: '02 / Data' },
    items: [
      { to: '/vault', label: 'Knowledge Vault', icon: LibraryBig, tint: 'accent-3' },
      { to: '/collections', label: 'Collections', icon: FolderTree, tint: 'accent' },
      { to: '/search', label: 'Smart Search', icon: Search, phase: 4, tint: 'accent-2' },
    ],
  },
  {
    id: 'discover',
    titles: { library: 'The Archive', studio: 'Discover', lab: '03 / Analysis' },
    items: [
      { to: '/graph', label: 'Knowledge Graph', icon: Waypoints, phase: 4, tint: 'accent-3' },
      { to: '/timeline', label: 'Timeline', icon: History, phase: 4, tint: 'accent' },
    ],
  },
];

export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

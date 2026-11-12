/**
 * Theme metadata used by pickers and theme-aware copy.
 * Visual values live in themes.css; this file only describes each identity.
 */
export const THEMES = {
  library: {
    id: 'library',
    name: 'The Library',
    tagline: 'A warm reading room for slow, deep thinking.',
    description: 'Cream paper, cocoa ink and serif type. Built for long reading sessions.',
    swatches: ['#f3ebdd', '#8b3f24', '#5d6b48', '#a97b2f', '#2a1f17'],
    greeting: { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' },
    assistantName: 'the Librarian',
  },
  studio: {
    id: 'studio',
    name: 'The Studio',
    tagline: 'A bright, modular space for making things.',
    description: 'Gallery white, chalky pastels and rounded modules. Light and expressive.',
    swatches: ['#f6f4f0', '#5b4bdb', '#e8775a', '#2f9d78', '#f4c95d'],
    greeting: { morning: 'Morning', afternoon: 'Hey there', evening: 'Evening' },
    assistantName: 'your studio assistant',
  },
  lab: {
    id: 'lab',
    name: 'The Lab',
    tagline: 'A quiet instrument panel for research.',
    description: 'Deep navy, luminous signal colours and data-forward detail.',
    swatches: ['#090e1b', '#4fe0c8', '#a08cff', '#f6b950', '#e4e9f4'],
    greeting: { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' },
    assistantName: 'the research console',
  },
};

export const THEME_IDS = Object.keys(THEMES);
export const DEFAULT_THEME = 'library';

export const isThemeId = (v) => THEME_IDS.includes(v);

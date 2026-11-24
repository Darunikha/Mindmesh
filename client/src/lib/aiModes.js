import { Blend, Brain, LibraryBig } from 'lucide-react';

export const ANSWER_MODE_OPTIONS = [
  {
    value: 'general',
    label: 'General AI',
    description: "Answers from the model's general knowledge. Works with an empty library.",
    icon: Brain,
  },
  {
    value: 'knowledge',
    label: 'My Knowledge',
    description: 'Searches your saved notes, documents and links, cites them, and labels any general knowledge it adds.',
    icon: LibraryBig,
  },
  {
    value: 'hybrid',
    label: 'Both',
    description: 'Uses your saved notes, documents and links when they are relevant, and general knowledge when they are not.',
    icon: Blend,
  },
];

export const ANSWER_MODES = ANSWER_MODE_OPTIONS.map((o) => o.value);

/** Anything unrecognised (an old or missing preference) falls back to My Knowledge. */
export const normalizeMode = (m) => (ANSWER_MODES.includes(m) ? m : 'knowledge');

import { Brain, LibraryBig } from 'lucide-react';

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
];

/** Older accounts may have the retired "hybrid" default; My Knowledge already blends sources with labelled general knowledge. */
export const normalizeMode = (m) => (m === "general" ? "general" : "knowledge");

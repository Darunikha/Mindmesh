import { Brain, Layers, LibraryBig } from 'lucide-react';

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
    description: 'Answers grounded only in your saved notes and documents, with sources.',
    icon: LibraryBig,
  },
  {
    value: 'hybrid',
    label: 'Blended',
    description: 'Uses your sources when relevant and labels where each part came from.',
    icon: Layers,
  },
];

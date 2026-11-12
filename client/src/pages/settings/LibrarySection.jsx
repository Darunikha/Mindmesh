import { LayoutGrid, List } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import ChoiceCards from '../../components/ui/ChoiceCards.jsx';
import Toggle from '../../components/ui/Toggle.jsx';
import { SelectField } from '../../components/ui/Field.jsx';
import { usePreferences } from '../../hooks/usePreferences.js';

const SORTS = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'created', label: 'Recently created' },
  { value: 'title', label: 'Title (A–Z)' },
];

const VIEWS = [
  { value: 'grid', label: 'Grid', description: 'Cards with previews', icon: LayoutGrid },
  { value: 'list', label: 'List', description: 'Compact rows', icon: List },
];

export default function LibrarySection() {
  const { preferences, save } = usePreferences();
  const lib = preferences.library;

  return (
    <>
      <Card className="p-5 sm:p-6">
        <CardHeader eyebrow="Browsing" title="How your library is shown" />
        <div className="mt-5 space-y-5">
          <SelectField
            label="Default sort"
            value={lib.defaultSort}
            onChange={(e) => save({ library: { defaultSort: e.target.value } })}
            options={SORTS}
            className="max-w-md"
          />
          <div>
            <p className="mm-label">Default view</p>
            <ChoiceCards label="Default view" columns={2} value={lib.defaultView} onChange={(v) => save({ library: { defaultView: v } })} options={VIEWS} />
          </div>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <CardHeader eyebrow="Knowledge graph" title="Connections" />
        <div className="mt-4 space-y-4">
          <Toggle
            label="Suggest connections"
            description="Show AI-suggested relationships in the Knowledge Graph and “related” hints on items. Nothing is linked without your approval."
            checked={lib.suggestConnections}
            onChange={(v) => save({ library: { suggestConnections: v } })}
          />
        </div>
        <p className="mt-4 font-ui text-xs text-ink-faint">
          Uploaded documents and saved links are always processed in the background, because search and the assistant rely on their extracted text.
        </p>
      </Card>
    </>
  );
}

import { LayoutGrid, List } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import ChoiceCards from '../../components/ui/ChoiceCards.jsx';
import Toggle from '../../components/ui/Toggle.jsx';
import Alert from '../../components/ui/Alert.jsx';
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
      <Alert tone="info">The Knowledge Vault ships in Phase 2. These defaults are saved now and used when it opens.</Alert>

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
        <CardHeader eyebrow="Processing" title="Documents and connections" />
        <div className="mt-4 space-y-4">
          <Toggle
            label="Process uploads automatically"
            description="Extract text, chunk and index new documents for search as soon as they're uploaded."
            checked={lib.autoProcessUploads}
            onChange={(v) => save({ library: { autoProcessUploads: v } })}
          />
          <hr className="mm-rule" />
          <Toggle
            label="Suggest connections"
            description="Let Mindmesh propose related notes for your review. Nothing is linked without your approval."
            checked={lib.suggestConnections}
            onChange={(v) => save({ library: { suggestConnections: v } })}
          />
        </div>
      </Card>
    </>
  );
}

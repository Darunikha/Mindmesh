import { useId } from 'react';
import { useLibrary } from '../../context/LibraryContext.jsx';

/** Native select showing the nested collection tree with indentation. */
export default function CollectionSelect({ value, onChange, label = 'Collection', allowNone = true, noneLabel = 'No collection', exclude = [], className, disabled }) {
  const { flatCollections } = useLibrary();
  const id = useId();
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mm-label">
          {label}
        </label>
      )}
      <select id={id} className="mm-input" value={value || ''} onChange={(e) => onChange(e.target.value || null)} disabled={disabled}>
        {allowNone && <option value="">{noneLabel}</option>}
        {flatCollections
          .filter((c) => !exclude.includes(c.id))
          .map((c) => (
            <option key={c.id} value={c.id}>
              {`${'   '.repeat(c.depth)}${c.depth ? '↳ ' : ''}${c.name}`}
            </option>
          ))}
      </select>
    </div>
  );
}

import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, House, Search } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

const COPY = {
  library: { eyebrow: 'Error 404 · Catalogue', title: ['This page is ', 'not on the shelf', '.'], body: 'The link may be broken, or the page may have been moved to another shelf.' },
  studio: { eyebrow: 'Error 404', title: ['We couldn’t find ', 'that page', '.'], body: 'The link might be broken or out of date. Here are some ways back.' },
  lab: { eyebrow: 'ERR_404 · ROUTE_NOT_FOUND', title: ['No such ', 'route', '.'], body: 'The address does not match any page. Check it, or use one of the options below.' },
};

const QUICK_LINKS = [
  { to: '/vault', label: 'Knowledge Vault' },
  { to: '/assistant', label: 'Assistant' },
  { to: '/flashcards', label: 'Review' },
  { to: '/graph', label: 'Knowledge Graph' },
];

/** Words in the mistyped address ("/vaults/my-notes" → "my notes"), offered as a search. */
export function guessSearch(pathname) {
  const last = pathname.split('/').filter(Boolean).pop() || '';
  let decoded = last;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    /* keep the raw segment */
  }
  return decoded.replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}

/** Shown inside the app shell, so navigation stays available. */
export default function NotFoundPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const copy = COPY[theme] || COPY.studio;
  const [q, setQ] = useState(() => guessSearch(pathname));

  const search = (e) => {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className="mx-auto max-w-xl py-8 text-center sm:py-14">
      <p className="mm-eyebrow">{copy.eyebrow}</p>
      <h1 className="mm-display mt-3 text-4xl text-ink sm:text-5xl library:sm:text-6xl">
        {copy.title[0]}
        <em>{copy.title[1]}</em>
        {copy.title[2]}
      </h1>
      <p className="mx-auto mt-4 max-w-md font-ui text-ink-muted">{copy.body}</p>

      <p className="mx-auto mt-5 max-w-full overflow-hidden rounded-control border border-line bg-sunken px-3 py-1.5 font-mono text-xs break-all text-ink-muted" aria-label="Address that was not found">
        {pathname}
      </p>

      <div className="mt-7 flex flex-wrap justify-center gap-2">
        {window.history.length > 1 && (
          <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(-1)}>
            Go back
          </Button>
        )}
        <Button to="/" icon={House}>
          Home
        </Button>
      </div>

      <form onSubmit={search} className="mx-auto mt-8 max-w-md text-left" role="search">
        <label htmlFor="nf-search" className="mm-label">
          Looking for something in your library?
        </label>
        <div className="flex gap-2">
          <input id="nf-search" className="mm-input" value={q} maxLength={200} onChange={(e) => setQ(e.target.value)} placeholder="Search your notes and documents" />
          <Button type="submit" variant="secondary" icon={Search} disabled={!q.trim()}>
            Search
          </Button>
        </div>
      </form>

      <nav aria-label="Popular pages" className="mt-8 flex flex-wrap justify-center gap-2">
        {QUICK_LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="mm-chip">
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

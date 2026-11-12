import { ArrowLeft } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import Logo from '../components/theme/Logo.jsx';

export default function NotFoundPage() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <div className="mm-backdrop" aria-hidden />
      <div className="relative">
        <Logo size={36} showWordmark={false} />
        <p className="mm-eyebrow mt-6">Error 404</p>
        <h1 className="mm-display mt-2 text-5xl text-ink">
          This page is <em>not on the shelf</em>.
        </h1>
        <p className="mx-auto mt-3 max-w-md font-ui text-ink-muted">The link may be broken, or the page may have moved.</p>
        <Button to="/" icon={ArrowLeft} className="mt-8">
          Back to home
        </Button>
      </div>
    </div>
  );
}

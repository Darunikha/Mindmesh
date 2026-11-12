import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import Logo from '../components/theme/Logo.jsx';
import Button from '../components/ui/Button.jsx';
import Alert from '../components/ui/Alert.jsx';
import ChoiceCards from '../components/ui/ChoiceCards.jsx';
import { TextField } from '../components/ui/Field.jsx';
import ThemePicker from '../components/theme/ThemePicker.jsx';
import InterestPicker from '../components/theme/InterestPicker.jsx';
import InterestConstellation from '../components/theme/InterestConstellation.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { usersApi } from '../api/endpoints.js';
import { ANSWER_MODE_OPTIONS } from '../lib/aiModes.js';
import { THEMES } from '../themes/registry.js';
import { cn } from '../lib/cn.js';

const STEPS = [
  { id: 'name', label: 'You' },
  { id: 'theme', label: 'Your room' },
  { id: 'interests', label: 'Interests' },
  { id: 'assistant', label: 'Assistant' },
];

export default function OnboardingPage() {
  const { user, setUser, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [name, setName] = useState(user?.name || '');
  const [interests, setInterests] = useState(user?.interests || []);
  const [defaultMode, setDefaultMode] = useState(user?.preferences?.ai?.defaultMode === 'knowledge' ? 'knowledge' : 'general');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [nameError, setNameError] = useState(null);

  const isLast = step === STEPS.length - 1;

  const next = async () => {
    setError(null);
    if (step === 0 && !name.trim()) {
      setNameError('Tell us what to call you');
      return;
    }
    if (!isLast) {
      setStep((s) => s + 1);
      return;
    }
    setSaving(true);
    try {
      const { user: updated } = await usersApi.completeOnboarding({ name: name.trim(), theme, interests, defaultMode });
      setUser(updated);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative min-h-dvh">
      <div className="mm-backdrop" aria-hidden />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 py-6 sm:px-8 sm:py-8">
        <header className="flex items-center justify-between">
          <Logo size={30} />
          <button type="button" onClick={logout} className="font-ui text-sm text-ink-faint hover:text-ink">
            Sign out
          </button>
        </header>

        <ol className="mt-10 flex items-center gap-2 sm:gap-3" aria-label="Onboarding progress">
          {STEPS.map((s, i) => (
            <li key={s.id} className="flex flex-1 items-center gap-2 sm:gap-3">
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-ui text-xs font-semibold transition-colors lab:rounded-[6px] lab:font-mono',
                  i < step && 'border-accent bg-accent text-accent-ink',
                  i === step && 'border-accent text-accent',
                  i > step && 'border-line-strong text-ink-faint'
                )}
                aria-current={i === step ? 'step' : undefined}
              >
                {i < step ? <Check size={13} strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn('hidden font-ui text-sm sm:block', i === step ? 'text-ink' : 'text-ink-faint')}>{s.label}</span>
              {i < STEPS.length - 1 && <span className={cn('h-px flex-1', i < step ? 'bg-accent' : 'bg-line-strong')} />}
            </li>
          ))}
        </ol>

        <div className="flex-1 py-10">
          <AnimatePresence mode="wait">
            <motion.section
              key={STEPS[step].id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
              aria-labelledby="step-title"
            >
              {step === 0 && (
                <div className="max-w-lg">
                  <p className="mm-eyebrow mb-2">Step one</p>
                  <h1 id="step-title" className="mm-display text-4xl text-ink sm:text-5xl">
                    Welcome to <em>Mindmesh</em>.
                  </h1>
                  <p className="mt-3 font-ui text-ink-muted">
                    Mindmesh is your personal knowledge workspace: notes, documents, search, a knowledge graph and an AI assistant that can draw on
                    all of it. First, what should we call you?
                  </p>
                  <TextField
                    className="mt-8"
                    label="Name"
                    value={name}
                    autoFocus
                    maxLength={80}
                    error={nameError}
                    onChange={(e) => {
                      setName(e.target.value);
                      setNameError(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && next()}
                  />
                </div>
              )}

              {step === 1 && (
                <div>
                  <p className="mm-eyebrow mb-2">Step two</p>
                  <h1 id="step-title" className="mm-display text-4xl text-ink sm:text-5xl">
                    Choose your <em>room</em>.
                  </h1>
                  <p className="mt-3 max-w-xl font-ui text-ink-muted">
                    Each theme is a complete environment with its own type, surfaces and character. Everything works the same in every room, and you
                    can move any time from Settings.
                  </p>
                  <div className="mt-8">
                    <ThemePicker value={theme} onChange={(id) => setTheme(id, { persist: false })} />
                  </div>
                  <p className="mt-4 font-ui text-sm text-ink-faint" aria-live="polite">
                    Now previewing <span className="text-ink">{THEMES[theme].name}</span>: {THEMES[theme].tagline}
                  </p>
                </div>
              )}

              {step === 2 && (
                <div className="grid gap-10 md:grid-cols-[1.2fr_1fr]">
                  <div>
                    <p className="mm-eyebrow mb-2">Step three</p>
                    <h1 id="step-title" className="mm-display text-4xl text-ink sm:text-5xl">
                      What are you <em>curious</em> about?
                    </h1>
                    <p className="mt-3 font-ui text-ink-muted">
                      Pick a few topics to seed your workspace. They shape suggestions on your home page and become the first nodes in your knowledge
                      graph.
                    </p>
                    <div className="mt-8">
                      <InterestPicker value={interests} onChange={setInterests} />
                    </div>
                  </div>
                  <div className="mm-card hidden h-72 self-center p-4 md:block" aria-hidden={!interests.length}>
                    {interests.length ? (
                      <InterestConstellation name={name || 'You'} interests={interests} width={360} height={250} />
                    ) : (
                      <div className="flex h-full items-center justify-center text-center font-ui text-sm text-ink-faint">
                        Your map appears here as you choose topics.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <p className="mm-eyebrow mb-2">Final step</p>
                  <h1 id="step-title" className="mm-display text-4xl text-ink sm:text-5xl">
                    How should the assistant <em>answer</em>?
                  </h1>
                  <p className="mt-3 max-w-xl font-ui text-ink-muted">
                    This is the default for new conversations. You can switch modes per chat, and change this default in Settings.
                  </p>
                  <div className="mt-8">
                    <ChoiceCards columns={2} label="Default answer mode" value={defaultMode} onChange={setDefaultMode} options={ANSWER_MODE_OPTIONS} />
                  </div>
                </div>
              )}
            </motion.section>
          </AnimatePresence>
        </div>

        {error && <Alert tone="error" className="mb-4">{error}</Alert>}

        <footer className="flex items-center justify-between border-t border-line pt-5">
          <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep((s) => s - 1)} disabled={step === 0 || saving}>
            Back
          </Button>
          <Button size="lg" onClick={next} loading={saving} iconRight={isLast ? Check : ArrowRight}>
            {isLast ? 'Enter my workspace' : 'Continue'}
          </Button>
        </footer>
      </div>
    </div>
  );
}

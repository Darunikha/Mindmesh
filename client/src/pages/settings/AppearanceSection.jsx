import Card, { CardHeader } from '../../components/ui/Card.jsx';
import Toggle from '../../components/ui/Toggle.jsx';
import ThemePicker from '../../components/theme/ThemePicker.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { usePreferences } from '../../hooks/usePreferences.js';
import { THEMES } from '../../themes/registry.js';

export default function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const { preferences, save } = usePreferences();

  return (
    <>
      <Card className="p-5 sm:p-6">
        <CardHeader eyebrow="Theme" title="Choose your room" />
        <p className="mt-1 mb-5 font-ui text-sm text-ink-muted">
          Changes apply instantly and are saved to your account, so they follow you to every device. Nothing you're working on is lost.
        </p>
        <ThemePicker value={theme} onChange={(id) => setTheme(id)} />
        <p className="mt-4 font-ui text-sm text-ink-faint" aria-live="polite">
          Current: <span className="text-ink">{THEMES[theme].name}</span>
        </p>
      </Card>

      <Card className="p-5 sm:p-6">
        <CardHeader eyebrow="Motion" title="Accessibility" />
        <div className="mt-4">
          <Toggle
            label="Reduce motion"
            description="Minimise animations and transitions. Your system's reduced-motion setting is always respected too."
            checked={Boolean(preferences.reduceMotion)}
            onChange={(v) => save({ reduceMotion: v }, { successMessage: v ? 'Motion reduced' : 'Motion restored' })}
          />
        </div>
      </Card>
    </>
  );
}

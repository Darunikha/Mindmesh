import Card, { CardHeader } from '../../components/ui/Card.jsx';
import ChoiceCards from '../../components/ui/ChoiceCards.jsx';
import Toggle from '../../components/ui/Toggle.jsx';
import Alert from '../../components/ui/Alert.jsx';
import { SelectField } from '../../components/ui/Field.jsx';
import { usePreferences } from '../../hooks/usePreferences.js';
import { ANSWER_MODE_OPTIONS } from '../../lib/aiModes.js';

const STYLES = [
  { value: 'concise', label: 'Concise: short, direct answers' },
  { value: 'balanced', label: 'Balanced: explanation where it helps' },
  { value: 'detailed', label: 'Detailed: thorough, step-by-step' },
];

export default function AiSection() {
  const { preferences, save } = usePreferences();
  const ai = preferences.ai;

  return (
    <>
      <Alert tone="info">
        The assistant ships in Phase 3. These preferences are saved now and will be applied to every conversation when it does.
      </Alert>

      <Card className="p-5 sm:p-6">
        <CardHeader eyebrow="Answer mode" title="Default for new conversations" />
        <p className="mt-1 mb-5 font-ui text-sm text-ink-muted">
          You'll be able to switch per chat. Answers in My Knowledge mode always show the sources they used.
        </p>
        <ChoiceCards label="Default answer mode" value={ai.defaultMode} onChange={(v) => save({ ai: { defaultMode: v } })} options={ANSWER_MODE_OPTIONS} />
      </Card>

      <Card className="p-5 sm:p-6">
        <CardHeader eyebrow="Responses" title="How the assistant writes" />
        <div className="mt-5 space-y-5">
          <SelectField
            label="Response style"
            value={ai.responseStyle}
            onChange={(e) => save({ ai: { responseStyle: e.target.value } })}
            options={STYLES}
            className="max-w-md"
          />
          <hr className="mm-rule" />
          <Toggle
            label="Suggest follow-up questions"
            description="Offer two or three next questions after each answer."
            checked={ai.showFollowUps}
            onChange={(v) => save({ ai: { showFollowUps: v } })}
          />
        </div>
      </Card>
    </>
  );
}

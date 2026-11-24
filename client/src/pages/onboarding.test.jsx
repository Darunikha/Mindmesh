import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import OnboardingPage from './OnboardingPage.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { ThemeContext } from '../context/ThemeContext.jsx';

const api = vi.hoisted(() => ({ completeOnboarding: vi.fn() }));
vi.mock('../api/endpoints.js', () => ({ usersApi: { completeOnboarding: api.completeOnboarding } }));

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

function setup({ user = { name: '', interests: [], preferences: { ai: {} } }, theme = 'studio' } = {}) {
  const auth = { user, setUser: vi.fn(), logout: vi.fn() };
  const themeCtx = { theme, setTheme: vi.fn() };
  render(
    <ThemeContext.Provider value={themeCtx}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/onboarding']}>
          <Routes>
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/" element={<p>The home page</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </ThemeContext.Provider>
  );
  return { auth, themeCtx, user: userEvent.setup() };
}

const heading = () => screen.getByRole('heading', { level: 1 }).textContent;
const cont = (user) => user.click(screen.getByRole('button', { name: /continue/i }));

// Steps animate: the old heading is still on screen for a moment, so wait for the NEW one by name.
const TITLES = [/Welcome to Mindmesh/, /Choose your room/, /curious about/, /How should the assistant answer/];
const advance = async (user, title) => {
  await cont(user);
  await screen.findByRole('heading', { level: 1, name: title });
};
/** Moves forward from step one to the given step (0-based). */
const toStep = async (user, step) => {
  for (let i = 1; i <= step; i++) await advance(user, TITLES[i]);
};

describe('Onboarding: step one (your name)', () => {
  it('starts by asking what to call you, with a four-step progress list', () => {
    setup();
    expect(heading()).toMatch(/Welcome to Mindmesh/);
    const steps = within(screen.getByRole('list', { name: 'Onboarding progress' })).getAllByRole('listitem');
    expect(steps).toHaveLength(4);
    expect(within(steps[0]).getByText('1')).toHaveAttribute('aria-current', 'step');
  });

  it('fills in the name you already gave when signing up', () => {
    setup({ user: { name: 'Ada Lovelace', interests: [], preferences: { ai: {} } } });
    expect(screen.getByLabelText('Name')).toHaveValue('Ada Lovelace');
  });

  it('will not move on without a name, and the message goes away once you type', async () => {
    const { user } = setup();
    await cont(user);
    expect(await screen.findByText('Tell us what to call you')).toBeInTheDocument();
    expect(heading()).toMatch(/Welcome/);
    await user.type(screen.getByLabelText('Name'), 'A');
    expect(screen.queryByText('Tell us what to call you')).toBeNull();
  });

  it('treats a name of only spaces as empty', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Name'), '   ');
    await cont(user);
    expect(await screen.findByText('Tell us what to call you')).toBeInTheDocument();
  });

  it('Enter in the name box moves on', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Name'), 'Ada{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: TITLES[1] })).toBeInTheDocument();
  });

  it('has Back disabled on the first step', () => {
    setup();
    expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();
  });

  it('can sign out from here', async () => {
    const { user, auth } = setup();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(auth.logout).toHaveBeenCalled();
  });
});

describe('Onboarding: moving through the steps', () => {
  it('goes name → room → interests → assistant, and Back returns', async () => {
    const { user } = setup({ user: { name: 'Ada', interests: [], preferences: { ai: {} } } });
    await advance(user, TITLES[1]);
    expect(heading()).toMatch(/Choose your room/);
    await advance(user, TITLES[2]);
    expect(heading()).toMatch(/curious about/);
    await advance(user, TITLES[3]);
    expect(heading()).toMatch(/How should the assistant answer/);
    expect(screen.getByRole('button', { name: 'Enter my workspace' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(await screen.findByRole('heading', { level: 1, name: TITLES[2] })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(await screen.findByRole('heading', { level: 1, name: TITLES[1] })).toBeInTheDocument();
  });

  it('marks finished steps with a tick and the current step as current', async () => {
    const { user } = setup({ user: { name: 'Ada', interests: [], preferences: { ai: {} } } });
    await toStep(user, 2);
    const steps = within(screen.getByRole('list', { name: 'Onboarding progress' })).getAllByRole('listitem');
    expect(within(steps[2]).getByText('3')).toHaveAttribute('aria-current', 'step');
    expect(within(steps[0]).queryByText('1')).toBeNull();
    expect(within(steps[3]).getByText('4')).not.toHaveAttribute('aria-current');
  });

  it('previews a theme as you pick it, without saving it yet', async () => {
    const { user, themeCtx } = setup({ user: { name: 'Ada', interests: [], preferences: { ai: {} } }, theme: 'library' });
    await toStep(user, 1);
    await user.click(screen.getByRole('radio', { name: /The Lab/i }));
    expect(themeCtx.setTheme).toHaveBeenCalledWith('lab', { persist: false });
  });

  it('lets you pick topics, and shows how many', async () => {
    const { user } = setup({ user: { name: 'Ada', interests: [], preferences: { ai: {} } } });
    await toStep(user, 2);
    expect(screen.getByText('0/12 selected')).toBeInTheDocument();
    const chips = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'));
    await user.click(chips[0]);
    await user.click(chips[1]);
    expect(screen.getByText('2/12 selected')).toBeInTheDocument();
    await user.click(chips[0]);
    expect(screen.getByText('1/12 selected')).toBeInTheDocument();
  });

  it('keeps topics you chose when you go back and forward', async () => {
    const { user } = setup({ user: { name: 'Ada', interests: [], preferences: { ai: {} } } });
    await toStep(user, 2);
    const chip = screen.getAllByRole('button').find((b) => b.hasAttribute('aria-pressed'));
    await user.click(chip);
    await user.click(screen.getByRole('button', { name: /back/i }));
    await screen.findByRole('heading', { level: 1, name: TITLES[1] });
    await advance(user, TITLES[2]);
    expect(screen.getByText('1/12 selected')).toBeInTheDocument();
  });
});

describe('Onboarding: the answer-mode step', () => {
  const lastStep = async (props) => {
    const ctx = setup({ user: { name: 'Ada', interests: [], ...props }, ...(props?.theme ? { theme: props.theme } : {}) });
    await toStep(ctx.user, 3);
    return ctx;
  };
  const checked = () => screen.getAllByRole('radio').find((r) => r.getAttribute('aria-checked') === 'true')?.textContent;

  it('offers all three modes, General AI selected by default', async () => {
    await lastStep({ preferences: { ai: {} } });
    expect(screen.getAllByRole('radio').map((r) => r.textContent.match(/General AI|My Knowledge|Both/)?.[0])).toEqual(['General AI', 'My Knowledge', 'Both']);
    expect(checked()).toMatch(/General AI/);
  });

  it.each([
    ['knowledge', /My Knowledge/],
    ['hybrid', /Both/],
    ['general', /General AI/],
  ])('starts on your saved choice (%s)', async (mode, pattern) => {
    await lastStep({ preferences: { ai: { defaultMode: mode } } });
    expect(checked()).toMatch(pattern);
  });

  it('falls back to General AI for a value it doesn’t know', async () => {
    await lastStep({ preferences: { ai: { defaultMode: 'something-old' } } });
    expect(checked()).toMatch(/General AI/);
  });
});

describe('Onboarding: finishing', () => {
  it('saves everything you chose, updates your account, and goes home', async () => {
    const updated = { name: 'Ada Lovelace', onboardingCompleted: true };
    api.completeOnboarding.mockResolvedValue({ user: updated });
    const { user, auth } = setup({ user: { name: '', interests: [], preferences: { ai: {} } }, theme: 'lab' });
    await user.type(screen.getByLabelText('Name'), '  Ada Lovelace  ');
    await toStep(user, 2);
    await user.click(screen.getAllByRole('button').find((b) => b.hasAttribute('aria-pressed')));
    const topic = screen.getAllByRole('button').find((b) => b.getAttribute('aria-pressed') === 'true').textContent.trim();
    await advance(user, TITLES[3]);
    await user.click(screen.getByRole('radio', { name: /Both/ }));
    await user.click(screen.getByRole('button', { name: 'Enter my workspace' }));

    expect(await screen.findByText('The home page')).toBeInTheDocument();
    expect(api.completeOnboarding).toHaveBeenCalledWith({ name: 'Ada Lovelace', theme: 'lab', interests: [topic], defaultMode: 'hybrid' });
    expect(auth.setUser).toHaveBeenCalledWith(updated);
  });

  it('shows the error and stays put if saving fails, so you can try again', async () => {
    api.completeOnboarding.mockRejectedValueOnce(new Error('Could not reach the Mindmesh server.')).mockResolvedValueOnce({ user: { onboardingCompleted: true } });
    const { user } = setup({ user: { name: 'Ada', interests: [], preferences: { ai: {} } } });
    await toStep(user, 3);
    await user.click(screen.getByRole('button', { name: 'Enter my workspace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the Mindmesh server.');
    expect(heading()).toMatch(/How should the assistant answer/);
    await user.click(screen.getByRole('button', { name: 'Enter my workspace' }));
    expect(await screen.findByText('The home page')).toBeInTheDocument();
    expect(api.completeOnboarding).toHaveBeenCalledTimes(2);
  });

  it('disables Back while saving', async () => {
    let finish;
    api.completeOnboarding.mockImplementation(() => new Promise((r) => (finish = r)));
    const { user } = setup({ user: { name: 'Ada', interests: [], preferences: { ai: {} } } });
    await toStep(user, 3);
    await user.click(screen.getByRole('button', { name: 'Enter my workspace' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /back/i })).toBeDisabled());
    finish({ user: { onboardingCompleted: true } });
    expect(await screen.findByText('The home page')).toBeInTheDocument();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import TagPicker from './TagPicker.jsx';
import { LibraryProvider } from '../../context/LibraryContext.jsx';

const tagsList = vi.hoisted(() => ({ tags: [] }));
vi.mock('../../api/library.js', () => ({
  collectionsApi: { list: () => Promise.resolve({ collections: [], unfiledCount: 0 }) },
  tagsApi: { list: () => Promise.resolve({ tags: tagsList.tags }) },
}));

afterEach(cleanup);

const TAGS = ['physics', 'Quantum', 'history', 'Photosynthesis', 'biology'].map((name, i) => ({ id: `t${i}`, name }));

function Harness({ initial = [], onChange = () => {}, max, label }) {
  const [value, setValue] = useState(initial);
  return (
    <LibraryProvider>
      <TagPicker
        value={value}
        label={label}
        max={max}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </LibraryProvider>
  );
}

const setup = async (props = {}, tags = TAGS) => {
  tagsList.tags = tags;
  const user = userEvent.setup();
  render(<Harness {...props} />);
  const input = await screen.findByRole('combobox');
  await waitFor(() => expect(input).toBeEnabled());
  return { user, input, value: () => JSON.parse(screen.getByTestId('value').textContent) };
};
const options = () => screen.queryAllByRole('option').map((o) => o.textContent);

describe('TagPicker: suggestions', () => {
  it('suggests your existing tags when you focus the box', async () => {
    const { user, input } = await setup();
    await user.click(input);
    await waitFor(() => expect(options()).toEqual(['physics', 'Quantum', 'history', 'Photosynthesis', 'biology']));
  });

  it('narrows the list as you type, ignoring case, matching anywhere in the name', async () => {
    const { user, input } = await setup();
    await user.type(input, 'PHO');
    expect(options()).toEqual(['Photosynthesis', 'Create "PHO"']);
    await user.clear(input);
    await user.type(input, 'ysi');
    expect(options()).toContain('physics');
  });

  it('does not suggest tags that are already chosen', async () => {
    const { user, input } = await setup({ initial: ['physics'] });
    await user.click(input);
    expect(options()).not.toContain('physics');
    expect(options()).toContain('Quantum');
  });

  it('offers to create a new tag only when no tag matches exactly', async () => {
    const { user, input } = await setup();
    await user.type(input, 'chemistry');
    expect(options()).toEqual(['Create "chemistry"']);
    await user.clear(input);
    await user.type(input, 'history');
    expect(options()).toEqual(['history']);
    await user.clear(input);
    await user.type(input, 'HISTORY');
    expect(options()).toEqual(['history']);
  });

  it('shows at most eight suggestions', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, name: `topic-${i}` }));
    const { user, input } = await setup({}, many);
    await user.click(input);
    expect(options()).toHaveLength(8);
  });

  it('shows nothing when you have no tags yet and have typed nothing', async () => {
    const { user, input } = await setup({}, []);
    await user.click(input);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('TagPicker: adding', () => {
  it('Enter adds the highlighted suggestion', async () => {
    const { user, input, value } = await setup();
    await user.type(input, 'phys{Enter}');
    expect(value()).toEqual(['physics']);
    expect(input).toHaveValue('');
  });

  it('arrow keys move to “Create …” so you can add exactly what you typed', async () => {
    const { user, input, value } = await setup();
    await user.type(input, 'phys');
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: 'Create "phys"' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');
    expect(value()).toEqual(['phys']);
  });

  it('ArrowUp goes back, and neither arrow runs past the ends of the list', async () => {
    const { user, input } = await setup();
    await user.type(input, 'phys');
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('option', { name: 'physics' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('option', { name: 'Create "phys"' })).toHaveAttribute('aria-selected', 'true');
  });

  it('a comma adds the tag too', async () => {
    const { user, input, value } = await setup({}, []);
    await user.type(input, 'ideas,');
    expect(value()).toEqual(['ideas']);
  });

  it('clicking a suggestion adds it', async () => {
    const { user, input, value } = await setup();
    await user.click(input);
    await user.click(await screen.findByRole('option', { name: 'history' }));
    expect(value()).toEqual(['history']);
  });

  it('Enter on an empty box does nothing (so it doesn’t get in the way of a surrounding form)', async () => {
    const { user, input, value } = await setup();
    await user.click(input);
    await user.keyboard('{Enter}');
    expect(value()).toEqual([]);
  });

  it('keeps adding after the first tag', async () => {
    const { user, input, value } = await setup({}, []);
    await user.type(input, 'one{Enter}two{Enter}three,');
    expect(value()).toEqual(['one', 'two', 'three']);
  });

  it('ignores a tag you already have, whatever its capitalisation', async () => {
    const { user, input, value } = await setup({ initial: ['Physics'] });
    await user.type(input, 'physics,');
    expect(value()).toEqual(['Physics']);
  });

  it('trims new tag names to 40 characters', async () => {
    const { user, input, value } = await setup({}, []);
    await user.type(input, 'x'.repeat(40));
    await user.keyboard('{Enter}');
    expect(value()[0]).toHaveLength(40);
    expect(input).toHaveAttribute('maxlength', '40');
  });

  it('stops accepting tags at the limit', async () => {
    const { user, input, value } = await setup({ initial: ['a', 'b'], max: 3 });
    await user.type(input, 'zz{Enter}');
    expect(value()).toEqual(['a', 'b', 'zz']);
    expect(input).toBeDisabled();
  });
});

describe('TagPicker: removing and closing', () => {
  it('shows chosen tags as chips that can each be removed', async () => {
    const { user, value } = await setup({ initial: ['physics', 'history'] });
    await user.click(screen.getByRole('button', { name: 'Remove tag physics' }));
    expect(value()).toEqual(['history']);
    expect(screen.queryByRole('button', { name: 'Remove tag physics' })).toBeNull();
  });

  it('Backspace in an empty box removes the last tag, but not while you are typing', async () => {
    const { user, input, value } = await setup({ initial: ['a', 'b'] });
    await user.type(input, 'x');
    await user.keyboard('{Backspace}');
    expect(value()).toEqual(['a', 'b']);
    await user.keyboard('{Backspace}');
    expect(value()).toEqual(['a']);
  });

  it('Escape closes the suggestions', async () => {
    const { user, input } = await setup();
    await user.click(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the suggestions when you click away', async () => {
    const { user, input } = await setup();
    await user.click(input);
    await user.click(document.body);
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });

  it('has an accessible label, which you can change, and a placeholder only while empty', async () => {
    const { input } = await setup({ label: 'Topics' });
    expect(screen.getByLabelText('Topics')).toBe(input);
    expect(input).toHaveAttribute('placeholder', 'Add tags…');
    cleanup();
    const second = await setup({ initial: ['x'] });
    expect(second.input).toHaveAttribute('placeholder', '');
  });
});

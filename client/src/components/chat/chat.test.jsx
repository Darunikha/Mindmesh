import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { linkCitations } from './Markdown.jsx';
import Composer from './Composer.jsx';
import SourceCards from './SourceCards.jsx';
import { Providers } from '../../test/utils.jsx';

afterEach(cleanup);

describe('linkCitations', () => {
  it('links only citation numbers that belong to retrieved sources', () => {
    const out = linkCitations('Gradients flow backwards [1]. See also [9] and [1, 2].', new Set([1, 2]));
    expect(out).toBe('Gradients flow backwards [1](#cite-1). See also [9] and [1](#cite-1)[2](#cite-2).');
  });

  it('never touches code spans or fenced code', () => {
    const text = 'Use `arr[1]` here:\n```js\nconst x = a[1];\n```\nCited [1].';
    expect(linkCitations(text, new Set([1]))).toBe('Use `arr[1]` here:\n```js\nconst x = a[1];\n```\nCited [1](#cite-1).');
  });

  it('leaves text alone when there are no sources', () => {
    expect(linkCitations('Plain [1] text', new Set())).toBe('Plain [1] text');
  });
});

describe('Composer', () => {
  const setup = (props = {}) => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    render(
      <Providers>
        <Composer onSend={onSend} onStop={onStop} streaming={false} mode="general" onModeChange={() => {}} placeholder="Ask" {...props} />
      </Providers>
    );
    return { onSend, onStop, input: screen.getByLabelText('Message') };
  };

  it('sends trimmed text on Enter and keeps Shift+Enter for new lines', () => {
    const { onSend, input } = setup();
    fireEvent.change(input, { target: { value: '  hello  ' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('hello');
    expect(input.value).toBe('');
  });

  it('does not send empty messages', () => {
    const { onSend, input } = setup();
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  it('shows Stop instead of Send while streaming and blocks new submissions', () => {
    const { onSend, onStop, input } = setup({ streaming: true });
    fireEvent.change(input, { target: { value: 'another' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Stop generating' }));
    expect(onStop).toHaveBeenCalled();
  });

  it('switches answer modes', () => {
    const onModeChange = vi.fn();
    setup({ onModeChange });
    fireEvent.click(screen.getByRole('radio', { name: /My Knowledge/ }));
    expect(onModeChange).toHaveBeenCalledWith('knowledge');
  });
});

describe('SourceCards', () => {
  const citation = (n, extra = {}) => ({ n, resourceId: `r${n}`, resourceType: 'document', title: `Source ${n}`, excerpt: `Excerpt ${n}`, page: n, cited: true, ...extra });

  it('links cited sources to the original item and hides uncited ones behind a toggle', () => {
    render(
      <Providers>
        <SourceCards messageId="m1" citations={[citation(1), citation(2, { cited: false })]} />
      </Providers>
    );
    expect(screen.getByRole('link', { name: /Source 1/ })).toHaveAttribute('href', '/vault/r1');
    expect(screen.getByText('p. 1')).toBeInTheDocument();
    expect(screen.queryByText('Source 2')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /1 more retrieved passage/ }));
    expect(screen.getByText('Source 2')).toBeInTheDocument();
  });

  it('does not link to a source that has since been deleted', () => {
    render(
      <Providers>
        <SourceCards messageId="m1" citations={[citation(1, { resourceDeleted: true })]} />
      </Providers>
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('(source deleted)')).toBeInTheDocument();
  });
});

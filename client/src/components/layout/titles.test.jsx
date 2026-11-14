import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TitleManager, { titleFor } from './TitleManager.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';

afterEach(cleanup);

describe('titleFor', () => {
  it('names every fixed page', () => {
    expect(titleFor('/')).toBe('Home');
    expect(titleFor('/vault')).toBe('Knowledge Vault');
    expect(titleFor('/graph')).toBe('Knowledge Graph');
    expect(titleFor('/flashcards')).toBe('Review');
    expect(titleFor('/quiz')).toBe('Quiz me');
    expect(titleFor('/login')).toBe('Sign in');
    expect(titleFor('/graph/')).toBe('Knowledge Graph');
  });

  it('includes the search words and settings section', () => {
    expect(titleFor('/search', '?q=machine%20learning')).toBe('“machine learning” · Smart Search');
    expect(titleFor('/search', '')).toBe('Smart Search');
    expect(titleFor('/settings/security')).toBe('Settings · Security');
    expect(titleFor('/settings')).toBe('Settings · Profile');
  });

  it('leaves note and chat pages to set their own title, and flags unknown pages', () => {
    expect(titleFor('/vault/64b0c0ffee')).toBeUndefined();
    expect(titleFor('/assistant/abc123')).toBeUndefined();
    expect(titleFor('/nope')).toBe('Page not found');
  });
});

describe('TitleManager', () => {
  it('sets the browser tab title for the current page', () => {
    render(
      <MemoryRouter initialEntries={['/timeline']}>
        <TitleManager />
      </MemoryRouter>
    );
    expect(document.title).toBe('Timeline · Mindmesh');
  });

  it('does not overwrite a title a page sets for itself', () => {
    function NotePage() {
      useDocumentTitle('My lecture notes');
      return null;
    }
    render(
      <MemoryRouter initialEntries={['/vault/64b0c0ffee']}>
        <NotePage />
        <TitleManager />
      </MemoryRouter>
    );
    expect(document.title).toBe('My lecture notes · Mindmesh');
  });
});

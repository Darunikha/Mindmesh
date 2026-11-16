import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import ResourceCard from './ResourceCard.jsx';
import ResourceList from './ResourceList.jsx';
import BulkBar from './BulkBar.jsx';
import { useSelection } from '../../hooks/useSelection.js';
import { LibraryProvider } from '../../context/LibraryContext.jsx';
import { ToastProvider } from '../../context/ToastContext.jsx';
import { Providers } from '../../test/utils.jsx';

const bulk = vi.fn();
vi.mock('../../api/library.js', () => ({
  libraryApi: { bulk: (...a) => bulk(...a) },
  collectionsApi: {
    list: () =>
      Promise.resolve({
        collections: [{ id: 'c1', name: 'Physics', parentId: null, count: 0 }],
        unfiledCount: 0,
      }),
  },
  tagsApi: { list: () => Promise.resolve({ tags: [] }) },
}));

const make = (id, title) => ({
  id,
  title,
  type: 'note',
  pinned: false,
  tags: [],
  collectionId: null,
  excerpt: 'text',
  processing: { chunkCount: 1, status: 'ready' },
  status: 'ready',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
});
const ITEMS = [make('aaa111', 'Alpha'), make('bbb222', 'Beta'), make('ccc333', 'Gamma')];

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname}</p>;
}

function Harness({ view = 'grid', theme = 'studio', onDone = () => {} }) {
  const select = useSelection();
  return (
    <>
      <button onClick={() => select.setActive(!select.active)}>Select</button>
      {view === 'grid' ? ITEMS.map((r, i) => <ResourceCard key={r.id} resource={r} index={i} select={select} />) : <ResourceList items={ITEMS} select={select} />}
      {select.active && <BulkBar select={select} loadedIds={ITEMS.map((i) => i.id)} onDone={onDone} />}
      <Where />
    </>
  );
}

const setup = (props) =>
  render(
    <Providers theme={props?.theme}>
      <ToastProvider>
        <LibraryProvider>
          <Harness {...props} />
        </LibraryProvider>
      </ToastProvider>
    </Providers>
  );

afterEach(() => {
  cleanup();
  bulk.mockReset();
});

describe.each(['library', 'studio', 'lab'])('select mode (%s theme)', (theme) => {
  for (const view of ['grid', 'list']) {
    it(`shows checkboxes only in select mode, and clicking selects instead of opening (${view})`, () => {
      setup({ theme, view });
      expect(screen.queryByRole('checkbox')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      expect(screen.getAllByRole('checkbox')).toHaveLength(3);

      fireEvent.click(screen.getByRole('link', { name: /Alpha/ }));
      expect(screen.getByTestId('where')).toHaveTextContent('/');
      expect(screen.getByRole('checkbox', { name: 'Select Alpha' })).toBeChecked();
      expect(screen.getByRole('region', { name: 'Bulk actions' })).toHaveTextContent('1 selected');

      fireEvent.click(screen.getByRole('checkbox', { name: 'Select Beta' }));
      expect(screen.getByRole('region', { name: 'Bulk actions' })).toHaveTextContent('2 selected');
    });
  }
});

describe('BulkBar', () => {
  it('has actions disabled until something is selected, and Done leaves select mode', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(screen.getByRole('button', { name: 'Pin' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('region', { name: 'Bulk actions' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('selects everything shown, then none', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select all 3 shown' }));
    expect(screen.getByRole('region', { name: 'Bulk actions' })).toHaveTextContent('3 selected');
    fireEvent.click(screen.getByRole('button', { name: 'Select none' }));
    expect(screen.getByRole('region', { name: 'Bulk actions' })).toHaveTextContent('Select items');
  });

  it('pins the selected items and refreshes', async () => {
    bulk.mockResolvedValue({ affected: 2 });
    const onDone = vi.fn();
    setup({ onDone });
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Gamma' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pin' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('pin'));
    expect(bulk).toHaveBeenCalledWith({
      action: 'pin',
      ids: ['aaa111', 'ccc333'],
    });
    expect(await screen.findByText('Pinned 2 items')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Bulk actions' })).toHaveTextContent('Select items');
  });

  it('moves items to a chosen collection', async () => {
    bulk.mockResolvedValue({ affected: 1 });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Beta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move 1 item' });
    await waitFor(() => expect(dialog.querySelector('option[value="c1"]')).not.toBeNull());
    fireEvent.change(dialog.querySelector('select'), {
      target: { value: 'c1' },
    });
    fireEvent.click(dialog.querySelectorAll('button')[1]);
    await waitFor(() =>
      expect(bulk).toHaveBeenCalledWith({
        action: 'move',
        collectionId: 'c1',
        ids: ['bbb222'],
      })
    );
  });

  it('asks for confirmation before deleting, and Cancel does nothing', async () => {
    bulk.mockResolvedValue({ affected: 2 });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select all 3 shown' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Delete 3 items?',
    });
    expect(bulk).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(bulk).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete 3 items?' })).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete 3 items' }));
    await waitFor(() =>
      expect(bulk).toHaveBeenCalledWith({
        action: 'delete',
        ids: ['aaa111', 'bbb222', 'ccc333'],
      })
    );
    void dialog;
  });

  it('keeps the selection and shows the error when a request fails', async () => {
    bulk.mockRejectedValue(new Error('Something went wrong'));
    const onDone = vi.fn();
    setup({ onDone });
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pin' }));
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Bulk actions' })).toHaveTextContent('1 selected');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import UploadDialog from './UploadDialog.jsx';
import LinkDialog from './LinkDialog.jsx';
import { LibraryProvider } from '../../context/LibraryContext.jsx';
import { ToastProvider } from '../../context/ToastContext.jsx';
import { MAX_UPLOAD_MB } from '../../api/library.js';

const api = vi.hoisted(() => ({ upload: vi.fn(), createLink: vi.fn(), listTags: vi.fn(), listCollections: vi.fn() }));
vi.mock('../../api/library.js', async (importOriginal) => ({
  ...(await importOriginal()),
  libraryApi: { upload: api.upload, createLink: api.createLink },
  collectionsApi: { list: api.listCollections },
  tagsApi: { list: api.listTags },
}));

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

beforeEach(() => {
  vi.clearAllMocks();
  api.listTags.mockResolvedValue({ tags: [] });
  api.listCollections.mockResolvedValue({ collections: [{ id: 'c1', name: 'Research', parentId: null, count: 0 }], unfiledCount: 0 });
});

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname}</p>;
}

const file = (name, { size, type = 'application/octet-stream', content = 'hello' } = {}) => {
  const f = new File([content], name, { type });
  if (size !== undefined) Object.defineProperty(f, 'size', { value: size });
  return f;
};

/** Providers every dialog needs, with a button to open it like the real pages do. */
function Shell({ children }) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <LibraryProvider>
          {children}
          <Where />
        </LibraryProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

// ───────────────────────────── Upload ─────────────────────────────

function UploadHarness({ onUploaded, initialFiles, defaultCollectionId, startOpen = true }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <Shell>
      <button onClick={() => setOpen(true)}>Open uploader</button>
      <UploadDialog open={open} onClose={() => setOpen(false)} onUploaded={onUploaded} initialFiles={initialFiles} defaultCollectionId={defaultCollectionId} />
    </Shell>
  );
}

const setupUpload = async (props = {}) => {
  const user = userEvent.setup({ applyAccept: false });
  render(<UploadHarness {...props} />);
  await screen.findByRole('dialog');
  const input = screen.getByLabelText('Choose files to upload');
  return { user, input };
};

const listed = () => within(screen.getByRole('dialog')).queryAllByRole('listitem');

describe('UploadDialog: choosing files', () => {
  it('explains what is accepted, including the size limit', async () => {
    await setupUpload();
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(new RegExp(`up to ${MAX_UPLOAD_MB} MB each`));
  });

  it('lists a chosen file with its size, and waits for you to press Upload', async () => {
    const { user, input } = await setupUpload();
    await user.upload(input, file('notes.txt', { size: 2048 }));
    expect(listed()).toHaveLength(1);
    expect(listed()[0]).toHaveTextContent('notes.txt');
    expect(listed()[0]).toHaveTextContent('2.0 KB');
    expect(screen.getByRole('button', { name: 'Upload 1 file' })).toBeInTheDocument();
    expect(api.upload).not.toHaveBeenCalled();
  });

  it('says "files" for several', async () => {
    const { user, input } = await setupUpload();
    await user.upload(input, [file('a.txt'), file('b.md')]);
    expect(screen.getByRole('button', { name: 'Upload 2 files' })).toBeInTheDocument();
  });

  it.each([
    ['an unsupported type', file('virus.exe'), 'Unsupported type (.exe).'],
    ['a file with no useful extension', file('README'), /Unsupported type/],
    ['a file that is too big', file('huge.pdf', { size: (MAX_UPLOAD_MB + 1) * 1024 * 1024 }), `Larger than ${MAX_UPLOAD_MB} MB.`],
    ['an empty file', file('empty.txt', { size: 0, content: '' }), 'This file is empty.'],
  ])('rejects %s before uploading anything', async (_label, f, message) => {
    const { user, input } = await setupUpload();
    await user.upload(input, f);
    expect(listed()[0]).toHaveTextContent(message);
    expect(screen.queryByRole('button', { name: /^Upload \d/ })).toBeNull();
    expect(api.upload).not.toHaveBeenCalled();
  });

  it('accepts supported types whatever their capitalisation', async () => {
    const { user, input } = await setupUpload();
    await user.upload(input, file('REPORT.PDF'));
    expect(listed()[0]).not.toHaveTextContent(/Unsupported/);
    expect(screen.getByRole('button', { name: 'Upload 1 file' })).toBeInTheDocument();
  });

  it('only the valid files are counted when you mix good and bad', async () => {
    const { user, input } = await setupUpload();
    await user.upload(input, [file('ok.txt'), file('bad.exe'), file('ok2.md')]);
    expect(screen.getByRole('button', { name: 'Upload 2 files' })).toBeInTheDocument();
    expect(listed()).toHaveLength(3);
  });

  it('lets you take a file off the list before uploading', async () => {
    const { user, input } = await setupUpload();
    await user.upload(input, [file('a.txt'), file('b.txt')]);
    await user.click(screen.getByRole('button', { name: 'Remove a.txt' }));
    expect(listed()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Upload 1 file' })).toBeInTheDocument();
  });

  it('accepts files dropped onto it', async () => {
    await setupUpload();
    const zone = screen.getByText('Drag files here, or').parentElement;
    fireEvent.drop(zone, { dataTransfer: { files: [file('dropped.md')] } });
    expect(await screen.findByText('dropped.md')).toBeInTheDocument();
  });

  it('adds files that were dropped on the page behind it', async () => {
    await setupUpload({ initialFiles: [file('from-page.txt')] });
    expect(await screen.findByText('from-page.txt')).toBeInTheDocument();
  });
});

describe('UploadDialog: uploading', () => {
  it('uploads with the chosen collection and tags, and shows progress then success', async () => {
    const onUploaded = vi.fn();
    let progress;
    let finish;
    api.upload.mockImplementation((f, meta, opts) => {
      progress = opts.onProgress;
      return new Promise((r) => (finish = r));
    });
    const { user, input } = await setupUpload({ onUploaded });
    const f = file('notes.txt');
    await user.upload(input, f);

    await waitFor(() => expect(screen.getByRole('option', { name: 'Research' })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Collection'), 'c1');
    await user.type(screen.getByLabelText('Tags'), 'physics,');
    await user.click(screen.getByRole('button', { name: 'Upload 1 file' }));

    await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(1));
    expect(api.upload.mock.calls[0][0]).toBe(f);
    expect(api.upload.mock.calls[0][1]).toEqual({ collectionId: 'c1', tags: ['physics'] });

    act(() => progress(0.4));
    expect(screen.getByRole('progressbar', { name: 'Uploading notes.txt' })).toHaveAttribute('aria-valuenow', '40');

    await act(async () => finish({ resource: { id: 'r1', title: 'notes' } }));
    expect(await screen.findByText(/Uploaded\. Text extraction is running in the background/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/vault/r1');
    expect(onUploaded).toHaveBeenCalledWith({ id: 'r1', title: 'notes' });
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('preselects the collection you were browsing', async () => {
    const { user, input } = await setupUpload({ defaultCollectionId: 'c1' });
    await user.upload(input, file('a.txt'));
    await waitFor(() => expect(screen.getByLabelText('Collection')).toHaveValue('c1'));
  });

  it('shows what went wrong and lets you retry just that file', async () => {
    api.upload.mockRejectedValueOnce(new Error('The server is busy')).mockResolvedValueOnce({ resource: { id: 'r2' } });
    const { user, input } = await setupUpload();
    await user.upload(input, file('a.txt'));
    await user.click(screen.getByRole('button', { name: 'Upload 1 file' }));
    expect(await screen.findByText('The server is busy')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry a.txt' }));
    expect(await screen.findByText(/Uploaded\./)).toBeInTheDocument();
    expect(screen.queryByText('The server is busy')).toBeNull();
    expect(api.upload).toHaveBeenCalledTimes(2);
  });

  it('can cancel an upload that is under way, then retry it', async () => {
    api.upload.mockImplementationOnce((f, meta, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
    api.upload.mockResolvedValueOnce({ resource: { id: 'r3' } });
    const { user, input } = await setupUpload();
    await user.upload(input, file('slow.pdf'));
    await user.click(screen.getByRole('button', { name: 'Upload 1 file' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel slow.pdf' }));
    expect(await screen.findByText('Cancelled')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry slow.pdf' }));
    expect(await screen.findByText(/Uploaded\./)).toBeInTheDocument();
  });

  it('uploads two at a time and starts the next as soon as one finishes', async () => {
    const finishers = [];
    api.upload.mockImplementation(() => new Promise((r) => finishers.push(r)));
    const { user, input } = await setupUpload();
    await user.upload(input, [file('a.txt'), file('b.txt'), file('c.txt')]);
    await user.click(screen.getByRole('button', { name: 'Upload 3 files' }));
    await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 50));
    expect(api.upload).toHaveBeenCalledTimes(2);

    await act(async () => finishers[0]({ resource: { id: 'ra' } }));
    await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(3));
    await act(async () => {
      finishers[1]({ resource: { id: 'rb' } });
      finishers[2]({ resource: { id: 'rc' } });
    });
    await waitFor(() => expect(screen.getAllByText(/Uploaded\./)).toHaveLength(3));
  });

  it('keeps going when one file fails: the others still upload', async () => {
    api.upload.mockRejectedValueOnce(new Error('Too big for the server')).mockResolvedValue({ resource: { id: 'ok' } });
    const { user, input } = await setupUpload();
    await user.upload(input, [file('bad.txt'), file('good.txt')]);
    await user.click(screen.getByRole('button', { name: 'Upload 2 files' }));
    expect(await screen.findByText('Too big for the server')).toBeInTheDocument();
    expect(await screen.findByText(/Uploaded\./)).toBeInTheDocument();
  });
});

describe('UploadDialog: closing', () => {
  it('closing while an upload is running cancels it', async () => {
    let signal;
    api.upload.mockImplementation((f, meta, opts) => {
      signal = opts.signal;
      return new Promise(() => {});
    });
    const { user, input } = await setupUpload();
    await user.upload(input, file('a.txt'));
    await user.click(screen.getByRole('button', { name: 'Upload 1 file' }));
    await waitFor(() => expect(signal).toBeDefined());
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(signal.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('refreshes your tags and collections after something was uploaded', async () => {
    api.upload.mockResolvedValue({ resource: { id: 'r1' } });
    const { user, input } = await setupUpload();
    await waitFor(() => expect(api.listTags).toHaveBeenCalledTimes(1));
    await user.upload(input, file('a.txt'));
    await user.click(screen.getByRole('button', { name: 'Upload 1 file' }));
    await screen.findByText(/Uploaded\./);
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(api.listTags).toHaveBeenCalledTimes(2));
    expect(api.listCollections).toHaveBeenCalledTimes(2);
  });

  it('does not refresh anything if nothing was uploaded, and starts empty next time', async () => {
    const { user, input } = await setupUpload();
    await user.upload(input, file('a.txt'));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.listTags).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Open uploader' }));
    await screen.findByRole('dialog');
    expect(listed()).toHaveLength(0);
  });

  it('the Open link goes to the new item and closes the dialog', async () => {
    api.upload.mockResolvedValue({ resource: { id: 'r9' } });
    const { user, input } = await setupUpload();
    await user.upload(input, file('a.txt'));
    await user.click(screen.getByRole('button', { name: 'Upload 1 file' }));
    await user.click(await screen.findByRole('link', { name: 'Open' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/vault/r9');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

// ───────────────────────────── Link ─────────────────────────────

function LinkHarness({ onSaved, onClose = () => {}, defaultCollectionId }) {
  const [open, setOpen] = useState(true);
  return (
    <Shell>
      <button onClick={() => setOpen(true)}>Open link dialog</button>
      <LinkDialog
        open={open}
        defaultCollectionId={defaultCollectionId}
        onSaved={onSaved}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      />
    </Shell>
  );
}

const setupLink = async (props = {}) => {
  const user = userEvent.setup();
  render(<LinkHarness {...props} />);
  await screen.findByRole('dialog');
  return { user };
};

describe('LinkDialog', () => {
  it('asks for a link when the box is empty, without calling the server', async () => {
    const { user } = await setupLink();
    await user.click(screen.getByRole('button', { name: 'Save link' }));
    expect(await screen.findByText('Paste a link')).toBeInTheDocument();
    expect(api.createLink).not.toHaveBeenCalled();
    expect(screen.getByLabelText('URL')).toHaveAttribute('aria-invalid', 'true');
  });

  it('treats a whitespace-only link as empty', async () => {
    const { user } = await setupLink();
    await user.type(screen.getByLabelText('URL'), '   ');
    await user.click(screen.getByRole('button', { name: 'Save link' }));
    expect(await screen.findByText('Paste a link')).toBeInTheDocument();
  });

  it('saves the link, tells you, closes, and opens the new item', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    api.createLink.mockResolvedValue({ resource: { id: 'L1', title: 'Example' } });
    const { user } = await setupLink({ onSaved, onClose });
    await user.type(screen.getByLabelText('URL'), '  https://example.com/article  ');
    await user.click(screen.getByRole('button', { name: 'Save link' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/vault/L1'));
    expect(api.createLink).toHaveBeenCalledWith({ url: 'https://example.com/article', title: undefined, collectionId: null, tags: [] });
    expect(onSaved).toHaveBeenCalledWith({ id: 'L1', title: 'Example' });
    expect(onClose).toHaveBeenCalled();
    expect(await screen.findByText('Link saved. Fetching the page in the background.')).toBeInTheDocument();
  });

  it('sends your own title, collection and tags when you give them', async () => {
    api.createLink.mockResolvedValue({ resource: { id: 'L2' } });
    const { user } = await setupLink({ defaultCollectionId: 'c1' });
    await user.type(screen.getByLabelText('URL'), 'https://example.com');
    await user.type(screen.getByLabelText(/^Title/), '  My title  ');
    await user.type(screen.getByLabelText('Tags'), 'reading,');
    await waitFor(() => expect(screen.getByLabelText('Collection')).toHaveValue('c1'));
    await user.click(screen.getByRole('button', { name: 'Save link' }));
    await waitFor(() => expect(api.createLink).toHaveBeenCalled());
    expect(api.createLink).toHaveBeenCalledWith({ url: 'https://example.com', title: 'My title', collectionId: 'c1', tags: ['reading'] });
  });

  it('shows the server’s complaint next to the field it is about, and stays open', async () => {
    api.createLink.mockRejectedValue(Object.assign(new Error('Invalid'), { fields: { url: 'Enter a valid web address' } }));
    const { user } = await setupLink();
    await user.type(screen.getByLabelText('URL'), 'not a url');
    await user.click(screen.getByRole('button', { name: 'Save link' }));
    expect(await screen.findByText('Enter a valid web address')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/');
  });

  it('shows other failures as a message at the top of the dialog', async () => {
    api.createLink.mockRejectedValue(new Error('That address points to a private network'));
    const { user } = await setupLink();
    await user.type(screen.getByLabelText('URL'), 'http://192.168.0.1');
    await user.click(screen.getByRole('button', { name: 'Save link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That address points to a private network');
  });

  it('Cancel closes it', async () => {
    const onClose = vi.fn();
    const { user } = await setupLink({ onClose });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('starts blank each time it is opened', async () => {
    const { user } = await setupLink();
    await user.type(screen.getByLabelText('URL'), 'https://old.example.com');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Open link dialog' }));
    expect(await screen.findByLabelText('URL')).toHaveValue('');
  });
});

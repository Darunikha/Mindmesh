import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import DocumentView from './DocumentView.jsx';
import { ToastProvider } from '../../context/ToastContext.jsx';
import { Providers } from '../../test/utils.jsx';
import { SUPPORTED_UPLOADS } from '../../api/library.js';

const fileBlob = vi.fn();
vi.mock('../../api/library.js', async (original) => ({
  ...(await original()),
  libraryApi: { fileBlob: (...a) => fileBlob(...a), chunks: () => Promise.resolve({ chunks: [], total: 0 }) },
}));

const make = (extension, processing = { status: 'ready', chunkCount: 0 }) => ({
  id: 'abc',
  title: 'Whiteboard',
  type: 'document',
  file: { extension, originalName: `whiteboard${extension}` },
  processing,
});

const setup = (resource) =>
  render(
    <Providers>
      <ToastProvider>
        <DocumentView resource={resource} />
      </ToastProvider>
    </Providers>
  );

const blobs = [];
beforeEach(() => {
  fileBlob.mockResolvedValue(new Blob(['pixels']));
  URL.createObjectURL = vi.fn((blob) => {
    blobs.push(blob);
    return `blob:preview-${blobs.length}`;
  });
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  fileBlob.mockReset();
  blobs.length = 0;
});

describe('DocumentView', () => {
  it('lets you upload common image formats', () => {
    for (const extension of ['.png', '.jpg', '.jpeg', '.webp']) expect(SUPPORTED_UPLOADS).toContain(extension);
  });

  it.each([
    ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'],
    ['.webp', 'image/webp'],
  ])('shows an uploaded %s as a picture', async (extension, type) => {
    setup(make(extension));
    const img = await screen.findByRole('img', { name: 'Uploaded image: Whiteboard' });
    expect(img).toHaveAttribute('src', 'blob:preview-1');
    expect(blobs[0].type).toBe(type);
    expect(screen.queryByRole('button', { name: 'Open PDF in a new tab' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Extracted text' })).toBeInTheDocument();
  });

  it('says that reading a picture can take a while', () => {
    setup(make('.png', { status: 'processing', chunkCount: 0 }));
    fireEvent.click(screen.getByRole('tab', { name: 'Extracted text' }));
    expect(screen.getByText(/Scanned pages and images can take a minute or two/)).toBeInTheDocument();
  });

  it('opens other formats on their text, with no preview', () => {
    setup(make('.txt'));
    expect(screen.queryByRole('tab', { name: 'Preview' })).toBeNull();
    expect(fileBlob).not.toHaveBeenCalled();
  });
});

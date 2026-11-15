import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveBlob, slugFilename } from './download.js';

afterEach(() => vi.restoreAllMocks());

describe('slugFilename', () => {
  it('makes safe, readable filenames', () => {
    expect(slugFilename('Café: "Notes" / 2026!')).toBe('cafe-notes-2026.md');
    expect(slugFilename('../../etc/passwd')).toBe('etc-passwd.md');
    expect(slugFilename('???')).toBe('untitled.md');
    expect(slugFilename('')).toBe('untitled.md');
    expect(slugFilename('a'.repeat(100)).length).toBe(63);
    expect(slugFilename('Report', 'txt')).toBe('report.txt');
  });
});

describe('saveBlob', () => {
  it('downloads the file under the given name and cleans up', () => {
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    const clicks = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clicks.push({ href: this.href, download: this.download });
    });
    vi.useFakeTimers();
    saveBlob(new Blob(['hello']), 'note.md');
    expect(clicks).toEqual([{ href: 'blob:test', download: 'note.md' }]);
    expect(document.querySelector('a[download]')).toBeNull();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    vi.useRealTimers();
  });
});

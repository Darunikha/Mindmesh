/** Makes a safe download filename from a title: letters, digits and dashes (same rules as the server). */
export function slugFilename(title, ext = 'md') {
  const slug = String(title || 'untitled')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'untitled'}.${ext}`;
}

/** Saves a Blob to the user's computer by clicking a temporary link. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

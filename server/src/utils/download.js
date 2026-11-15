/**
 * Sends text as a downloadable Markdown file. The filename is already a safe slug, and the
 * response is never cached, since it contains private content.
 */
export function sendMarkdown(res, filename, markdown) {
  res.set({
    'Content-Type': 'text/markdown; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(markdown);
}

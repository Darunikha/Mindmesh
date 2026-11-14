import { useEffect } from 'react';

export const APP_NAME = 'Mindmesh';

export function formatTitle(title) {
  return title ? `${title} · ${APP_NAME}` : APP_NAME;
}

/**
 * Sets the browser tab title. Pass `undefined` to leave the title alone (the page's
 * title is handled elsewhere); pass a string to set "<title> · Mindmesh".
 */
export function useDocumentTitle(title) {
  useEffect(() => {
    if (title === undefined) return;
    document.title = formatTitle(title);
  }, [title]);
}

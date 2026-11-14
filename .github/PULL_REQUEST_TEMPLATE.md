## What does this change, and why?

## How was it checked?
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] For UI changes: checked in all three themes and on a narrow screen (or ran `npm run check:ui`)

## Checklist
- [ ] Every new database query is scoped to the signed-in user, and has a test that tries to cross users
- [ ] No secrets, `.env` files or personal data are included
- [ ] Deleting or changing an item doesn't leave stale search, vector, graph or link data behind
- [ ] Anything I couldn't test (for example, features that need a live AI key) is noted below

## Notes

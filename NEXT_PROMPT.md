# Next task prompt (UI fixes from specs/PROMPT.md)

You are continuing ADA work. Implement the next batch of UX fixes from `specs/PROMPT.md`. Focus on **sidebar closing** and **Tips & Trick "Leggi" button state**.

## Goals
1) **Sidebar close control**
   - When the sidebar opens, add a clear way to close it without selecting a menu item.
   - The close affordance should be obvious and accessible (e.g., button/icon at top, or click overlay).
   - Make sure keyboard users can close it (Escape or focusable close button).
   - Keep the existing navigation behavior intact.

2) **Tips & Trick "Leggi" button disabled state**
   - On the "Domande & Risposte" → "Tips & Trick" page, disable and visually gray out the "Leggi" button when there are no tips to read.
   - When tips exist, ensure the button is enabled and styling reflects that state.
   - Use the existing state/DOM sources for tips (do not introduce new dependencies).

## Implementation notes
- Search for sidebar and Tips & Trick logic in `docs/` (use `rg` to find relevant components or functions).
- Keep changes localized; avoid refactors unless required.
- Ensure any UI text changes remain in Italian.

## Acceptance criteria
- Sidebar can be closed without selecting a menu item (mouse and keyboard).
- "Leggi" button is disabled/gray when there are zero tips; enabled otherwise.
- No console errors introduced.

## Testing expectations (do not run in Codex sandbox)
- `npm ci`
- `npm run serve`
- `npx playwright test --grep "@smoke"`

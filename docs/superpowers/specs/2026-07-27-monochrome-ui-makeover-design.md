# Monochrome UI Makeover — Design Spec

## Goal

Restyle the frontend into a single-font, pure black/white/gray UI: General Sans everywhere, -5% letter-spacing globally, sharper corners, and the gold accent removed in favor of neutral grays. Light mode only — dark mode is left untouched for now.

## Typography

- Self-host General Sans from `frontend/fonts/GeneralSans_Complete/GeneralSans_Complete/Fonts/WEB/fonts/` via `@font-face` declarations in `frontend/src/index.css`, using the variable font files (`GeneralSans-Variable.woff2/.woff/.ttf` for regular weights, `GeneralSans-VariableItalic.*` for italics) with `font-weight: 200 700` ranges so existing Tailwind weight classes (`font-medium`, `font-semibold`, etc.) keep working.
- Remove the Google Fonts `@import` for Playfair Display + Inter.
- Replace `--font-display` and `--font-body` with a single `--font-sans: 'General Sans', system-ui, sans-serif` CSS variable.
- Update `frontend/tailwind.config.ts` `fontFamily` so `display`, `body`, and `sans` all resolve to `['General Sans', 'system-ui', 'sans-serif']`, keeping the existing key names so no component class names need to change.
- Apply `letter-spacing: -0.05em` on `body` in the base layer so it's inherited by all text (headings, buttons, labels, paragraphs, and the generated cover letter output in `.cover-letter-output`).
- Remove the `h1`–`h6` rule that currently forces `font-family: var(--font-display)` — headings now just inherit the single sans font.

## Color Palette (light mode only)

Update the `:root` CSS variables in `frontend/src/index.css` (all values HSL, matching the existing var format):

- `--background: 0 0% 100%` (white)
- `--foreground: 0 0% 5%` (near-black)
- `--card`, `--popover`: `0 0% 100%` background / `0 0% 5%` foreground (unchanged structurally, just re-pointed to white/near-black)
- `--primary: 0 0% 5%`, `--primary-foreground: 0 0% 100%`
- `--secondary: 0 0% 96%`, `--secondary-foreground: 0 0% 5%`
- `--muted: 0 0% 94%`, `--muted-foreground: 0 0% 45%`
- `--accent: 0 0% 92%`, `--accent-foreground: 0 0% 5%` (neutral gray hover/active surface, replacing the gold)
- `--destructive` and `--destructive-foreground`: unchanged (red stays for delete/error actions)
- `--border`, `--input`: `0 0% 88%`
- `--ring: 0 0% 5%` (near-black focus ring, replacing the gold ring)
- `--radius: 0.25rem` (down from `0.75rem`)
- Sidebar tokens (`--sidebar-*`): re-pointed to the same grayscale values as their non-sidebar counterparts for consistency; no separate accent.

`.dark` block in `index.css` is left exactly as-is — out of scope for this pass.

## Explicitly Out of Scope

- Job Fit's semantic score/status colors (`frontend/src/components/jobfit/MatchResultsPanel.tsx`, `frontend/src/lib/collections.ts` — the green/amber/red used for match-quality bands and status badges) are **not** touched. These communicate meaning (good/warning/bad match), not brand styling.
- Dark mode (`.dark` CSS variables) is not restyled in this pass.
- No component-level TSX changes are needed for color/font, since components consume Tailwind tokens (`bg-background`, `text-foreground`, `border`, etc.) backed by the CSS variables above, rather than hardcoding hex colors.

## Files Touched

- `frontend/src/index.css` — `@font-face` rules, CSS variable updates, base-layer letter-spacing, removal of the display/body font split and Google Fonts import.
- `frontend/tailwind.config.ts` — `fontFamily` updated to General Sans across `sans`/`display`/`body` keys.
- Font files already present in `frontend/fonts/` — no new assets need to be added, but they need to be referenced from `index.css` (likely via relative path, confirmed during implementation to work with the Vite build).

## Testing / Verification

- Visual check: run the frontend dev server, confirm General Sans renders (check font-family in devtools), confirm no gold/amber accent remains outside Job Fit's semantic badges, confirm sharper corners on cards/buttons/dialogs.
- Confirm the cover letter output and Job Fit pages still render legibly with -5% tracking at body text sizes.
- No automated tests are expected to cover pure styling changes; verification is visual via the `run` skill/dev server.

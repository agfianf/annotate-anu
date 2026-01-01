# Color Theme Guide

This guide shows where to change colors in the web UI.

## Primary Theme Tokens

The base palette lives in `apps/web/src/index.css` under `:root`:

- `--primary` and `--accent` control the emerald theme.
- `--background`, `--foreground`, `--card` control base surfaces.
- `--border` and `--ring` control outlines and focus states.

Example:

```css
:root {
  --primary: 160 84% 39%;   /* #10b981 */
  --accent: 160 84% 51%;    /* #34d399 */
  --ring: 160 84% 39%;
}
```

## Tailwind Color Scale

Tailwind utilities use the emerald palette. Update it in:

- `apps/web/tailwind.config.js`

Change `emerald` values to shift the theme globally.

## UI Effects

Glass effects and gradients are defined in:

- `apps/web/src/index.css`

Look for `.glass`, `.glass-strong`, and gradient styles.

## Browser Theme Color

Update the meta tag in:

- `apps/web/index.html`

```html
<meta name="theme-color" content="#10b981" />
```

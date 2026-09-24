# MAN-D-STYLE web app

Static site deployed to GitHub Pages: `https://brandonbmzz3252.github.io/man-d-style/`.
Publishing: commit to `main`, then `git push origin main`.

## Conventions

- Color values live only in `style.css` as CSS custom properties on `:root` and
  themed in `[data-theme="royal"]` / `[data-theme="ocean"]` / `[data-theme="ember"]`.
  Never hardcode hex colours in components; use the variables.
- Theme IDs/labels must match the Expo app (`src/constants/themes.tsx`):
  Emerald, Royal Plum, Deep Ocean, Ember.
- When adding features, bump the `?v=` cache-buster in `index.html` for every
  changed asset (css/js) and bump `version.json` `seq` so clients auto-update.
- WhatsApp message text and the booking data shape must match the Expo app's
  `src/lib/api.ts` (`buildMessage`, `Booking`, `ADDONS`).

# PARITY RULE (client requirement)

This web app and the mobile Expo app (`../man-d-style-app`) must ALWAYS look and
function the same. Any feature, pricing, wording, theme, or behavior change must
be applied to BOTH apps in the same change. Share the same source of truth where
possible (services, add-ons, WhatsApp number, backend endpoint). Verify parity
before declaring a task done.
# Account switcher component QA

Source: stackernews/stacker.news, base d1cc5cf7820144fc25c152db6ea9202208232cb0, patch 9e7bca492ee5853c778acdeeb0ddf9136fa86a0f.

Six passing component-fixture cases: 320/390/1280 CSS pixels in light/dark mode, instructions visible, old multiAuth link absent, no horizontal overflow or browser errors. Actual cookie writes and the two account-click handlers were exercised. The router reload and GraphQL responses were mocked. This is not full Next.js, login-provider, backend, payment, or physical-device validation.

The real account.js, UserListRow, useCookie, cookieOptions and component styles were bundled with React19.2.6 and Bootstrap5.3.8. Screenshots were visually inspected.

## Reproduce

Use Node22+, clone the source repository at patch 9e7bca492ee5853c778acdeeb0ddf9136fa86a0f to ../stacker.news, and put this QA branch in a separate directory. Run npm install, npx playwright install chromium, then npm run qa. Set SN_REPO to override the source checkout and optionally QA_BROWSER_CHANNEL=msedge to match the captured browser. Output goes to screenshots/.

No credentials, account access, network API calls, or wallet are needed. Browser traffic goes only to an ephemeral localhost fixture. Dependencies are testing tools; the upstream patch changes no dependency.

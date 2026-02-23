# Phase 6: Build & Deploy

**Effort:** 1-2 days | **Blocks launch:** Yes | **Status: DONE**

## Checklist

### P6.1 — Build System
- [x] Set up Vite with minimal config
- [x] Custom plugin inlines non-module scripts during build
- [x] CodeMirror JS bundled and hashed (~475KB, 155KB gzipped)
- [x] CSS bundled and hashed
- [x] Output to `dist/` folder
- [x] Relative paths (`./`) for subdirectory compatibility
- [x] Source maps generated

### P6.2 — CSP Compatibility
- [x] Documented that `new Function()` requires `unsafe-eval` CSP
- [x] GitHub Pages does not enforce strict CSP — works out of the box
- [ ] Web Worker sandbox — deferred to Phase 7

### P6.3 — Deploy
- [x] Hosting: GitHub Pages
- [x] GitHub Actions workflow: test → build → deploy on push to main
- [x] Relative base path (`./`) for subdirectory support
- [x] `<meta>` tags for SEO/social sharing (og:title, og:description, description, keywords)
- [x] Favicon (inline SVG data URI — lightning bolt emoji)
- [x] Theme color meta tag
- [ ] Custom domain + HTTPS — configure in GitHub repo settings when ready

### P6.4 — Analytics (Optional)
- [ ] Add lightweight analytics — deferred (post-launch)

## Verification

```bash
npm run build          # Must succeed, output in dist/
node tests.js          # 97 pass, 0 fail
node scripts/verify.js # 31 checks, all green
```

Deploy: push to main branch → GitHub Actions runs tests, builds, deploys to Pages.

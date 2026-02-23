# Phase 6: Build & Deploy

**Effort:** 1-2 days | **Blocks launch:** Yes

## Checklist

### P6.1 — Build System
- [ ] Set up Vite with minimal config
- [ ] Bundle all JS into one file, minify
- [ ] Hash filenames for cache busting
- [ ] Output to `dist/` folder
- [ ] Verify `dist/index.html` works standalone

### P6.2 — CSP Compatibility
- [ ] Document that `new Function()` requires `unsafe-eval` CSP
- [ ] Test on target hosting platform's CSP
- [ ] If needed, implement Web Worker sandbox (see Phase 7)

### P6.3 — Deploy
- [ ] Choose hosting: Netlify / Vercel / Cloudflare Pages / GitHub Pages
- [ ] Configure build command (`npm run build`)
- [ ] Set up custom domain + HTTPS
- [ ] Add `<meta>` tags for SEO/social sharing
- [ ] Add favicon
- [ ] Test deployed version end-to-end

### P6.4 — Analytics (Optional)
- [ ] Add lightweight analytics (Plausible or similar, no cookies)
- [ ] Track: page views, compile clicks, example loads
- [ ] No tracking of user code content

## Verification

```bash
npm run build          # Must succeed
node scripts/verify.js # All checks green
```

Open deployed URL and test all 6 examples.

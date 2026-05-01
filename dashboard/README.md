# dashboard (Phase 4 mockup)

Next.js dashboard for mediatracker. Currently runs against **seeded fake data**
in `lib/data.ts` so the layout can be reviewed before Phases 2 (analyzer) and
3 (clustering) land.

## Local dev

```bash
cd dashboard
npm install
npm run dev
# http://localhost:3000
```

## Static build

```bash
DEPLOY_BASE_PATH=/mediatracker npm run build
# output in ./out
```

## Deploy

A GitHub Actions workflow at `.github/workflows/pages.yml` builds the static
export and publishes to GitHub Pages on every push to `main` or to the
working branch. To enable:

1. Repo Settings → **Pages** → Source: **GitHub Actions**.
2. Push (or hit "Run workflow" on the Actions tab).

The published URL will be `https://<owner>.github.io/mediatracker/`.

## When real data lands

Replace `lib/data.ts` with a fetch from a small API route or a build-time
import that reads the SQLite DB and shapes it into the same `Story` /
`Mention` types defined in that file.

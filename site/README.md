# Quakpit download site

A dependency-free static landing page (`index.html` + `styles.css` + `app.js`). The download
button fills itself from your **latest GitHub Release** asset (`.dmg`) via the GitHub API.
Currently macOS-only (Windows is advertised as "coming soon"). Until a release is published, the
button points to the releases page.

## Configure

Edit the top of `app.js`:

```js
const GITHUB_OWNER = 'Ooble-Studio'
const GITHUB_REPO = 'QuakPit'
```

These must match the `publish:` block in `../electron-builder.yml`. Publishing a build with
`electron-builder --publish always` (with a `GH_TOKEN`) uploads the `.dmg`/`.exe` to GitHub
Releases, and the site picks them up automatically.

## Preview locally

```bash
cd site
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy (pick one — all free)

- **Netlify**: drag the `site/` folder onto https://app.netlify.com/drop
- **Vercel**: `npx vercel deploy site --prod`
- **GitHub Pages**: push `site/` to a repo and enable Pages, or use a `gh-pages` branch
- **Your domain**: upload the three files to any static host (e.g. `quakpit.ooble.studio`)

> Note: macOS/Windows installers must be **code-signed + notarized** so they download and open
> without security warnings (see the main `../README.md`).

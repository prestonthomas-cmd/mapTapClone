# Working in this repo

## Branching

Work directly on `main`. Commit and push straight to it — do not create feature
branches for this project unless explicitly asked.

`main` is the default branch and the deployment source; a push to it publishes
the site.

## Layout

Plain `<script>` tags, no bundler and no framework. `index.html` fixes the load
order. Everything hangs off a single `MT` namespace so the game also runs from
`file://`, which rules out ES modules and `fetch()` for local data.

`data/world.js` and `data/cities.js` are generated — edit `tools/build-data.js`
and re-run `npm run build:data` rather than touching them by hand. Same for the
satellite plates in `assets/` and `tools/build-textures.js`.

## Before pushing

There is no test suite. Check changes by actually playing the game:

```bash
npm start        # http://localhost:8080
```

Rendering changes deserve a look at both map styles (the 🛰 button) and at both
low and high zoom, since level-of-detail and the satellite layer switch over at
2.4x zoom.

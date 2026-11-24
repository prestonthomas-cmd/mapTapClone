# Working in this repo

## Branching

Work on `dev`. Never commit or push to `main` directly; after each push, ask
before merging `dev` into `main`. This follows the global `repo-protocol`
skill — this repo is not an exception to it.

`main` is the default branch and the deployment source, so the merge is what
publishes the site. Nothing reaches the live game until one happens, which
makes the merge the moment to be sure of a change rather than the push.

## Layout

Plain `<script>` tags, no bundler and no framework. `index.html` fixes the load
order. Everything hangs off a single `MT` namespace so the game also runs from
`file://`, which rules out ES modules and `fetch()` for local data.

`data/world.js` and `data/cities.js` are generated — edit `tools/build-data.js`
and re-run `npm run build:data` rather than touching them by hand. Same for the
satellite plates in `assets/` and `tools/build-textures.js`, and for the detail tiles
in `assets/tiles/` and `tools/build-tiles.js`.

## Before pushing

There is no test suite. Check changes by actually playing the game:

```bash
npm start        # http://localhost:8080
```

Rendering changes deserve a look at both low and high zoom, since level of
detail changes at 2.4x and the 8K plate only loads past 2.5x.

The globe is always satellite. The vector renderer in `globe.js` is not a
style option — it is the stand-in for a plate that has not decoded yet and for
devices without WebGL, so it still has to work. Test it by launching with
WebGL disabled.

# Rubik's Cube 3D

A 3D Rubik's cube you can shuffle, turn and solve, in the browser or installed as an app.
Built with React, Vite and three.js.

## Features

- Drag a face to turn it; drag the background to rotate the view; scroll or pinch to zoom.
- **Simple** view control (one direction per drag, with horizontal/vertical angle sliders) or **Free**.
- **Straighten** snaps the view back to an upright angle.
- **Shuffle**, **Solve** (replays your moves in reverse), **Undo**, **Reset**.
- **Import cube**: paint each face to match a physical cube (with checks for impossible
  colourings), then follow the solution move by move.
- **Solve step by step**: finds a short (~20 move) solution for the current cube with the
  Kociemba two-phase solver ([cubejs](https://github.com/ldez/cubejs), run in a Web Worker)
  and guides you through it with Back / Next / Play.
- Progress is saved after every move and resumed when you come back.
- Installable PWA that works fully offline, with its own install banner (or an
  "Add to Home Screen" tip on iPhone/iPad) and an "Install app" button in the panel.
- When a new version is deployed, open apps show a "New version available — Update" banner
  (open apps also check for updates hourly).
- **Share** opens a QR code of the app's link, with copy, native share and PNG download.

## Develop

```bash
npm install
npm run dev
```

Production build and local preview (includes the service worker):

```bash
npm run build
npm run preview
```

App icons are generated from `public/icon.svg`; after changing it run:

```bash
npm run generate-icons
```

## Deploy to Vercel

The project is ready for Vercel (`vercel.json` sets the build and caching headers for the
service worker). Either:

- **Git:** push this repository to GitHub/GitLab/Bitbucket, then in Vercel choose
  *Add New → Project*, import the repo and deploy (settings are detected automatically).
- **CLI:** run `npx vercel` to create a preview deployment, then `npx vercel --prod`.

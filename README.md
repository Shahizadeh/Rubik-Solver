# Rubik's Cube 3D

A 3D Rubik's cube you can shuffle, turn and solve, in the browser or installed as an app.
Built with React, Vite and three.js.

## Features

- Drag a face to turn it; drag the background to rotate the view; scroll or pinch to zoom.
- **Simple** view control (one direction per drag, with horizontal/vertical angle sliders) or **Free**.
- **Straighten** snaps the view back to an upright angle.
- **Shuffle**, **Solve** (replays your moves in reverse), **Undo**, **Reset**.
- Progress is saved after every move and resumed when you come back.
- Installable PWA that works fully offline.

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

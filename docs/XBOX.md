# Running Slagworks on Xbox

The game is a web app with full controller support, so there are three routes onto a console, from quickest to most involved.

## 1. Edge browser (works today)

1. Host the project folder on any HTTPS static host (GitHub Pages, Netlify, your own server). No build step is needed: upload `index.html`, `style.css`, `manifest.webmanifest`, `icon.svg`, `sw.js` and `src/`.
2. On the Xbox open Microsoft Edge and browse to the URL.
3. Press any button: the game switches to controller mode. Right stick moves the cursor, A clicks, B mines.

For testing on a home network, run `npm run serve` on a PC and browse to `http://<pc-address>:5173` from the console. (Offline caching needs HTTPS, plain HTTP still plays.)

## 2. Installed app (PWA)

When served over HTTPS, Edge offers "Install this site as an app" from its menu. The manifest launches it fullscreen and the service worker caches the files so it starts without a connection.

## 3. Store / Dev Mode package

A retail Store release needs things that can't be produced from this repo alone:

- A Microsoft Partner Center developer account (and ID@Xbox approval for a game listed in the Xbox Store proper).
- An MSIX package. The usual path for a web game is [PWABuilder](https://www.pwabuilder.com): point it at the hosted HTTPS URL and it generates a Windows/Xbox package from the manifest.
- To sideload without the Store, enable Developer Mode on the console and deploy that package through the Xbox Device Portal.

## Console notes

- UI sizes are relative to screen height, so 1080p and 4K TVs both get readable panels; all HUD panels sit inside a TV-safe margin.
- Saves use browser storage on the console and are kept per installed app / site.
- Controller layout is listed in-game under Controls.

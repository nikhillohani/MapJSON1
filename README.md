# MapJSON Plus

MapJSON Plus is a static browser tool for building clean location JSON entries from Google Maps URLs or manual address details.

## Run Locally

Open `index.html` in a browser, or serve the folder with a local static server.

```bash
python3 -m http.server 8765
```

Then open:

```text
http://localhost:8765
```

## Chrome Extension

The Chrome extension source lives in `MapJSON +/`.

To load it:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `MapJSON +` folder.

## Project Structure

```text
index.html          Main web app
css/style.css       App styles
js/app.js           App logic
assets/             Images and UI assets
```

## Google Maps Connector

The main tool supports connector URLs like:

```text
?mapjsonSlot=1&mapjsonUrl=https%3A%2F%2Fwww.google.com%2Fmaps%2F...&mapjsonAuto=1
```

Use the separate `MapJSON Connector` extension folder from the main project to send Google Maps locations into Slot 1, 2, or 3.

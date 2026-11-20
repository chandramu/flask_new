# Notes — an iPad notes & journal app

A Flask app that installs on your iPad home screen and runs full-screen like a native app (a PWA).

- Split view in landscape (list + editor), one pane at a time in portrait / Split View
- Autosaves as you type, pin notes, search, delete
- Light and dark mode follow the iPad setting
- Cmd+N for a new note with a keyboard attached
- Notes are stored in SQLite (`notes.db`) on the computer running the server

## Run it

```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

The server listens on port 5000 on all network interfaces.

## Put it on your iPad

1. Connect the iPad to the same Wi-Fi as the computer running `app.py`.
2. Find the computer's local IP (macOS: System Settings → Wi-Fi → Details; Windows: `ipconfig`), e.g. `192.168.1.20`.
3. On the iPad, open **Safari** and go to `http://192.168.1.20:5000`.
4. Tap the **Share** button → **Add to Home Screen** → **Add**.
5. Open **Notes** from the home screen — it runs full-screen with its own icon.

> Offline caching (service worker) only works over HTTPS. Over plain `http://` on your
> local network the app works fine but needs the server reachable. To use it anywhere,
> deploy to an HTTPS host such as Render, Railway, Fly.io or PythonAnywhere.

## API

| Method | Path | |
|---|---|---|
| GET | `/api/notes?q=` | list / search |
| POST | `/api/notes` | create |
| GET/PUT/DELETE | `/api/notes/<id>` | read / update / delete |

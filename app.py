"""Notes — a Flask-backed notes/journal web app that installs on iPad as a PWA."""
import os
import sqlite3
from datetime import datetime, timezone

from flask import Flask, g, jsonify, render_template, request, send_from_directory, abort

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("NOTES_DB", os.path.join(BASE_DIR, "notes.db"))

app = Flask(__name__)


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    with sqlite3.connect(DB_PATH) as db:
        db.execute(
            """CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL DEFAULT '',
                body TEXT NOT NULL DEFAULT '',
                pinned INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"""
        )


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def to_dict(row):
    return {
        "id": row["id"],
        "title": row["title"],
        "body": row["body"],
        "pinned": bool(row["pinned"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def get_note_or_404(note_id):
    row = get_db().execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    if row is None:
        abort(404)
    return row


# ---------- Pages & PWA files ----------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/sw.js")
def service_worker():
    # Served from the root so its scope covers the whole app.
    resp = send_from_directory(os.path.join(BASE_DIR, "static"), "sw.js")
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["Service-Worker-Allowed"] = "/"
    return resp


@app.route("/manifest.webmanifest")
def manifest():
    resp = send_from_directory(os.path.join(BASE_DIR, "static"), "manifest.webmanifest")
    resp.headers["Content-Type"] = "application/manifest+json"
    return resp


# ---------- REST API ----------

@app.get("/api/notes")
def list_notes():
    q = request.args.get("q", "").strip()
    sql = "SELECT * FROM notes"
    params = []
    if q:
        sql += " WHERE title LIKE ? OR body LIKE ?"
        params = [f"%{q}%", f"%{q}%"]
    sql += " ORDER BY pinned DESC, updated_at DESC"
    rows = get_db().execute(sql, params).fetchall()
    return jsonify([to_dict(r) for r in rows])


@app.post("/api/notes")
def create_note():
    data = request.get_json(silent=True) or {}
    ts = now()
    db = get_db()
    cur = db.execute(
        "INSERT INTO notes (title, body, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (str(data.get("title", "")), str(data.get("body", "")), int(bool(data.get("pinned"))), ts, ts),
    )
    db.commit()
    return jsonify(to_dict(get_note_or_404(cur.lastrowid))), 201


@app.get("/api/notes/<int:note_id>")
def get_note(note_id):
    return jsonify(to_dict(get_note_or_404(note_id)))


@app.put("/api/notes/<int:note_id>")
def update_note(note_id):
    row = get_note_or_404(note_id)
    data = request.get_json(silent=True) or {}
    title = str(data.get("title", row["title"]))
    body = str(data.get("body", row["body"]))
    pinned = int(bool(data.get("pinned", row["pinned"])))
    db = get_db()
    db.execute(
        "UPDATE notes SET title = ?, body = ?, pinned = ?, updated_at = ? WHERE id = ?",
        (title, body, pinned, now(), note_id),
    )
    db.commit()
    return jsonify(to_dict(get_note_or_404(note_id)))


@app.delete("/api/notes/<int:note_id>")
def delete_note(note_id):
    get_note_or_404(note_id)
    db = get_db()
    db.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    db.commit()
    return "", 204


init_db()

if __name__ == "__main__":
    # host 0.0.0.0 so an iPad on the same Wi-Fi can reach it.
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)

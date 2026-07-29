# Nemotron bro

A minimal chatbot website that talks to NVIDIA's `nemotron-3-super-120b-a12b`
model, with streaming responses (including the model's reasoning trace shown
separately from its answer).

## Why a backend at all?

Your API key must never live in browser-side code — anyone could open dev
tools and steal it. This project uses a tiny Flask server as a proxy: the
browser talks to your server, and only your server talks to NVIDIA, using a
key that's kept in an environment variable.

**Important:** the key you pasted earlier in chat is now public. Rotate it
in the NVIDIA NGC / build.nvidia.com dashboard before using this, and never
commit the new one to source control.

## Setup

```bash
cd chatbot
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

export NVIDIA_API_KEY="nvapi-your-new-key-here"   # Windows: set NVIDIA_API_KEY=...
python app.py
```

Then open http://localhost:5000 in your browser.

## How it works

- `app.py` — Flask server. `/` serves the chat page; `POST /api/chat` takes
  the conversation so far, calls the NVIDIA API with `stream=True`, and
  relays each token back to the browser over Server-Sent Events (SSE) as
  it arrives, so replies appear incrementally instead of all at once.
- `templates/index.html` / `static/style.css` / `static/script.js` — the
  chat UI. It keeps the full conversation in memory client-side (`history`
  array) and resends it with each new message, since the API itself is
  stateless.

## Deploying it for real

Running `python app.py` is fine for local testing, but Flask's dev server
isn't meant for production traffic. To put this on the internet:

1. Run it behind a production WSGI server, e.g. `gunicorn -w 2 -b 0.0.0.0:8000 app:app`.
2. Put it behind a reverse proxy (nginx, Caddy, or your host's load balancer)
   for HTTPS.
3. Set `NVIDIA_API_KEY` as a secret/environment variable on your host
   (Render, Railway, Fly.io, a VPS, etc.) — never in the code.
4. Consider adding rate limiting per visitor (e.g. `flask-limiter`) so one
   user can't run up your NVIDIA usage.

## Customizing

- Change the system prompt or model in `app.py` (`SYSTEM_PROMPT`, `MODEL`).
- The UI's color tokens are CSS variables at the top of `static/style.css`
  if you want to reskin it.

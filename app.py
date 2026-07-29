import json
import os

from flask import Flask, Response, render_template, request, stream_with_context
from openai import OpenAI


def load_env_file(path=".env"):
    if not os.path.exists(path):
        return

    with open(path, encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value

# --- Configuration -----------------------------------------------------
MODEL = "nvidia/nemotron-3-ultra-550b-a55b"
SYSTEM_PROMPT = "You are a helpful, concise assistant."

load_env_file()

app = Flask(__name__, template_folder=".", static_folder=".", static_url_path="")


def get_client():
    api_key = os.environ.get("NVIDIA_API_KEY") or "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"
    if not api_key:
        return None
    return OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=api_key)


def build_messages(history):
    history = history[-20:]
    return [{"role": "system", "content": SYSTEM_PROMPT}] + [
        {"role": m.get("role"), "content": str(m.get("content", ""))[:8000]}
        for m in history
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]


def stream_chat_response(client, messages):
    try:
        stream = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=0.7,
            top_p=0.9,
            max_tokens=1500,
            stream=True,
        )

        full_text = []
        for chunk in stream:
            delta = ""
            if chunk.choices:
                choice = chunk.choices[0]
                delta_obj = getattr(choice, "delta", None)
                if delta_obj is not None:
                    delta = getattr(delta_obj, "content", "") or ""
                else:
                    message_obj = getattr(choice, "message", None)
                    if message_obj is not None:
                        delta = getattr(message_obj, "content", "") or ""

            if delta:
                full_text.append(delta)
                yield f"data: {json.dumps({'delta': delta})}\n\n"

        if not full_text:
            yield f"data: {json.dumps({'done': True, 'reply': ''})}\n\n"
            return

        yield f"data: {json.dumps({'done': True, 'reply': ''.join(full_text)})}\n\n"
    except Exception as exc:
        yield f"data: {json.dumps({'error': str(exc)})}\n\n"


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/about")
def about():
    return render_template("about.html")


@app.route("/api/chat", methods=["POST", "OPTIONS"])
def chat():
    if request.method == "OPTIONS":
        return Response(status=204)

    client = get_client()
    if client is None:
        return Response(
            json.dumps({"error": "Server is missing NVIDIA_API_KEY. Set it as an environment variable and restart."}),
            status=500,
            mimetype="application/json",
        )

    body = request.get_json(force=True) or {}
    history = body.get("messages", [])
    messages = build_messages(history)

    if not messages or messages[-1]["role"] != "user":
        return Response(json.dumps({"error": "No user message provided."}), status=400, mimetype="application/json")

    wants_stream = "text/event-stream" in request.headers.get("Accept", "")
    if wants_stream:
        return Response(
            stream_with_context(stream_chat_response(client, messages)),
            mimetype="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    try:
        completion = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=0.7,
            top_p=0.9,
            max_tokens=1500,
            stream=False,
        )
        content = ""
        if completion.choices:
            choice = completion.choices[0]
            if getattr(choice, "message", None) is not None:
                content = getattr(choice.message, "content", "") or ""
        return Response(
            json.dumps({"reply": content}),
            mimetype="application/json",
        )
    except Exception as exc:
        return Response(
            json.dumps({"error": str(exc)}),
            status=500,
            mimetype="application/json",
        )


if __name__ == "__main__":
    app.run(debug=True, port=5000)

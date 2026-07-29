const log = document.getElementById("log");
const emptyState = document.getElementById("empty-state");
const composer = document.getElementById("composer");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send-btn");
const statusEl = document.getElementById("status");
const statusText = document.getElementById("status-text");
const fileInput = document.getElementById("file-input");
const filePreview = document.getElementById("file-preview");
const themeToggle = document.getElementById("theme-toggle");
const themeIcon = document.querySelector(".theme-toggle-icon");

let history = [];
let busy = false;
let attachedFile = null;
const isChatPage = Boolean(log && emptyState && composer && input && sendBtn && statusEl && statusText && fileInput && filePreview);

function applyTheme(theme) {
  const resolvedTheme = theme === "light" ? "light" : "dark";
  document.body.classList.toggle("light", resolvedTheme === "light");
  document.body.dataset.theme = resolvedTheme;
  localStorage.setItem("theme", resolvedTheme);
  if (themeIcon) {
    themeIcon.textContent = resolvedTheme === "light" ? "🌙" : "☀️";
  }
  if (themeToggle) {
    themeToggle.setAttribute("aria-pressed", String(resolvedTheme === "light"));
  }
}

function initializeTheme() {
  const storedTheme = localStorage.getItem("theme");
  if (storedTheme === "light" || storedTheme === "dark") {
    applyTheme(storedTheme);
    return;
  }

  const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  applyTheme(prefersLight ? "light" : "dark");
}

initializeTheme();

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const nextTheme = document.body.dataset.theme === "light" ? "dark" : "light";
    applyTheme(nextTheme);
  });
}

function setStatus(state, label) {
  statusEl.className = `status ${state}`;
  statusText.textContent = label;
}

function autoResize() {
  if (!input) return;
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 140) + "px";
}

if (isChatPage) {
  input.addEventListener("input", autoResize);

  document.querySelectorAll(".prompt-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      input.value = chip.dataset.prompt || "";
      autoResize();
      input.focus();
    });
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      composer.requestSubmit();
    }
  });
}

function scrollToBottom() {
  if (log) {
    log.scrollTop = log.scrollHeight;
  }
}

function getApiUrl() {
  if (window.location.protocol === "file:") {
    return "http://127.0.0.1:5000/api/chat";
  }
  return `${window.location.origin}/api/chat`;
}

function addUserMessage(text, attachmentName) {
  if (emptyState) {
    emptyState.remove();
  }
  const msg = document.createElement("div");
  msg.className = "msg user";
  msg.innerHTML = `<div class="bubble"></div>`;
  msg.querySelector(".bubble").textContent = text;
  if (attachmentName) {
    const pill = document.createElement("div");
    pill.className = "attachment-pill";
    pill.textContent = `📎 ${attachmentName}`;
    msg.appendChild(pill);
  }
  log.appendChild(msg);
  scrollToBottom();
}

function addAssistantMessage() {
  const msg = document.createElement("div");
  msg.className = "msg assistant";
  msg.innerHTML = `
    <div class="reasoning-label" hidden>thinking</div>
    <div class="reasoning" hidden></div>
    <div class="bubble"></div>
    <div class="message-actions" hidden></div>
  `;
  log.appendChild(msg);
  scrollToBottom();
  const actions = msg.querySelector(".message-actions");
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "copy-btn";
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(msg.querySelector(".bubble").textContent);
      copyBtn.textContent = "Copied";
      setTimeout(() => {
        copyBtn.textContent = "Copy";
      }, 1200);
    } catch {
      copyBtn.textContent = "Copy failed";
    }
  });

  const speechBtn = document.createElement("button");
  speechBtn.type = "button";
  speechBtn.className = "copy-btn";
  speechBtn.textContent = "Speak";
  let isSpeaking = false;
  let currentUtterance = null;

  speechBtn.addEventListener("click", () => {
    const text = msg.querySelector(".bubble").textContent;
    if (!text) return;

    if (!window.speechSynthesis) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      isSpeaking = false;
      currentUtterance = null;
      speechBtn.textContent = "Speak";
      return;
    }

    window.speechSynthesis.cancel();
    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.lang = "en-US";
    currentUtterance.rate = 1;

    currentUtterance.onstart = () => {
      isSpeaking = true;
      speechBtn.textContent = "Stop";
    };

    currentUtterance.onend = () => {
      isSpeaking = false;
      currentUtterance = null;
      speechBtn.textContent = "Speak";
    };

    currentUtterance.onerror = () => {
      isSpeaking = false;
      currentUtterance = null;
      speechBtn.textContent = "Speak";
    };

    window.speechSynthesis.speak(currentUtterance);
  });

  actions.appendChild(copyBtn);
  actions.appendChild(speechBtn);
  return {
    root: msg,
    label: msg.querySelector(".reasoning-label"),
    reasoning: msg.querySelector(".reasoning"),
    bubble: msg.querySelector(".bubble"),
    actions,
    copyBtn,
    speechBtn,
  };
}

function cleanDisplayedText(text) {
  return (text || "").replace(/\*\*/g, "").replace(/__/g, "");
}

function finalizeAssistantMessage(els, contentText) {
  els.bubble.textContent = cleanDisplayedText(contentText || "No reply returned.");
  els.actions.hidden = false;
}

async function readStreamResponse(res, els) {
  if (!res.body) {
    throw new Error("Streaming response is not available.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let contentText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      const lines = part.split("\n");
      let dataLine = "";
      for (const line of lines) {
        if (line.startsWith("data:")) {
          dataLine += line.slice(5).trim();
        }
      }

      if (!dataLine) continue;

      let payload = {};
      try {
        payload = JSON.parse(dataLine);
      } catch {
        continue;
      }

      if (payload.error) {
        throw new Error(payload.error);
      }

      if (payload.delta) {
        contentText += payload.delta;
        els.bubble.textContent = cleanDisplayedText(contentText || "");
        scrollToBottom();
      }

      if (payload.done) {
        return payload.reply || contentText;
      }
    }
  }

  if (buffer) {
    try {
      const payload = JSON.parse(buffer.replace(/^data:\s*/, ""));
      if (payload.error) {
        throw new Error(payload.error);
      }
      if (payload.delta) {
        contentText += payload.delta;
        els.bubble.textContent = cleanDisplayedText(contentText || "");
      }
      if (payload.done) {
        return payload.reply || contentText;
      }
    } catch {
      // Ignore malformed chunks and fall back to the text we already built.
    }
  }

  return contentText;
}

function readFileContent(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
      } else {
        resolve("");
      }
    };
    reader.onerror = () => resolve("");

    if (file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".txt") || file.name.toLowerCase().endsWith(".md") || file.name.toLowerCase().endsWith(".json") || file.name.toLowerCase().endsWith(".csv")) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
  });
}

function updateFilePreview() {
  if (!filePreview) return;
  if (!attachedFile) {
    filePreview.classList.add("hidden");
    filePreview.textContent = "";
    return;
  }

  filePreview.classList.remove("hidden");
  filePreview.textContent = `Attached: ${attachedFile.name}`;
}

if (fileInput) {
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    const content = await readFileContent(file);
    attachedFile = {
      name: file.name,
      type: file.type || "application/octet-stream",
      content,
    };
    updateFilePreview();
    fileInput.value = "";
  });
}

if (composer) {
  composer.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if ((!text && !attachedFile) || busy) return;

    const messageContent = [text, attachedFile ? `Attachment: ${attachedFile.name}\nType: ${attachedFile.type}\n\n${attachedFile.content}` : ""]
      .filter(Boolean)
      .join("\n\n");

    input.value = "";
    autoResize();
    addUserMessage(text || "Uploaded a file", attachedFile?.name);
    history.push({ role: "user", content: messageContent });
    attachedFile = null;
    updateFilePreview();

    busy = true;
    sendBtn.disabled = true;
    setStatus("busy", "thinking");

    const els = addAssistantMessage();

    try {
      const res = await fetch(getApiUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok) {
        let payload = {};
        try {
          payload = await res.json();
        } catch {
          payload = {};
        }
        throw new Error(payload.error || `Request failed (${res.status})`);
      }

      const contentText = await readStreamResponse(res, els);
      finalizeAssistantMessage(els, contentText);
      setStatus("ready", "ready");
      history.push({ role: "assistant", content: contentText });
    } catch (err) {
      els.bubble.textContent = `Something went wrong: ${err.message}`;
      els.bubble.style.color = "#f0a3a3";
      setStatus("error", "error");
    } finally {
      busy = false;
      sendBtn.disabled = false;
    }
  });
}

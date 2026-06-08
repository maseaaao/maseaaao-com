import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const SOURCE_FILE = path.join(REPO_ROOT, "dist", "checklist.md");
const OUTPUT_DIR = path.join(REPO_ROOT, "dist");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "checklist.html");
const STORAGE_KEY = "maseaaao:checklist:v1";
const FAVICON_HREF = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="54">✅</text>
</svg>
`)}`;

async function main() {
  const markdown = await fs.readFile(SOURCE_FILE, "utf8");
  const document = renderMarkdown(markdown);
  const html = renderPage(document);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_FILE, html);

  console.log(
    `[ok] ${path.relative(REPO_ROOT, SOURCE_FILE)} -> ${path.relative(REPO_ROOT, OUTPUT_FILE)}`
  );
  console.log(`[ok] ${document.itemTotal} checklist item(s)`);
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  const headingIds = new Map();
  const checkIds = new Map();
  const sectionStack = [];
  let title = "Стрим-чеклист";
  let itemTotal = 0;
  let isListOpen = false;
  let isCodeOpen = false;
  let codeLines = [];

  const closeChecklist = () => {
    if (!isListOpen) {
      return;
    }

    html.push("</div>");
    isListOpen = false;
  };

  const closeCodeBlock = () => {
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    codeLines = [];
    isCodeOpen = false;
  };

  for (const rawLine of lines) {
    const trimmedLine = rawLine.trim();

    if (trimmedLine.startsWith("```")) {
      if (isCodeOpen) {
        closeCodeBlock();
      } else {
        closeChecklist();
        isCodeOpen = true;
        codeLines = [];
      }

      continue;
    }

    if (isCodeOpen) {
      codeLines.push(rawLine);
      continue;
    }

    if (trimmedLine === "") {
      closeChecklist();
      continue;
    }

    const headingText = readItalicHeading(trimmedLine);
    if (headingText) {
      closeChecklist();

      const level = readHeadingLevel(headingText);
      sectionStack[level - 1] = headingText;
      sectionStack.length = level;

      if (level === 1) {
        title = headingText.replace(/^✅\s*/, "").replace(/\s*✅$/, "").trim();
        continue;
      }

      const id = uniqueId(slugify(headingText), headingIds);
      html.push(
        `<h${level} id="${id}"><a href="#${id}">${renderInline(headingText)}</a></h${level}>`
      );
      continue;
    }

    const checklistItem = rawLine.match(/^\s*-\s+\[([ xX])\]\s+(.*)$/);
    if (checklistItem) {
      const text = checklistItem[2].trim();
      const defaultChecked = checklistItem[1].toLowerCase() === "x";
      const checkId = uniqueId(
        `check-${stableHash(`${sectionStack.join(" / ")} :: ${text}`)}`,
        checkIds
      );
      const inputId = `input-${checkId}`;

      if (!isListOpen) {
        html.push('<div class="checklist">');
        isListOpen = true;
      }

      itemTotal += 1;
      html.push(
        [
          `<div class="check-item">`,
          `<input id="${inputId}" type="checkbox" data-check-id="${checkId}"${
            defaultChecked ? ' data-default-checked="true" checked' : ""
          } />`,
          `<label for="${inputId}">${renderInline(text)}</label>`,
          `</div>`,
        ].join("")
      );
      continue;
    }

    closeChecklist();
    html.push(`<p>${renderInline(trimmedLine)}</p>`);
  }

  if (isCodeOpen) {
    closeCodeBlock();
  }

  closeChecklist();

  return {
    content: html.join("\n"),
    itemTotal,
    title,
  };
}

function readItalicHeading(line) {
  const match = line.match(/^\*(.+)\*$/);
  return match?.[1]?.trim() ?? null;
}

function readHeadingLevel(text) {
  if (text.includes("СТРИМ-ЧЕКЛИСТ")) {
    return 1;
  }

  if (/^\d+️⃣\.\d+️⃣/.test(text)) {
    return 3;
  }

  if (/^\d+️⃣\.\s/.test(text)) {
    return 2;
  }

  return 4;
}

function renderInline(text) {
  const tokenPattern = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let cursor = 0;
  let html = "";

  for (const match of text.matchAll(tokenPattern)) {
    html += escapeHtml(text.slice(cursor, match.index));

    if (match[1] !== undefined) {
      html += `<code>${escapeHtml(match[1])}</code>`;
    } else {
      const label = renderInline(match[2]);
      const href = sanitizeHref(match[3]);
      const target = /^https?:\/\//i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : "";
      html += `<a href="${escapeAttribute(href)}"${target}>${label}</a>`;
    }

    cursor = match.index + match[0].length;
  }

  html += escapeHtml(text.slice(cursor));
  return html;
}

function sanitizeHref(href) {
  const trimmedHref = href.trim();

  if (/^(https?:|mailto:|tel:)/i.test(trimmedHref)) {
    return trimmedHref;
  }

  if (/^(#|\/|\.\/|\.\.\/)/.test(trimmedHref)) {
    return trimmedHref;
  }

  return "#";
}

function renderPage({ content, itemTotal, title }) {
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <link rel="icon" href="${escapeAttribute(FAVICON_HREF)}" type="image/svg+xml" />
    <title>${escapeHtml(title)} — maseaaao</title>
    <style>
      :root {
        --bg: #f5f7f6;
        --surface: #ffffff;
        --surface-muted: #eef3f0;
        --text: #1b211f;
        --muted: #60706a;
        --line: #d9e2de;
        --line-strong: #bdccc6;
        --accent: #16765a;
        --accent-dark: #0f5943;
        --danger: #a84630;
        --progress: 0%;
        --shadow: 0 18px 44px rgba(18, 36, 30, 0.1);
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      html {
        color-scheme: light;
        scroll-behavior: smooth;
      }

      body {
        min-height: 100vh;
        margin: 0;
        color: var(--text);
        background:
          linear-gradient(90deg, rgba(22, 118, 90, 0.06) 1px, transparent 1px),
          linear-gradient(rgba(22, 118, 90, 0.05) 1px, transparent 1px),
          var(--bg);
        background-size: 32px 32px;
      }

      a {
        color: var(--accent-dark);
        text-decoration-thickness: 1px;
        text-underline-offset: 3px;
      }

      .app {
        width: min(100%, 1120px);
        margin: 0 auto;
        padding: 18px clamp(14px, 3vw, 32px) 56px;
      }

      .topbar {
        position: sticky;
        top: 0;
        z-index: 5;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 18px;
        align-items: center;
        padding: 16px 0;
        background: rgba(245, 247, 246, 0.9);
        border-bottom: 1px solid rgba(217, 226, 222, 0.82);
        backdrop-filter: blur(18px);
      }

      .title {
        min-width: 0;
      }

      h1 {
        margin: 0;
        color: var(--text);
        font-size: clamp(1.45rem, 3vw, 2.4rem);
        line-height: 1.05;
        letter-spacing: 0;
      }

      .meta {
        margin: 5px 0 0;
        color: var(--muted);
        font-size: 0.92rem;
      }

      .controls {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
      }

      .progress-pill {
        min-width: 128px;
        padding: 9px 12px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--surface);
        box-shadow: var(--shadow);
        text-align: right;
      }

      .progress-pill span {
        display: block;
        color: var(--muted);
        font-size: 0.74rem;
        font-weight: 700;
        line-height: 1.15;
        text-transform: uppercase;
      }

      .progress-pill strong {
        display: block;
        margin-top: 2px;
        font-size: 1rem;
        line-height: 1.2;
      }

      button {
        min-height: 44px;
        padding: 0 16px;
        border: 1px solid rgba(168, 70, 48, 0.34);
        border-radius: 8px;
        color: var(--danger);
        background: #fff;
        font: inherit;
        font-weight: 750;
        cursor: pointer;
        box-shadow: var(--shadow);
      }

      button:hover:not(:disabled),
      button:focus-visible {
        border-color: rgba(168, 70, 48, 0.62);
        background: #fff7f5;
      }

      button:focus-visible {
        outline: 3px solid rgba(22, 118, 90, 0.24);
        outline-offset: 2px;
      }

      button:disabled {
        cursor: default;
        opacity: 0.45;
      }

      .progress-track {
        height: 8px;
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: var(--surface);
      }

      .progress-track span {
        display: block;
        width: var(--progress);
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--accent), #55a07d);
        transition: width 180ms ease;
      }

      .content {
        margin-top: 24px;
        padding: clamp(18px, 3vw, 34px);
        border: 1px solid var(--line);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.9);
        box-shadow: var(--shadow);
      }

      h2,
      h3,
      h4,
      p,
      pre {
        margin: 0;
      }

      h2 {
        margin-top: 34px;
        padding-top: 28px;
        border-top: 2px solid var(--line-strong);
        font-size: clamp(1.3rem, 2vw, 1.75rem);
        line-height: 1.2;
      }

      h2:first-child {
        margin-top: 0;
        padding-top: 0;
        border-top: 0;
      }

      h3 {
        margin-top: 28px;
        padding-top: 18px;
        border-top: 1px solid var(--line);
        color: #24312d;
        font-size: clamp(1.06rem, 1.6vw, 1.28rem);
        line-height: 1.25;
      }

      h4 {
        margin-top: 22px;
        color: var(--accent-dark);
        font-size: 0.8rem;
        letter-spacing: 0.08em;
        line-height: 1.35;
        text-transform: uppercase;
      }

      h2 a,
      h3 a,
      h4 a {
        color: inherit;
        text-decoration: none;
      }

      p {
        margin-top: 14px;
        color: #33413c;
        line-height: 1.6;
      }

      code {
        padding: 0.08em 0.34em;
        border: 1px solid var(--line);
        border-radius: 6px;
        color: #24463b;
        background: var(--surface-muted);
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-size: 0.92em;
      }

      pre {
        margin-top: 14px;
        overflow-x: auto;
        padding: 14px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #16201d;
        color: #ecf7f2;
      }

      pre code {
        padding: 0;
        border: 0;
        color: inherit;
        background: transparent;
      }

      .checklist {
        margin-top: 10px;
        border-top: 1px solid var(--line);
      }

      .check-item {
        display: grid;
        grid-template-columns: 24px minmax(0, 1fr);
        gap: 12px;
        align-items: start;
        min-height: 46px;
        padding: 11px 0;
        border-bottom: 1px solid var(--line);
      }

      .check-item input {
        width: 22px;
        height: 22px;
        margin: 0;
        appearance: none;
        -webkit-appearance: none;
        border: 2px solid #9eb1aa;
        border-radius: 6px;
        background: #fff;
        cursor: pointer;
      }

      .check-item input:checked {
        border-color: var(--accent);
        background-color: #e4f4ed;
        background-image: url("data:image/svg+xml,%3Csvg width='18' height='18' viewBox='0 0 18 18' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 9.25L7.3 12.5L14 5.75' stroke='%2316765a' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
        background-position: center;
        background-repeat: no-repeat;
        background-size: 18px 18px;
      }

      .check-item input:focus-visible {
        outline: 3px solid rgba(22, 118, 90, 0.24);
        outline-offset: 2px;
      }

      .check-item label {
        min-width: 0;
        color: #25302d;
        font-size: 1rem;
        line-height: 1.45;
        cursor: pointer;
      }

      .check-item input:checked + label {
        color: var(--muted);
        text-decoration: line-through;
        text-decoration-color: rgba(22, 118, 90, 0.45);
      }

      @media (max-width: 720px) {
        .topbar {
          grid-template-columns: 1fr;
          gap: 12px;
        }

        .controls {
          justify-content: stretch;
        }

        .progress-pill {
          flex: 1;
          text-align: left;
        }

        button {
          flex: 0 0 auto;
        }

        .content {
          padding: 16px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          scroll-behavior: auto !important;
          transition-duration: 0.01ms !important;
        }
      }
    </style>
  </head>
  <body>
    <main class="app">
      <header class="topbar">
        <div class="title">
          <h1>${escapeHtml(title)}</h1>
          <p class="meta"><span data-completed-count>0</span>/${itemTotal} отмечено</p>
        </div>

        <div class="controls">
          <div class="progress-pill" aria-live="polite">
            <span>Прогресс</span>
            <strong data-progress-percent>0%</strong>
          </div>
          <button type="button" data-reset>Сброс</button>
        </div>
      </header>

      <div class="progress-track" aria-hidden="true"><span data-progress-bar></span></div>

      <article class="content">
${indent(content, 8)}
      </article>
    </main>

    <script>
      (() => {
        const storageKey = ${JSON.stringify(STORAGE_KEY)};
        const inputs = Array.from(document.querySelectorAll("[data-check-id]"));
        const completedCount = document.querySelector("[data-completed-count]");
        const progressPercent = document.querySelector("[data-progress-percent]");
        const resetButton = document.querySelector("[data-reset]");
        const total = inputs.length;

        function readState() {
          try {
            const rawState = localStorage.getItem(storageKey);
            if (!rawState) {
              return null;
            }

            const state = JSON.parse(rawState);
            return state && typeof state.checked === "object" ? state.checked : null;
          } catch {
            return null;
          }
        }

        function writeState() {
          const checked = {};

          for (const input of inputs) {
            if (input.checked) {
              checked[input.dataset.checkId] = true;
            }
          }

          try {
            localStorage.setItem(
              storageKey,
              JSON.stringify({
                checked,
                updatedAt: new Date().toISOString(),
              })
            );
          } catch {
            // The checklist still works for the current page view when storage is unavailable.
          }
        }

        function updateProgress() {
          const done = inputs.filter((input) => input.checked).length;
          const percent = total === 0 ? 0 : Math.round((done / total) * 100);

          document.documentElement.style.setProperty("--progress", percent + "%");
          completedCount.textContent = String(done);
          progressPercent.textContent = percent + "%";
          resetButton.disabled = done === 0;
        }

        const savedState = readState();

        for (const input of inputs) {
          input.checked = savedState
            ? Boolean(savedState[input.dataset.checkId])
            : input.hasAttribute("data-default-checked");

          input.addEventListener("change", () => {
            writeState();
            updateProgress();
          });
        }

        resetButton.addEventListener("click", () => {
          for (const input of inputs) {
            input.checked = false;
          }

          try {
            localStorage.removeItem(storageKey);
          } catch {
            // Nothing to reset in persistent storage.
          }

          updateProgress();
        });

        updateProgress();
      })();
    </script>
  </body>
</html>
`;
}

function indent(value, spaces) {
  const padding = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line) => (line ? `${padding}${line}` : line))
    .join("\n");
}

function slugify(text) {
  const slug = text
    .toLowerCase()
    .replace(/✅/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `section-${stableHash(text)}`;
}

function uniqueId(baseId, seenIds) {
  const seen = seenIds.get(baseId) ?? 0;
  seenIds.set(baseId, seen + 1);
  return seen === 0 ? baseId : `${baseId}-${seen + 1}`;
}

function stableHash(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    if (character === "&") {
      return "&amp;";
    }

    if (character === "<") {
      return "&lt;";
    }

    if (character === ">") {
      return "&gt;";
    }

    if (character === '"') {
      return "&quot;";
    }

    return "&#39;";
  });
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

await main().catch((error) => {
  console.error(error?.message ?? "Docs render failed.");
  process.exitCode = 1;
});

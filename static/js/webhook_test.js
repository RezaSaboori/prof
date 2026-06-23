// static/js/webhook_test.js
// Webhook test button — handles loading, retry feedback, error states.

(function () {
  "use strict";

  // ── State ──────────────────────────────────────────────────────────────────
  const RESET_DELAY_MS = 5000;
  let resetTimer = null;

  // ── Init ───────────────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", function () {
    const btn = document.getElementById("webhookTestBtn");
    if (!btn) return;

    btn.addEventListener("click", handleClick);
  });

  // ── Handler ────────────────────────────────────────────────────────────────
  function handleClick() {
    const btn = document.getElementById("webhookTestBtn");
    const output = document.getElementById("webhookTestOutput");
    if (!btn || btn.disabled) return;

    clearTimeout(resetTimer);
    setLoading(btn, output);

    fetch(btn.dataset.url, {
      method: "POST",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "Accept": "application/json",
      },
      credentials: "same-origin",
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { httpOk: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.data.success) {
          setSuccess(btn, output, result.data);
        } else {
          setError(btn, output, result.data);
        }
      })
      .catch(function (err) {
        setNetworkError(btn, output, err);
      })
      .finally(function () {
        btn.disabled = false;
        resetTimer = setTimeout(function () {
          resetUI(btn, output);
        }, RESET_DELAY_MS);
      });
  }

  // ── UI States ──────────────────────────────────────────────────────────────

  function setLoading(btn, output) {
    btn.disabled = true;
    btn.dataset.originalLabel = btn.dataset.originalLabel || btn.textContent.trim();
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML =
      '<span class="webhook-spinner" aria-hidden="true"></span> Sending&hellip;';
    output.hidden = true;
    output.className = "webhook-test-output";
    output.textContent = "";
  }

  function setSuccess(btn, output, data) {
    const responseText =
      typeof data.response === "object"
        ? JSON.stringify(data.response, null, 2)
        : String(data.response ?? "");

    btn.setAttribute("aria-busy", "false");
    btn.innerHTML =
      '<span class="webhook-icon webhook-icon--success" aria-hidden="true">✓</span> ' +
      escapeHtml(btn.dataset.originalLabel);

    btn.classList.add("btn-webhook-success");

    output.className = "webhook-test-output webhook-output-success";
    output.innerHTML =
      '<span class="webhook-output-meta">' +
      "Attempts: " + escapeHtml(String(data.attempts)) +
      " &nbsp;·&nbsp; " +
      data.duration_ms + "ms" +
      "</span>" +
      '<pre class="webhook-output-body">' + escapeHtml(responseText) + "</pre>";
    output.hidden = false;
  }

  function setError(btn, output, data) {
    btn.setAttribute("aria-busy", "false");
    btn.innerHTML =
      '<span class="webhook-icon webhook-icon--error" aria-hidden="true">✗</span> ' +
      escapeHtml(btn.dataset.originalLabel);
    btn.classList.add("btn-webhook-error");

    output.className = "webhook-test-output webhook-output-error";
    output.innerHTML =
      '<span class="webhook-output-meta">' +
      "Attempts: " + escapeHtml(String(data.attempts ?? "–")) +
      " &nbsp;·&nbsp; " +
      (data.duration_ms ?? "–") + "ms" +
      " &nbsp;·&nbsp; HTTP " + (data.status_code || "–") +
      "</span>" +
      '<pre class="webhook-output-body">' +
      escapeHtml(data.error || "Unknown error") +
      "</pre>";
    output.hidden = false;
  }

  function setNetworkError(btn, output, err) {
    btn.setAttribute("aria-busy", "false");
    btn.innerHTML =
      '<span class="webhook-icon webhook-icon--error" aria-hidden="true">✗</span> ' +
      escapeHtml(btn.dataset.originalLabel);
    btn.classList.add("btn-webhook-error");

    output.className = "webhook-test-output webhook-output-error";
    output.innerHTML =
      '<span class="webhook-output-meta">Network error</span>' +
      '<pre class="webhook-output-body">' + escapeHtml(err.message) + "</pre>";
    output.hidden = false;
  }

  function resetUI(btn, output) {
    btn.disabled = false;
    btn.setAttribute("aria-busy", "false");
    btn.textContent = btn.dataset.originalLabel || "Test Btn";
    btn.className = "btn btn-webhook-test";
    output.hidden = true;
    output.className = "webhook-test-output";
    output.textContent = "";
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getCookie(name) {
    const match = document.cookie
      .split(";")
      .map(function (c) { return c.trim(); })
      .find(function (c) { return c.startsWith(name + "="); });
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
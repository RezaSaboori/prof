// static/js/webhook_test.js

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    const btn = document.getElementById("webhookTestBtn");
    if (!btn) return;

    const output = document.getElementById("webhookTestOutput");
    const originalLabel = btn.textContent;

    btn.addEventListener("click", function () {
      const url = btn.dataset.url;

      btn.disabled = true;
      btn.textContent = "Sending…";
      output.hidden = true;
      output.textContent = "";
      output.className = "webhook-test-output";

      fetch(url, {
        method: "POST",
        headers: {
          "X-CSRFToken": getCookie("csrftoken"),
          "Accept": "application/json",
        },
        credentials: "same-origin",
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          const payload = result.data.response;
          const text =
            typeof payload === "object"
              ? JSON.stringify(payload, null, 2)
              : String(payload);

          btn.textContent = result.data.success ? "✓ " + text : "✗ " + text;
          btn.classList.add(result.data.success ? "btn-webhook-success" : "btn-webhook-error");
          output.textContent = text;
          output.classList.add(result.data.success ? "webhook-success" : "webhook-error");
          output.hidden = false;
        })
        .catch(function (err) {
          btn.textContent = "✗ Network error";
          btn.classList.add("btn-webhook-error");
          output.textContent = "Network error: " + err.message;
          output.classList.add("webhook-error");
          output.hidden = false;
        })
        .finally(function () {
          btn.disabled = false;
          // Reset label after 4 seconds
          setTimeout(function () {
            btn.textContent = originalLabel;
            btn.className = "btn btn-webhook-test";
          }, 4000);
        });
    });

    function getCookie(name) {
      let cookieValue = null;
      if (document.cookie && document.cookie !== "") {
        document.cookie.split(";").forEach(function (cookie) {
          const c = cookie.trim();
          if (c.startsWith(name + "=")) {
            cookieValue = decodeURIComponent(c.slice(name.length + 1));
          }
        });
      }
      return cookieValue;
    }
  });
})();
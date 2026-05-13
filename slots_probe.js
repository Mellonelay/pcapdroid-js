// @name Slot RNG Passive Telemetry Probe
// @description Passive WebView probe for slot game traffic, spin events, jackpot text, storage, fetch, XHR, and WebSocket observation only
// @author Mellonelay
// @version 2.0
// @match *://*/*

(function () {
  "use strict";

  const TAG = "[MELLONELAY_SLOT_PROBE_V2]";
  const MAX_BODY = 4000;
  const MAX_TEXT = 1200;

  const KEYWORDS = [
    "spin", "bet", "win", "credit", "balance", "jackpot", "grand", "major",
    "minor", "mini", "orb", "scatter", "bonus", "free", "hold", "reel",
    "result", "reward", "pay", "payout", "game", "slot", "rng"
  ];

  function now() {
    return new Date().toISOString();
  }

  function safeString(value, max = MAX_BODY) {
    try {
      if (value === undefined) return "__undefined__";
      if (value === null) return "__null__";
      if (typeof value === "string") return value.slice(0, max);
      if (value instanceof ArrayBuffer) return "[ArrayBuffer byteLength=" + value.byteLength + "]";
      if (ArrayBuffer.isView(value)) return "[TypedArray byteLength=" + value.byteLength + "]";
      return JSON.stringify(value).slice(0, max);
    } catch (e) {
      try {
        return String(value).slice(0, max);
      } catch (_) {
        return "__unserializable__";
      }
    }
  }

  function keywordHit(text) {
    const s = safeString(text, MAX_BODY).toLowerCase();
    return KEYWORDS.some(k => s.includes(k));
  }

  function log(type, data) {
    const event = {
      tag: TAG,
      type,
      ts: now(),
      href: location.href,
      title: document.title || "",
      data
    };
    try {
      console.log(TAG, JSON.stringify(event));
    } catch (e) {
      console.log(TAG, type, data);
    }
  }

  function visibleTextSnapshot(reason) {
    try {
      const text = (document.body && document.body.innerText)
        ? document.body.innerText.replace(/\s+/g, " ").slice(0, MAX_TEXT)
        : "";
      if (text && keywordHit(text)) {
        log("visible_text_snapshot", { reason, text });
      }
    } catch (e) {
      log("visible_text_snapshot_error", safeString(e));
    }
  }

  log("probe_loaded", {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    url: location.href
  });

  try {
    log("storage_keys", {
      localStorage: Object.keys(window.localStorage || {}),
      sessionStorage: Object.keys(window.sessionStorage || {})
    });
  } catch (e) {
    log("storage_keys_error", safeString(e));
  }

  try {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (keywordHit(key) || keywordHit(value)) {
        log("storage_set", {
          key: safeString(key),
          value: safeString(value)
        });
      }
      return originalSetItem.apply(this, arguments);
    };
  } catch (e) {
    log("storage_hook_error", safeString(e));
  }

  try {
    const originalFetch = window.fetch;
    if (originalFetch) {
      window.fetch = async function (...args) {
        const started = performance.now();
        const req = {
          input: safeString(args[0]),
          init: safeString(args[1])
        };

        if (keywordHit(req.input) || keywordHit(req.init)) {
          log("fetch_request_keyword", req);
        } else {
          log("fetch_request", req);
        }

        try {
          const res = await originalFetch.apply(this, args);
          const elapsed_ms = Math.round(performance.now() - started);

          try {
            const clone = res.clone();
            clone.text().then(body => {
              const payload = {
                url: res.url,
                status: res.status,
                elapsed_ms,
                body: safeString(body)
              };
              if (keywordHit(body) || keywordHit(res.url)) {
                log("fetch_response_keyword", payload);
              } else {
                log("fetch_response", {
                  url: res.url,
                  status: res.status,
                  elapsed_ms,
                  body_length: body.length
                });
              }
            }).catch(e => {
              log("fetch_response_read_error", safeString(e));
            });
          } catch (e) {
            log("fetch_clone_error", safeString(e));
          }

          return res;
        } catch (e) {
          log("fetch_error", {
            request: req,
            error: safeString(e)
          });
          throw e;
        }
      };
    }
  } catch (e) {
    log("fetch_hook_error", safeString(e));
  }

  try {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
      this.__mellonelay_probe = {
        method,
        url: safeString(url),
        started: 0
      };
      log("xhr_open", {
        method,
        url: safeString(url)
      });
      return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
      const meta = this.__mellonelay_probe || {};
      meta.started = performance.now();

      const requestPayload = {
        method: meta.method,
        url: meta.url,
        body: safeString(body)
      };

      if (keywordHit(requestPayload.url) || keywordHit(requestPayload.body)) {
        log("xhr_send_keyword", requestPayload);
      } else {
        log("xhr_send", {
          method: meta.method,
          url: meta.url,
          body_length: safeString(body).length
        });
      }

      this.addEventListener("load", function () {
        const elapsed_ms = Math.round(performance.now() - (meta.started || performance.now()));
        const responseText = safeString(this.responseText);

        const responsePayload = {
          method: meta.method,
          url: meta.url,
          status: this.status,
          elapsed_ms,
          response: responseText
        };

        if (keywordHit(meta.url) || keywordHit(responseText)) {
          log("xhr_response_keyword", responsePayload);
        } else {
          log("xhr_response", {
            method: meta.method,
            url: meta.url,
            status: this.status,
            elapsed_ms,
            response_length: responseText.length
          });
        }
      });

      this.addEventListener("error", function () {
        log("xhr_error", {
          method: meta.method,
          url: meta.url
        });
      });

      return originalSend.apply(this, arguments);
    };
  } catch (e) {
    log("xhr_hook_error", safeString(e));
  }

  try {
    const OriginalWebSocket = window.WebSocket;
    if (OriginalWebSocket) {
      window.WebSocket = function (url, protocols) {
        log("ws_connect", {
          url: safeString(url),
          protocols: safeString(protocols)
        });

        const ws = protocols
          ? new OriginalWebSocket(url, protocols)
          : new OriginalWebSocket(url);

        const originalSend = ws.send;
        ws.send = function (data) {
          const payload = safeString(data);
          if (keywordHit(payload)) {
            log("ws_send_keyword", payload);
          } else {
            log("ws_send", {
              byte_hint: payload.length,
              preview: payload.slice(0, 500)
            });
          }
          return originalSend.apply(ws, arguments);
        };

        ws.addEventListener("message", function (event) {
          const payload = safeString(event.data);
          if (keywordHit(payload)) {
            log("ws_message_keyword", payload);
          } else {
            log("ws_message", {
              byte_hint: payload.length,
              preview: payload.slice(0, 500)
            });
          }
        });

        ws.addEventListener("open", function () {
          log("ws_open", safeString(url));
        });

        ws.addEventListener("close", function (event) {
          log("ws_close", {
            url: safeString(url),
            code: event.code,
            reason: safeString(event.reason)
          });
        });

        ws.addEventListener("error", function (event) {
          log("ws_error", {
            url: safeString(url),
            event: safeString(event)
          });
        });

        return ws;
      };

      window.WebSocket.prototype = OriginalWebSocket.prototype;
      Object.setPrototypeOf(window.WebSocket, OriginalWebSocket);
    }
  } catch (e) {
    log("websocket_hook_error", safeString(e));
  }

  try {
    document.addEventListener("click", function (event) {
      const el = event.target;
      const text = safeString(
        (el && (el.innerText || el.textContent || el.value || el.alt || el.title)) || "",
        500
      );

      const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;

      log("ui_click", {
        text,
        tagName: el && el.tagName,
        id: el && el.id,
        className: el && safeString(el.className, 300),
        x: event.clientX,
        y: event.clientY,
        rect: rect ? {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        } : null
      });

      if (keywordHit(text)) {
        visibleTextSnapshot("keyword_click");
      }
    }, true);
  } catch (e) {
    log("click_hook_error", safeString(e));
  }

  try {
    const observer = new MutationObserver(function () {
      const txt = document.body && document.body.innerText
        ? document.body.innerText.toLowerCase()
        : "";

      if (keywordHit(txt)) {
        visibleTextSnapshot("dom_mutation_keyword");
      }
    });

    if (document.documentElement) {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
      });
      log("mutation_observer_started", true);
    }
  } catch (e) {
    log("mutation_observer_error", safeString(e));
  }

  setInterval(function () {
    visibleTextSnapshot("interval_10s");
  }, 10000);

  log("probe_ready", {
    note: "Passive capture only. If no logs appear in 139slots, the game is native/custom TCP and JS injector cannot observe RNG."
  });
})();

// Content scripts cannot read page-world fetch bodies. This hook runs in the page
// and forwards Crunchyroll CMS JSON, which is more stable than CSS class names.
(() => {
  if (window.__crCornerHook) return;
  window.__crCornerHook = true;

  const SOURCE = "cr-corner-hook";

  function shouldCapture(url) {
    return typeof url === "string" && (/\/cms\/objects\//.test(url) || /\/cms\/series\/[^/]+\/seasons/.test(url));
  }

  function post(kind, extra) {
    window.postMessage({ source: SOURCE, kind, page: location.href, ...extra }, "*");
  }

  let lastToken = "";

  function postAuth(token) {
    if (!token || token === lastToken || token.length < 20 || /\s/.test(token)) return;
    lastToken = token;
    post("auth", { token });
  }

  function bearerFrom(headers) {
    try {
      const value = new Headers(headers || undefined).get("authorization") || "";
      const match = /^Bearer\s+(\S+)/i.exec(value);
      return match ? match[1] : "";
    } catch {
      return "";
    }
  }

  function notifyNav() {
    post("nav");
  }

  const originalPush = history.pushState;
  history.pushState = function pushState(...args) {
    const result = originalPush.apply(this, args);
    notifyNav();
    return result;
  };
  const originalReplace = history.replaceState;
  history.replaceState = function replaceState(...args) {
    const result = originalReplace.apply(this, args);
    notifyNav();
    return result;
  };
  window.addEventListener("popstate", notifyNav);

  const originalFetch = window.fetch;
  window.fetch = async function patchedFetch(...args) {
    try {
      const input = args[0];
      const init = args[1] || {};
      const url = typeof input === "string" ? input : input?.url || "";
      if (/crunchyroll\.com/i.test(String(url))) postAuth(bearerFrom(init.headers) || bearerFrom(input?.headers));
    } catch {
      // The page request still has to go out.
    }
    const response = await originalFetch.apply(this, args);
    try {
      const url = response.url || "";
      if (shouldCapture(url)) {
        response.clone().text().then((body) => {
          try {
            post("cms", { url, data: JSON.parse(body) });
          } catch {
            // Not JSON.
          }
        }).catch(() => {});
      }
    } catch {
      // Leave the page response untouched.
    }
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function setRequestHeader(name, value) {
    try {
      if (/^authorization$/i.test(String(name))) {
        const match = /^Bearer\s+(\S+)/i.exec(String(value || ""));
        if (match) this.__crCornerToken = match[1];
      }
    } catch {
      // Keep the original header call intact.
    }
    return originalSetHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.open = function open(method, url, ...rest) {
    this.__crCornerUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function send(...args) {
    try {
      const url = String(this.__crCornerUrl || "");
      if (/crunchyroll\.com/i.test(url)) postAuth(this.__crCornerToken || "");
    } catch {
      // The page request still has to go out.
    }
    this.addEventListener("load", function onLoad() {
      const url = String(this.responseURL || this.__crCornerUrl || "");
      if (!shouldCapture(url)) return;
      let data = this.response;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      } else if (data == null && this.responseText) {
        try {
          data = JSON.parse(this.responseText);
        } catch {
          return;
        }
      }
      if (!data || typeof data !== "object") return;
      post("cms", { url, data });
    });
    return originalSend.apply(this, args);
  };
})();

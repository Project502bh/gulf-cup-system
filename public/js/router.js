const routes = [];
let notFoundHandler = () => {};

export function route(pattern, handler) {
  const parts = pattern.split('/').filter(Boolean);
  routes.push({ parts, handler });
}

export function setNotFound(handler) {
  notFoundHandler = handler;
}

export function navigate(path) {
  window.location.hash = path;
}

function parseHash() {
  let hash = window.location.hash.replace(/^#/, '') || '/dashboard';
  const [pathPart, queryPart] = hash.split('?');
  const query = {};
  if (queryPart) {
    for (const pair of queryPart.split('&')) {
      const [k, v] = pair.split('=');
      if (k) query[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }
  }
  return { pathParts: pathPart.split('/').filter(Boolean), query };
}

function matchRoute(pathParts) {
  for (const r of routes) {
    if (r.parts.length !== pathParts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < r.parts.length; i++) {
      const rp = r.parts[i];
      if (rp.startsWith(':')) params[rp.slice(1)] = pathParts[i];
      else if (rp !== pathParts[i]) { ok = false; break; }
    }
    if (ok) return { handler: r.handler, params };
  }
  return null;
}

export function currentPath() {
  return window.location.hash.replace(/^#/, '') || '/dashboard';
}

export function startRouter() {
  const dispatch = () => {
    const { pathParts, query } = parseHash();
    const match = matchRoute(pathParts);
    if (match) match.handler(match.params, query);
    else notFoundHandler();
  };
  window.addEventListener('hashchange', dispatch);
  dispatch();
}

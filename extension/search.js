export const ACTIONS = [
  { id: 'bookmarks', kind: 'action', title: 'Search BookMark', detail: 'Explore bookmark folders and items' },
  { id: 'history', kind: 'action', title: 'Search history', detail: 'Find visited pages by title or URL' },
  { id: 'pin', kind: 'action', title: 'Pin tab', detail: 'Pin or unpin the current tab' },
  { id: 'save', kind: 'action', title: 'Bookmark', detail: 'Save the current tab to a bookmark folder' },
  { id: 'mute', kind: 'action', title: 'Mute tab', detail: 'Mute or unmute the current tab' },
  { id: 'duplicate', kind: 'action', title: 'Duplicate current tab', detail: 'Create and switch to a copy of the current tab' },
  { id: 'close-others', kind: 'action', title: 'Close other tabs', detail: 'Keep the current tab and close all other tabs in this window' },
  { id: 'update', kind: 'action', title: 'Update', detail: 'Reload Chaos Control to apply the latest local changes' },
];

export const HISTORY_LIMIT = 11;
export const HISTORY_FETCH = 100;
export const FUZZY_RUN = 3;

export const URL_SCHEMES = ['https:', 'http:', 'file:', 'ftp:', 'chrome:', 'chrome-extension:', 'about:'];

export function normalize(value = '') {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();
}

export function urlKey(value = '') {
  try {
    return new URL(value).href;
  } catch {
    return value;
  }
}

export function flattenBookmarks(tree, ancestors = []) {
  return tree.flatMap(node => {
    const path = ancestors.map(parent => parent.title).filter(Boolean).join(' / ');
    const item = {
      id: `bookmark:${node.id}`,
      bookmarkId: node.id,
      title: node.title || node.url || 'Untitled folder',
      url: node.url,
      kind: node.url ? 'bookmark' : 'folder',
      path,
      ancestorIds: ancestors.map(parent => parent.id),
      parentId: node.parentId,
    };
    return [
      ...(node.id === '0' ? [] : [item]),
      ...flattenBookmarks(node.children || [], [...ancestors, node]),
    ];
  });
}

export function tabItems(tabs, launcherUrl) {
  return tabs.filter(tab => tab.id >= 0 && !(tab.url || tab.pendingUrl || '').startsWith(launcherUrl)).map(tab => ({
    id: `tab:${tab.id}`,
    tabId: tab.id,
    title: tab.title || tab.url || tab.pendingUrl || 'Untitled tab',
    url: tab.url || tab.pendingUrl || '',
    kind: tab.pinned ? 'pinned' : 'tab',
    lastAccessed: tab.lastAccessed || 0,
    windowId: tab.windowId,
  }));
}

export function googleSearchUrl(text = '') {
  return `https://www.google.com/search?q=${encodeURIComponent(text.trim())}`;
}

export function faviconUrl(base, pageUrl, size = 32) {
  if (!/^https?:\/\//i.test(pageUrl || '')) return null;
  const url = new URL(base);
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', String(size));
  return url.href;
}

export function historyItems(entries, launcherUrl) {
  return entries.filter(entry => entry.url && !entry.url.startsWith(launcherUrl)).map(entry => ({
    id: `history:${entry.url}`,
    title: entry.title || entry.url,
    url: entry.url,
    kind: 'history',
    lastAccessed: entry.lastVisitTime || 0,
    visits: entry.visitCount || 0,
  })).sort((a, b) => b.lastAccessed - a.lastAccessed);
}

const fields = new WeakMap();

function fieldsOf(item) {
  let value = fields.get(item);
  if (!value) {
    value = { title: normalize(item.title), url: normalize(item.url).replace(/^[a-z][a-z\d+.-]*:\/\/(www\.)?/, ''), path: normalize(item.path) };
    fields.set(item, value);
  }
  return value;
}

export function tokenize(query = '') {
  return normalize(query).split(/\s+/).filter(Boolean);
}

export function hostOf(value = '') {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function completionFor(query, item) {
  if (!query || /\s/.test(query) || !item?.url || item.fuzzy) return '';
  if (!['tab', 'pinned', 'history', 'url', 'bookmark'].includes(item.kind)) return '';
  let url;
  try {
    url = new URL(item.url);
  } catch {
    return '';
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
  const address = url.href.replace(/\/$/, '');
  const candidates = [address, address.replace(/^https?:\/\//, ''), address.replace(/^https?:\/\/(www\.)?/, '')];
  const match = candidates.find(value => value.toLowerCase().startsWith(query.toLowerCase()));
  return match ? match.slice(query.length) : '';
}

export function resultAction(item, openUrls = new Set()) {
  if (item.kind === 'action' && item.id === 'update') return { icon: 'update', label: 'Reload extension' };
  if (item.kind === 'action' && item.id === 'close-others') return { icon: 'close', label: 'Close other tabs' };
  if (item.kind === 'action' && item.id === 'duplicate') return { icon: 'duplicate', label: 'Duplicate current tab' };
  if (item.kind === 'action' && item.id === 'pin') return { icon: 'pin', label: 'Pin or unpin the current tab' };
  if (item.kind === 'action' && item.id === 'mute') return { icon: item.icon || 'volume-off', label: 'Mute or unmute the current tab' };
  if (item.kind === 'folder' || item.kind === 'action') return { icon: 'chevron', label: 'Choose action or folder' };
  if (item.kind === 'search') return { icon: 'search', label: 'Search the web' };
  if (item.tabId !== undefined || (item.url && openUrls.has(urlKey(item.url)))) {
    return { icon: 'switch', label: 'Switch to open tab' };
  }
  return { icon: 'open', label: 'Open URL in new tab' };
}

export function fuzzyErrors(token, text) {
  const width = FUZZY_RUN + 1;
  const last = token.length - 1;
  let now = new Array(token.length * width).fill(Infinity);
  let best = Infinity;
  for (const character of text) {
    now[0] = 0;
    const next = new Array(token.length * width).fill(Infinity);
    const set = (index, cost) => { if (cost < next[index]) next[index] = cost; };
    for (let i = 0; i < token.length; i++) {
      for (let run = 0; run < width; run++) {
        const cost = now[i * width + run];
        if (cost === Infinity) continue;
        if (character === token[i]) {
          if (i === last) best = Math.min(best, cost);
          else set((i + 1) * width, cost);
        }
        if (i > 0 && run < FUZZY_RUN) {
          set(i * width + run + 1, cost + 1);
          if (i < last) set((i + 1) * width + run + 1, cost + 1);
        }
      }
    }
    now = next;
  }
  return best;
}

function tokenScore(value, token) {
  if (value === token) return 0;
  if (value.startsWith(token)) return 1;
  if (value.includes(token)) return 2;
  return 5 + fuzzyErrors(token, value);
}

export function exactMatch(item, query) {
  const tokens = Array.isArray(query) ? query : tokenize(query);
  const { title, url, path } = fieldsOf(item);
  return tokens.every(token => title.includes(token) || url.includes(token) || path.includes(token));
}

export function matchScore(item, query) {
  const tokens = Array.isArray(query) ? query : tokenize(query);
  const { title, url, path } = fieldsOf(item);
  return tokens.reduce((score, token) => score + Math.min(
    tokenScore(title, token),
    tokenScore(url, token) + 2,
    tokenScore(path, token) + 3,
  ), 0);
}

export function searchItems({ tabs = [], bookmarks = [], history = [], query = '', mode = 'all', folderId = null, limit = 60 }) {
  const tokens = tokenize(mode === 'history' ? query.trim().replace(/^(?:[a-z][a-z\d+.-]*:\/\/)?(?:www\.)?/i, '') : query);
  const rank = (list, keepOrder = false) => list.map((item, index) => ({ item, index, score: matchScore(item, tokens) }))
    .filter(match => Number.isFinite(match.score))
    .sort((a, b) => a.score - b.score || (b.item.visits || 0) - (a.item.visits || 0) ||
      (b.item.lastAccessed || 0) - (a.item.lastAccessed || 0) || (keepOrder ? a.index - b.index : a.item.title.localeCompare(b.item.title)));
  if (mode === 'history') {
    const items = tokens.length ? rank(history.filter(item => exactMatch(item, tokens))).map(match => match.item) : history;
    return { items, total: items.length };
  }
  if (mode === 'all') {
    const matches = rank(tabs);
    if (!tokens.length) return { items: matches.map(match => match.item), total: matches.length };
    const exact = matches.filter(match => exactMatch(match.item, tokens)).map(match => match.item);
    const similar = matches.filter(match => !exactMatch(match.item, tokens)).map(match => ({ ...match.item, fuzzy: true }));
    const open = new Set(tabs.map(item => urlKey(item.url)).filter(Boolean));
    const suggested = rank(history.filter(item => !open.has(urlKey(item.url)) && exactMatch(item, tokens)))
      .slice(0, HISTORY_LIMIT).map(match => match.item);
    const items = [...exact, ...suggested, ...similar];
    return { items, total: items.length };
  }
  let candidates;
  if (mode === 'actions') candidates = ACTIONS;
  else if (mode === 'save') candidates = bookmarks.filter(item => item.kind === 'folder' && (folderId ? (tokens.length ? item.ancestorIds.includes(folderId) : item.parentId === folderId) : (tokens.length || item.ancestorIds.length === 1)));
  else candidates = bookmarks.filter(item => !folderId || (tokens.length ? item.ancestorIds.includes(folderId) : item.parentId === folderId));
  const matches = rank(candidates, mode === 'actions');
  return { items: matches.slice(0, limit).map(match => match.item), total: matches.length };
}

export function typedUrl(query = '') {
  const value = query.trim();
  if (!value || /\s/.test(value)) return null;
  const explicit = /^[a-z][a-z\d+.-]*:(?!\d)/i.test(value);
  const local = /^(localhost|\d{1,3}(\.\d{1,3}){3}|\[[\da-f:]+\])(:\d+)?([/?#]|$)/i.test(value);
  let url;
  try {
    url = new URL(explicit ? value : `${local ? 'http' : 'https'}://${value}`);
  } catch {
    return null;
  }
  if (!URL_SCHEMES.includes(url.protocol)) return null;
  if (!explicit && !local && !/[^.]\.[a-z]{2,}$/i.test(url.hostname)) return null;
  return url.href;
}

export function typedItems(query = '') {
  const text = query.trim();
  if (!text) return { url: null, search: null };
  const href = typedUrl(text);
  return {
    url: href && { id: 'typed:url', kind: 'url', title: text, detail: `Go to ${href}`, url: href },
    search: { id: 'typed:search', kind: 'search', title: text, detail: 'Search the web with your default search engine', query: text },
  };
}

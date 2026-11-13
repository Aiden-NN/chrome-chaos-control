import { completionFor, resultAction, urlKey, faviconUrl, flattenBookmarks, googleSearchUrl, historyItems, hostOf, searchItems, tabItems, typedItems, RECENT_FETCH, HISTORY_FETCH, HISTORY_LIMIT } from './search.js';
import { currentTab } from './navigation.js';

const $ = id => document.getElementById(id);
const input = $('query');
const view = new URLSearchParams(location.search).get('view');
const popup = view === 'popup';
const overlay = view === 'overlay';
document.body.classList.toggle('popup', popup);
document.body.classList.toggle('page', !popup && !overlay);
const state = { query: '', completion: '', autocomplete: false, composing: false, tabs: [], history: [], recent: [], bookmarks: [], current: null, shortcut: undefined, mode: 'all', folders: [], selected: 0, items: [], typed: {}, busy: false, loading: true, motion: null };
const labels = { tab: 'Open tabs', pinned: 'Pinned tabs', history: 'Suggested URLs', bookmark: 'Bookmarks', folder: 'Bookmarks', action: 'Actions', url: 'Go to', search: 'Web' };
const icons = { tab: 'tab', pinned: 'pin', history: 'history', bookmark: 'bookmark', folder: 'folder', url: 'globe', search: 'search' };
const actionIcons = { pin: 'pin', bookmarks: 'bookmark', history: 'history', save: 'bookmark', duplicate: 'duplicate', 'close-others': 'close', update: 'update', mute: 'volume-off', shortcut: 'keyboard' };
const tones = { tab: 'coral', pinned: 'gold', history: 'sky', bookmark: 'teal', folder: 'teal', url: 'violet', search: 'sky', action: 'coral' };
const actionTones = { pin: 'gold', bookmarks: 'teal', history: 'sky', save: 'teal' };
const faviconKinds = new Set(['tab', 'pinned', 'history', 'bookmark']);
const faviconBase = globalThis.chrome?.runtime?.getURL?.('/_favicon/');
const faviconState = new Map();
const needed = { all: ['tabs', 'history'], history: ['tabs', 'history'], actions: ['bookmarks'], bookmarks: ['bookmarks'], save: ['bookmarks'] };
const failures = { tabs: 'Tabs could not be loaded.', history: 'History could not be loaded.', bookmarks: 'Bookmarks could not be loaded.' };
const stale = new Set(Object.keys(failures));
const indicator = document.createElement('div');
indicator.className = 'indicator';
const rowLayout = new ResizeObserver(() => moveIndicator($('results').querySelector('[aria-selected="true"]')));
indicator.setAttribute('aria-hidden', 'true');
let launcherTabId;
const requests = Object.fromEntries(Object.keys(failures).map(name => [name, { generation: 0, pending: null, timer: null, error: '' }]));
let selectedItem = null;
let loaded = false;
let tabTitlesChanged = false;
const historyPaging = { limit: HISTORY_FETCH, hasMore: false, extending: false, order: null };

function dismiss() {
  if (overlay) parent.postMessage({ chaosControl: 'close' }, '*');
  else if (popup) window.close();
}

function notice(message, tone = 'warning') {
  $('notice').textContent = message;
  $('notice').dataset.tone = tone;
  $('notice').hidden = !message;
}

function withTabState(item) {
  if (item.kind !== 'action') return item;
  if (item.id === 'shortcut' && state.shortcut !== undefined) return { ...item, detail: state.shortcut ? `Currently ${state.shortcut} — change it in browser settings` : 'No shortcut set — choose one in browser settings' };
  if (!state.current) return item;
  const name = state.current.title || state.current.url;
  if (item.id === 'pin') return state.current.pinned ? { ...item, title: 'Unpin tab', detail: `Unpin “${name}”` } : { ...item, title: 'Pin tab', detail: `Pin “${name}”` };
  if (item.id === 'mute') return state.current.mutedInfo?.muted ? { ...item, title: 'Unmute tab', detail: `Unmute “${name}”`, icon: 'volume' } : { ...item, title: 'Mute tab', detail: `Mute “${name}”`, icon: 'volume-off' };
  return item;
}

function detailLines(item) {
  if (item.detail) return [{ text: item.detail }];
  if (item.kind === 'folder') return [{ text: item.path || 'Bookmark folder', wrap: !!item.path }];
  return [item.path && { text: item.path, wrap: true }, item.url && { text: item.url }].filter(Boolean);
}

function hasSearchQuery() {
  return (state.mode === 'all' || state.mode === 'history') && state.query.trim().length > 0;
}

function setQuery(value) {
  input.value = value;
  state.query = value;
  state.completion = '';
  state.autocomplete = false;
  selectedItem = null;
  refreshSearch();
}

function releaseCompletion() {
  if (!state.completion) return false;
  const intact = input.selectionStart === state.query.length && input.selectionEnd === input.value.length && input.value === state.query + state.completion;
  if (intact) input.value = state.query;
  else {
    state.query = input.value;
    selectedItem = null;
    refreshSearch();
  }
  state.completion = '';
  return !intact;
}

function suggest(item) {
  const query = state.query;
  const suffix = completionFor(query, item);
  if (!suffix || state.composing || document.activeElement !== input) return;
  const atEnd = input.value === query && input.selectionStart === query.length && input.selectionEnd === query.length;
  const selectedSuffix = input.value === query + state.completion && input.selectionStart === query.length && input.selectionEnd === input.value.length;
  if (!atEnd && !selectedSuffix) return;
  state.completion = suffix;
  input.value = query + state.completion;
  input.setSelectionRange(query.length, input.value.length);
}

function attachFavicon(symbol, src) {
  if (faviconState.get(src) === false) return;
  const image = new Image();
  image.alt = '';
  image.draggable = false;
  const show = () => {
    faviconState.set(src, true);
    symbol.classList.add('favicon');
    symbol.replaceChildren(image);
  };
  image.addEventListener('load', show, { once: true });
  image.addEventListener('error', () => faviconState.set(src, false), { once: true });
  image.src = src;
  if (faviconState.get(src) && image.complete) show();
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.append(use);
  return svg;
}

function replay(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function moveIndicator(row) {
  indicator.hidden = !row;
  if (!row) return;
  const item = state.items[state.selected];
  indicator.style.setProperty('--row-tone', `var(--${(item?.kind === 'action' && actionTones[item.id]) || tones[item?.kind] || 'coral'})`);
  indicator.style.transform = `translateY(${row.offsetTop}px)`;
  indicator.style.height = `${row.offsetHeight}px`;
  if (!indicator.classList.contains('ready')) requestAnimationFrame(() => indicator.classList.add('ready'));
}

function select(index, scroll = false, remember = false) {
  if (remember) selectedItem = state.items[index];
  state.selected = index;
  let selectedRow;
  for (const [position, element] of [...$('results').querySelectorAll('[role="option"]')].entries()) {
    element.setAttribute('aria-selected', String(position === index));
    if (position === index) selectedRow = element;
    if (position === index && scroll) element.scrollIntoView({ block: 'nearest' });
  }
  moveIndicator(selectedRow);
  if (state.items[index]) input.setAttribute('aria-activedescendant', `result-${index}`);
  else input.removeAttribute('aria-activedescendant');
}

function render(preserveScroll = false) {
  releaseCompletion();
  const results = $('results');
  const scrollTop = results.scrollTop;
  const folder = state.folders.at(-1);
  const { items: matches, total } = searchItems({ ...state, query: state.query, folderId: folder?.bookmarkId });
  if (state.mode === 'history' && historyPaging.order) {
    const order = new Map(historyPaging.order.map((id, index) => [id, index]));
    matches.sort((a, b) => (order.get(a.id) ?? order.size) - (order.get(b.id) ?? order.size));
    historyPaging.order = matches.map(item => item.id);
  }
  state.typed = state.mode === 'all' ? typedItems(state.query) : {};
  const goTo = [state.typed.url, ...matches.filter(item => item.domain)].filter(Boolean);
  const rest = matches.filter(item => !item.domain);
  const tabsEnd = rest.findLastIndex(item => !item.fuzzy && (item.kind === 'tab' || item.kind === 'pinned')) + 1;
  const items = [...rest.slice(0, tabsEnd), ...goTo, ...rest.slice(tabsEnd)].map(withTabState);
  if (state.typed.search) {
    const index = items.findIndex(item => !item.domain && (item.kind === 'history' || item.fuzzy));
    items.splice(index < 0 ? items.length : index, 0, state.typed.search);
  }
  if (selectedItem) {
    let index = items.findIndex(item => item.id === selectedItem.id);
    if (index < 0) {
      if (selectedItem.kind === 'history' && items.filter(item => item.kind === 'history').length >= (state.mode === 'history' ? historyPaging.limit : HISTORY_LIMIT)) {
        items.splice(items.findLastIndex(item => item.kind === 'history'), 1);
      }
      index = Math.min(state.selected, items.length);
      items.splice(index, 0, selectedItem);
    } else if (selectedItem.tabId === undefined && items[index].url !== selectedItem.url) {
      items[index] = selectedItem;
    } else selectedItem = items[index];
    state.selected = index;
  }
  state.items = items;
  const palette = $('palette');
  const intent = state.typed.url ? 'url' : '';
  if (palette.dataset.mode !== state.mode || palette.dataset.intent !== intent) replay(document.querySelector('.search-icon'), 'pulse');
  palette.dataset.mode = state.mode;
  palette.dataset.intent = intent;
  const motion = state.motion;
  state.motion = null;
  state.selected = Math.min(state.selected, Math.max(0, items.length - 1));
  const modeLabel = folder ? [folder.path, folder.title].filter(Boolean).join(' / ') : {
    all: 'Tabs & history', history: 'Search history', actions: 'Actions', bookmarks: 'Search BookMark',
    save: state.current ? `Bookmark “${state.current.title || state.current.url}” to…` : 'Bookmark current tab',
  }[state.mode];
  if ($('mode-label').textContent !== modeLabel) {
    $('mode-label').textContent = modeLabel;
    $('mode-label').title = modeLabel;
    replay($('mode-label'), 'swap');
  }
  $('web-hint').hidden = state.mode !== 'all';
  $('save-hint').hidden = state.mode !== 'save';
  $('folder-hint').hidden = state.mode !== 'save';
  input.placeholder = { all: 'Search tabs and history, or type a URL', history: 'Search history by title or URL', actions: 'Choose an action…', bookmarks: folder ? `Search in ${folder.title}…` : 'Find a bookmark or folder…', save: 'Find a folder to save into…' }[state.mode];
  input.setAttribute('aria-label', { all: 'Search tabs and history', history: 'Search history', actions: 'Search actions', bookmarks: 'Search bookmarks and folders', save: 'Search bookmark folders' }[state.mode]);
  $('back').hidden = state.mode === 'all';
  $('actions').hidden = state.mode === 'actions';
  $('clear').hidden = !state.query;
  $('results').setAttribute('aria-busy', String(state.loading));
  $('results').hidden = !items.length;
  $('empty').hidden = !!items.length || state.loading;
  const name = state.query.trim();
  let heading = 'Nothing here yet';
  let hint = state.mode === 'history' ? 'Try a shorter title or URL, or clear the search to see recent history.' : state.mode === 'all' ? 'Try a shorter title or a domain. Bookmarks are under Actions (Tab).' : 'Try a shorter title, a domain, or a bookmark folder.';
  if (state.mode === 'save' && !name && folder) {
    heading = 'Save here';
    hint = `Press ⌘↵ to save ${state.current ? `“${state.current.title || state.current.url}” in ${folder.title}` : 'here'}, or type a name and press ⌥↵ to add a subfolder.`;
  } else if (state.mode === 'save' && name) {
    heading = `No folder named “${name}”`;
    hint = folder ? `Press ⌥↵ to create “${name}” in ${folder.title}.` : `Open a folder first, then press ⌥↵ to create “${name}” inside it.`;
  }
  $('empty').querySelector('strong').textContent = heading;
  $('empty').querySelector('p').textContent = hint;
  const all = total + items.length - matches.length;
  $('count').textContent = state.loading ? 'Loading…' : all > items.length ? `${items.length} of ${all} · refine search` : `${all} result${all === 1 ? '' : 's'}`;
  updateHistoryButton();
  $('results').dataset.motion = motion || '';
  const fragment = document.createDocumentFragment();
  const openUrls = new Set(state.tabs.map(item => urlKey(item.url)).filter(Boolean));
  fragment.append(indicator);
  let previousGroup;
  for (const [index, item] of items.entries()) {
    const group = state.mode === 'history' ? 'History' : state.mode === 'save' ? 'Save to folder' : item.domain ? labels.url : item.fuzzy ? 'Similar tabs' : state.mode === 'all' && item.kind === 'pinned' ? labels.tab : labels[item.kind];
    if (group !== previousGroup) {
      const label = document.createElement('div');
      label.className = 'group-label';
      label.setAttribute('role', 'presentation');
      label.textContent = group;
      if (motion) {
        label.classList.add('rise');
        label.style.setProperty('--i', index);
      }
      fragment.append(label);
      previousGroup = group;
    }
    const row = document.createElement('div');
    row.className = motion ? 'result rise' : 'result';
    row.style.setProperty('--i', index);
    row.dataset.kind = item.kind;
    if (item.kind === 'action') row.dataset.action = item.id;
    row.id = `result-${index}`;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(index === state.selected));
    const action = resultAction(item, openUrls);
    row.setAttribute('aria-label', [item.title, ...detailLines(item).map(line => line.text), action.label].join('. '));
    const symbol = document.createElement('span');
    symbol.className = 'symbol';
    symbol.setAttribute('aria-hidden', 'true');
    symbol.append(icon(item.kind === 'action' ? item.icon || actionIcons[item.id] : icons[item.kind]));
    const favicon = faviconBase && faviconKinds.has(item.kind) && faviconUrl(faviconBase, item.url);
    if (favicon) attachFavicon(symbol, favicon);
    const copy = document.createElement('span');
    copy.className = 'copy';
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = item.title;
    copy.append(title);
    if (item.kind === 'history' && state.mode !== 'history') {
      const host = hostOf(item.url);
      if (host && item.title !== item.url && item.title !== host) {
        const origin = document.createElement('span');
        origin.className = 'host';
        origin.textContent = ` — ${host}`;
        title.append(origin);
      }
    } else for (const line of detailLines(item)) {
      const description = document.createElement('span');
      description.className = line.wrap ? 'detail path' : 'detail';
      description.textContent = line.text;
      copy.append(description);
    }
    const enter = document.createElement('span');
    enter.className = 'enter';
    enter.setAttribute('aria-hidden', 'true');
    enter.title = action.label;
    enter.append(icon(action.icon));
    row.append(symbol, copy, enter);
    row.addEventListener('pointermove', () => {
      if (state.selected === index) return;
      state.autocomplete = false;
      if (releaseCompletion()) render();
      select(index, false, true);
      suggest(state.items[index]);
    });
    row.addEventListener('mousedown', event => event.preventDefault());
    row.addEventListener('click', () => choose(item));
    fragment.append(row);
  }
  $('results').replaceChildren(fragment);
  rowLayout.disconnect();
  for (const child of $('results').children) if (child !== indicator) rowLayout.observe(child);
  select(state.selected);
  if (preserveScroll) results.scrollTop = scrollTop;
  if (state.autocomplete && ['all', 'history'].includes(state.mode)) suggest(state.items[state.selected]);
}

function setMode(mode) {
  notice('');
  state.motion = mode === state.mode ? null : 'mode';
  state.mode = mode;
  state.folders = [];
  state.selected = 0;
  setQuery('');
  state.current = null;
  render();
  input.focus({ preventScroll: true });
  if (mode === 'save' || mode === 'actions') resolveCurrent();
  if (mode === 'actions') resolveShortcut();
  load();
}

async function resolveCurrent() {
  try {
    state.current = await currentTab(chrome);
  } catch {
    state.current = null;
  }
  if (state.mode !== 'save' && state.mode !== 'actions') return;
  if (state.mode === 'save') notice(state.current ? '' : 'There’s no page to bookmark in this window.');
  render();
}

async function resolveShortcut() {
  try {
    const commands = await chrome.commands.getAll();
    state.shortcut = commands.find(command => command.name === '_execute_action')?.shortcut || '';
  } catch {
    return;
  }
  if (state.mode === 'actions') render(true);
}

function back() {
  if (state.query) {
    setQuery('');
    state.selected = 0;
    render();
  } else if (state.folders.length) {
    state.folders.pop();
    state.selected = 0;
    state.motion = 'back';
    render();
  } else if (['bookmarks', 'history', 'save'].includes(state.mode)) setMode('actions');
  else if (state.mode === 'actions') setMode('all');
  else dismiss();
  input.focus({ preventScroll: true });
}

async function choose(item) {
  if (!item || state.busy) return;
  if (item.kind === 'action' && !['duplicate', 'pin', 'mute', 'close-others', 'update', 'shortcut'].includes(item.id)) return setMode(item.id);
  if (item.kind === 'folder') {
    state.folders.push(item);
    state.selected = 0;
    state.motion = 'forward';
    setQuery('');
    render();
    input.focus({ preventScroll: true });
    return;
  }
  state.busy = true;
  const row = $(`result-${state.items.indexOf(item)}`);
  row?.classList.add('launching');
  try {
    const result = await chrome.runtime.sendMessage({
      channel: 'chaos-control',
      type: item.id === 'shortcut' ? 'open' : item.kind === 'action' ? item.id : item.kind === 'search' ? 'search' : item.tabId !== undefined ? 'activate' : 'open',
      tabId: item.tabId,
      url: item.url,
      text: item.query,
      launcherTabId,
      overlay,
    });
    if (result?.error === 'Unknown action.') throw new Error('Reload Chaos Control in your browser’s extensions manager, then reopen it to use this action.');
    if (!result?.ok) throw new Error(result?.error || 'Could not open this item. Please try again.');
    dismiss();
  } catch (error) {
    notice(error.message);
  } finally {
    state.busy = false;
    row?.classList.remove('launching');
  }
}

async function save(folder) {
  if (!state.current) return notice('There’s no page to bookmark in this window.');
  state.busy = true;
  try {
    const result = await chrome.runtime.sendMessage({ channel: 'chaos-control', type: 'bookmark', tabId: state.current.id, parentId: folder.bookmarkId });
    if (!result?.ok) throw new Error(result?.error || 'Could not save this bookmark. Please try again.');
    notice(`Saved to ${[folder.path, folder.title].filter(Boolean).join(' / ')}`, 'success');
    setTimeout(dismiss, 700);
  } catch (error) {
    notice(error.message);
  } finally {
    state.busy = false;
  }
}

async function createFolder() {
  if (state.busy) return;
  const name = state.query.trim();
  if (!name) return notice('Type a folder name, then press ⌥↵ to create it.');
  const selected = state.items[state.selected];
  const parent = state.folders.at(-1) || (selected?.kind === 'folder' ? selected : null);
  if (!parent) return notice('Open a folder first, then press ⌥↵ to create a folder inside it.');
  state.busy = true;
  try {
    const result = await chrome.runtime.sendMessage({ channel: 'chaos-control', type: 'folder', parentId: parent.bookmarkId, title: name });
    if (!result?.ok) throw new Error(result?.error || 'Could not create this folder. Please try again.');
    invalidate('bookmarks');
    state.folders.push({ id: `bookmark:${result.value.id}`, bookmarkId: result.value.id, kind: 'folder', title: name, path: [parent.path, parent.title].filter(Boolean).join(' / ') });
    setQuery('');
    state.selected = 0;
    render();
    notice(`Created “${name}”. Press ⌘↵ to save here.`, 'success');
  } catch (error) {
    notice(error.message);
  } finally {
    state.busy = false;
  }
}

const sources = {
  tabs: async () => tabItems(await chrome.tabs.query({}), chrome.runtime.getURL('launcher.html')),
  history: async text => {
    if (!text && state.mode !== 'history') return { items: [], hasMore: false };
    const maxResults = state.mode === 'history' ? historyPaging.limit : HISTORY_FETCH;
    const entries = await chrome.history.search({ text, maxResults, startTime: 0 });
    return { items: historyItems(entries, chrome.runtime.getURL('launcher.html')), hasMore: entries.length === maxResults };
  },
  bookmarks: async () => flattenBookmarks(await chrome.bookmarks.getTree()),
};

function updateHistoryButton() {
  const button = $('load-more-history');
  const request = requests.history;
  const loading = request.timer !== null || request.pending === request.generation;
  button.hidden = state.mode !== 'history';
  button.disabled = loading || state.composing || !historyPaging.hasMore;
  button.textContent = loading ? 'Loading…' : historyPaging.hasMore || request.error ? 'Load more' : 'No more history';
  button.setAttribute('aria-busy', String(loading));
}

function loadMoreHistory() {
  const request = requests.history;
  if (state.mode !== 'history' || !historyPaging.hasMore || state.composing || request.timer !== null || request.pending === request.generation) return;
  selectedItem = state.items[state.selected] || null;
  historyPaging.order = state.items.filter(item => item.kind === 'history').map(item => item.id);
  state.autocomplete = false;
  if (!historyPaging.extending) historyPaging.limit += HISTORY_FETCH;
  historyPaging.extending = true;
  stale.add('history');
  loadSource('history');
}

function updateLoadState() {
  const wanted = needed[state.mode];
  state.loading = wanted.some(name => {
    const request = requests[name];
    return request.timer !== null || request.pending === request.generation;
  });
  $('results').setAttribute('aria-busy', String(state.loading));
  if (state.loading) $('count').textContent = 'Loading…';
  const errors = wanted.filter(name => requests[name].error).map(name => failures[name]);
  const failed = !$('retry').hidden;
  $('retry').hidden = !errors.length;
  if (errors.length || failed) notice(errors.join(' ') + (errors.length ? ' Check the extension’s permissions and retry.' : ''));
  updateHistoryButton();
}

async function loadSource(name) {
  if (!needed[state.mode].includes(name) || !stale.has(name)) return;
  const request = requests[name];
  clearTimeout(request.timer);
  request.timer = null;
  const generation = request.generation;
  if (request.pending === generation || (name === 'history' && state.composing)) return;
  const query = state.query.trim();
  if (name === 'tabs') tabTitlesChanged = false;
  request.pending = generation;
  request.error = '';
  updateLoadState();
  try {
    const result = await sources[name](query);
    if (request.generation !== generation) return;
    const value = name === 'history' ? result.items : result;
    if (name === 'history') {
      historyPaging.hasMore = state.mode === 'history' && result.hasMore;
      historyPaging.extending = false;
    }
    state[name] = value;
    stale.delete(name);
    if (!loaded && value.length) state.motion = 'load';
    if (value.length) loaded = true;
  } catch {
    if (request.generation !== generation) return;
    request.error = failures[name];
  } finally {
    if (request.generation === generation) {
      request.pending = null;
      updateLoadState();
      render(state.mode === 'history');
    }
  }
}

async function loadRecent() {
  try {
    const entries = await chrome.history.search({ text: '', maxResults: RECENT_FETCH, startTime: 0 });
    state.recent = historyItems(entries, chrome.runtime.getURL('launcher.html'));
    if (state.mode === 'all' && state.query.trim()) render();
  } catch {
    state.recent = [];
  }
}

function load() {
  if (!globalThis.chrome?.bookmarks || !globalThis.chrome?.tabs) {
    state.loading = false;
    render();
    notice('Load the extension folder in your browser to search real tabs and history.');
    return;
  }
  if (globalThis.chrome?.history) loadRecent();
  for (const name of needed[state.mode]) loadSource(name);
}

function invalidate(...names) {
  for (const name of names) {
    const request = requests[name];
    request.generation++;
    request.error = '';
    clearTimeout(request.timer);
    request.timer = null;
    stale.add(name);
    if (name === 'history' && state.mode !== 'history' && (state.mode !== 'all' || !state.query.trim())) {
      state.history = [];
      stale.delete(name);
    } else if (needed[state.mode].includes(name) && !(name === 'history' && state.composing)) {
      request.timer = setTimeout(() => loadSource(name), name === 'history' ? 80 : 120);
    }
  }
  updateLoadState();
}

function refreshSearch() {
  historyPaging.limit = HISTORY_FETCH;
  historyPaging.hasMore = false;
  historyPaging.extending = false;
  historyPaging.order = null;
  if (state.mode === 'history') $('results').scrollTop = 0;
  if (tabTitlesChanged && needed[state.mode].includes('tabs')) invalidate('tabs', 'history');
  else invalidate('history');
}

input.addEventListener('input', event => {
  state.query = input.value;
  state.completion = '';
  state.autocomplete = !event.isComposing && !state.composing && !event.inputType?.startsWith('delete') && input.selectionStart === input.value.length;
  state.selected = 0;
  selectedItem = null;
  refreshSearch();
  render();
});
input.addEventListener('compositionstart', () => {
  releaseCompletion();
  state.composing = true;
  state.autocomplete = false;
});
input.addEventListener('compositionend', () => {
  state.composing = false;
  state.query = input.value;
  state.autocomplete = false;
  state.selected = 0;
  selectedItem = null;
  refreshSearch();
  render();
});

function saveTarget() {
  const selected = state.items[state.selected];
  const folder = selected?.kind === 'folder' ? selected : state.folders.at(-1);
  if (folder) save(folder);
  else notice('Pick a folder to save into.');
}
input.addEventListener('keydown', event => {
  if (event.isComposing) return;
  if (state.completion && ['Backspace', 'Delete'].includes(event.key) && input.selectionStart === state.query.length && input.selectionEnd === input.value.length) {
    event.preventDefault();
    releaseCompletion();
    state.autocomplete = false;
    render();
  } else if (state.completion && ['ArrowRight', 'End'].includes(event.key) && !event.shiftKey) {
    event.preventDefault();
    const selectedId = state.items[state.selected]?.id;
    setQuery(input.value);
    input.setSelectionRange(input.value.length, input.value.length);
    render();
    const index = state.items.findIndex(item => item.id === selectedId);
    if (index >= 0) select(index, false, true);
  } else if (['ArrowLeft', 'Home'].includes(event.key)) {
    state.autocomplete = false;
    if (state.completion && event.key === 'ArrowLeft' && !event.shiftKey) event.preventDefault();
    if (releaseCompletion()) render();
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    state.autocomplete = false;
    if (releaseCompletion()) render();
    if (!state.items.length) return;
    const index = (state.selected + (event.key === 'ArrowDown' ? 1 : -1) + state.items.length) % state.items.length;
    select(index, true, true);
    suggest(state.items[index]);
  } else if (event.key === 'Enter' && event.altKey && !event.metaKey && !event.ctrlKey && state.mode === 'save') {
    event.preventDefault();
    state.autocomplete = false;
    if (releaseCompletion()) render();
    createFolder();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    state.autocomplete = false;
    if (releaseCompletion()) render();
    const text = state.query.trim();
    if (event.metaKey || event.ctrlKey) {
      if (state.mode === 'save') saveTarget();
      else if (text) choose({ kind: 'url', url: googleSearchUrl(text) });
    } else choose(state.items[state.selected]);
  } else if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && state.mode !== 'actions') {
    event.preventDefault();
    setMode('actions');
  } else if (event.key === 'Tab' && event.shiftKey && state.mode === 'actions') {
    event.preventDefault();
    setMode('all');
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !event.isComposing) {
    event.preventDefault();
    back();
  }
});
$('actions').addEventListener('click', () => setMode('actions'));
$('back').addEventListener('click', () => {
  setQuery('');
  back();
});
$('clear').addEventListener('click', () => {
  setQuery('');
  state.selected = 0;
  render();
  input.focus({ preventScroll: true });
});
$('retry').addEventListener('click', load);
$('load-more-history').addEventListener('mousedown', event => event.preventDefault());
$('load-more-history').addEventListener('click', loadMoreHistory);
for (const event of ['onCreated', 'onRemoved', 'onMoved']) {
  globalThis.chrome?.tabs?.[event]?.addListener(() => invalidate('tabs'));
}
globalThis.chrome?.tabs?.onUpdated?.addListener((_tabId, changes) => {
  if (changes.url !== undefined || changes.pinned !== undefined) {
    invalidate('tabs');
  } else if (changes.title !== undefined) {
    if (hasSearchQuery()) tabTitlesChanged = true;
    else invalidate('tabs');
  }
});
for (const event of ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportEnded']) {
  globalThis.chrome?.bookmarks?.[event]?.addListener(() => invalidate('bookmarks'));
}
globalThis.chrome?.history?.onVisited?.addListener(() => {
  if (!hasSearchQuery()) invalidate('history');
});
globalThis.chrome?.history?.onVisitRemoved?.addListener(() => invalidate('history'));
document.addEventListener('mousedown', event => {
  if (overlay && !event.target.closest('.palette')) dismiss();
});
if (!popup && !overlay && globalThis.chrome?.tabs?.getCurrent) {
  chrome.tabs.getCurrent().then(tab => { launcherTabId = tab?.id; }).catch(() => {});
}
if (overlay) {
  window.addEventListener('message', event => {
    if (event.source !== parent || event.data?.chaosControl !== 'focus') return;
    input.focus({ preventScroll: true });
  });
}
window.addEventListener('focus', () => {
  input.focus({ preventScroll: true });
  invalidate('tabs', 'history');
});
input.focus({ preventScroll: true });
render();
if (overlay) parent.postMessage({ chaosControl: 'ready' }, '*');
load();

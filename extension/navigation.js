import { URL_SCHEMES, urlKey } from './search.js';

export function navigableUrl(value) {
  const url = new URL(value);
  if (!URL_SCHEMES.includes(url.protocol)) {
    throw new Error('This bookmark uses an unsupported URL type. Open it from your browser’s bookmark manager.');
  }
  return url.href;
}

export async function activateTab(api, tabId) {
  const tab = await api.tabs.update(tabId, { active: true });
  await api.windows.update(tab.windowId, { focused: true });
}

export async function currentTab(api) {
  const window = await api.windows.getLastFocused({ windowTypes: ['normal'] });
  const launcherUrl = api.runtime.getURL('launcher.html');
  const pages = (await api.tabs.query({ windowId: window.id })).filter(tab => !(tab.url || tab.pendingUrl || '').startsWith(launcherUrl));
  return pages.find(tab => tab.active) || pages.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0] || null;
}

function findLauncher(api, tabs, launcherTabId) {
  return tabs.find(tab => tab.id === launcherTabId && tab.url?.split('?')[0] === api.runtime.getURL('launcher.html'));
}

async function closeLauncher(api, tabs, launcherTabId, keepTabId) {
  const launcher = findLauncher(api, tabs, launcherTabId);
  if (launcher && launcher.id !== keepTabId) await api.tabs.remove(launcher.id);
}

export async function openItem(api, request) {
  if (request.type === 'close-others') {
    const tab = await currentTab(api);
    if (!tab) throw new Error('Open Chaos Control on the tab you want to keep.');
    const tabs = await api.tabs.query({ windowId: tab.windowId });
    const otherIds = tabs.filter(other => other.id !== tab.id).map(other => other.id);
    await activateTab(api, tab.id);
    if (otherIds.length) await api.tabs.remove(otherIds);
    return;
  }
  if (request.type === 'duplicate') {
    const tab = await currentTab(api);
    if (!tab) throw new Error('There’s no tab to duplicate in this window.');
    const duplicate = await api.tabs.duplicate(tab.id);
    await activateTab(api, duplicate.id);
    if (request.launcherTabId !== undefined) await closeLauncher(api, await api.tabs.query({}), request.launcherTabId, duplicate.id);
    return;
  }
  if (request.type === 'pin') {
    const tab = await currentTab(api);
    if (!tab) throw new Error('There’s no tab to pin in this window.');
    await api.tabs.update(tab.id, { pinned: !tab.pinned });
    await activateTab(api, tab.id);
    if (request.launcherTabId !== undefined) await closeLauncher(api, await api.tabs.query({}), request.launcherTabId, tab.id);
    return { pinned: !tab.pinned };
  }
  if (request.type === 'mute') {
    const tab = await currentTab(api);
    if (!tab) throw new Error('There’s no tab to mute in this window.');
    const muted = !tab.mutedInfo?.muted;
    await api.tabs.update(tab.id, { muted });
    await activateTab(api, tab.id);
    if (request.launcherTabId !== undefined) await closeLauncher(api, await api.tabs.query({}), request.launcherTabId, tab.id);
    return { muted };
  }
  if (request.type === 'folder') {
    if (typeof request.parentId !== 'string' || !request.parentId) throw new Error('Choose a bookmark folder.');
    const title = typeof request.title === 'string' ? request.title.trim() : '';
    if (!title) throw new Error('Type a folder name.');
    const node = await api.bookmarks.create({ parentId: request.parentId, title });
    return { id: node.id };
  }
  if (request.type === 'activate') {
    if (!Number.isInteger(request.tabId) || request.tabId < 0) throw new Error('Invalid tab.');
    await activateTab(api, request.tabId);
    if (request.launcherTabId !== undefined) await closeLauncher(api, await api.tabs.query({}), request.launcherTabId, request.tabId);
    return;
  }
  if (request.type === 'bookmark') {
    if (!Number.isInteger(request.tabId) || request.tabId < 0) throw new Error('Invalid tab.');
    if (typeof request.parentId !== 'string' || !request.parentId) throw new Error('Choose a bookmark folder.');
    const tab = await api.tabs.get(request.tabId);
    const address = tab.url || tab.pendingUrl;
    if (!address) throw new Error('This tab has no address to bookmark.');
    const url = navigableUrl(address);
    await api.bookmarks.create({ parentId: request.parentId, title: tab.title || url, url });
    return;
  }
  if (request.type === 'search') {
    const text = typeof request.text === 'string' ? request.text.trim() : '';
    if (!text) throw new Error('Type something to search for.');
    if (!api.search?.query) throw new Error('Web search isn’t available in this browser. Reload the extension to grant the search permission.');
    const launcher = findLauncher(api, await api.tabs.query({}), request.launcherTabId);
    await api.search.query(launcher ? { text, tabId: launcher.id } : { text, disposition: 'NEW_TAB' });
    return;
  }
  if (request.type !== 'open') throw new Error('Unknown action.');
  const url = navigableUrl(request.url);
  const tabs = await api.tabs.query({});
  const existing = tabs.find(tab => urlKey(tab.url || tab.pendingUrl) === urlKey(url));
  if (existing) {
    await activateTab(api, existing.id);
    await closeLauncher(api, tabs, request.launcherTabId, existing.id);
    return;
  }
  const launcher = findLauncher(api, tabs, request.launcherTabId);
  if (launcher) await api.tabs.update(launcher.id, { url });
  else await api.tabs.create({ url });
}

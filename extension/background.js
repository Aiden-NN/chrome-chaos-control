import { openItem } from './navigation.js';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || request?.channel !== 'chaos-control') return;
  if (request.type === 'overlay-failed') {
    if (!Number.isInteger(sender.tab?.windowId)) return;
    openWindow(sender.tab.windowId).then(
      () => sendResponse({ ok: true }),
      error => sendResponse({ ok: false, error: error.message }),
    );
    return true;
  }
  if (request.type === 'update') {
    if (request.overlay && !Number.isInteger(sender.tab?.id)) {
      sendResponse({ ok: false, error: 'Could not find the tab containing Chaos Control. Close and reopen it, then try again.' });
      return;
    }
    const closing = request.overlay ? chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      func: () => {
        const host = document.getElementById('chaos-control-overlay-host');
        host?.dispatchEvent(new Event('chaos-control-update'));
        return !host?.isConnected;
      },
    }) : Promise.resolve([]);
    closing.then(results => {
      if (results.some(result => result.result !== true)) throw new Error('Close and reopen Chaos Control before choosing Update again.');
      chrome.runtime.reload();
      sendResponse({ ok: true });
    }).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  openItem(chrome, request).then(
    value => sendResponse({ ok: true, value }),
    error => sendResponse({ ok: false, error: error.message }),
  );
  return true;
});

async function openWindow(windowId) {
  const width = 640;
  const height = 600;
  const parent = await chrome.windows.get(windowId).catch(() => null);
  const bounds = parent ? {
    left: Math.round(parent.left + (parent.width - width) / 2),
    top: Math.round(parent.top + Math.max(40, (parent.height - height) / 2)),
  } : {};
  await chrome.windows.create({ url: 'launcher.html?view=popup', type: 'popup', focused: true, width, height, ...bounds });
}

async function openLauncher(tab) {
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['overlay.js'] });
  } catch {
    await openWindow(tab.windowId);
  }
}

chrome.action.onClicked.addListener(openLauncher);

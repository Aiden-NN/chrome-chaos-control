(async () => {
  if (!document.documentElement) {
    await new Promise(resolve => {
      const observer = new MutationObserver(() => {
        if (!document.documentElement) return;
        observer.disconnect();
        resolve();
      });
      observer.observe(document, { childList: true });
    });
  }
  const existing = document.getElementById('chaos-control-overlay-host');
  if (existing) {
    existing.dispatchEvent(new Event('chaos-control-close'));
    return;
  }
  const origin = new URL(chrome.runtime.getURL('')).origin;
  const previous = document.activeElement;
  const host = document.createElement('div');
  host.id = 'chaos-control-overlay-host';
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    dialog { position: fixed; inset: 0; width: 100vw; height: 100vh; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; background: transparent; overflow: hidden; }
    dialog::backdrop { background: transparent; }
    iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: transparent; color-scheme: dark; transition: opacity .12s ease-in; }
    iframe.closing { opacity: 0; }
  `;
  const frame = document.createElement('iframe');
  frame.src = chrome.runtime.getURL('launcher.html?view=overlay');
  frame.title = 'Chaos Control';
  const dialog = document.createElement('dialog');
  dialog.append(frame);
  root.append(style, dialog);

  let closeTimer;
  let readyTimer;

  function close(immediate = false) {
    if (frame.classList.contains('closing') && immediate !== true) return;
    clearTimeout(closeTimer);
    clearTimeout(readyTimer);
    removeEventListener('message', onMessage);
    host.removeEventListener('chaos-control-close', close);
    frame.classList.add('closing');
    const finish = () => {
      host.removeEventListener('chaos-control-update', update);
      dialog.close();
      host.remove();
      if (previous instanceof HTMLElement && previous !== document.body && previous.isConnected) previous.focus({ preventScroll: true });
    };
    if (immediate === true) finish();
    else closeTimer = setTimeout(finish, 120);
  }

  function update() {
    close(true);
  }

  function onMessage(event) {
    if (event.source !== frame.contentWindow || event.origin !== origin) return;
    if (event.data?.chaosControl === 'ready') clearTimeout(readyTimer);
    else if (event.data?.chaosControl === 'close') close();
  }

  addEventListener('message', onMessage);
  host.addEventListener('chaos-control-close', close);
  host.addEventListener('chaos-control-update', update);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  frame.addEventListener('load', () => {
    if (frame.classList.contains('closing')) return;
    frame.focus({ preventScroll: true });
    frame.contentWindow.postMessage({ chaosControl: 'focus' }, origin);
  });
  document.documentElement.append(host);
  dialog.showModal();
  readyTimer = setTimeout(() => {
    close(true);
    chrome.runtime.sendMessage({ channel: 'chaos-control', type: 'overlay-failed' });
  }, 3000);
})();

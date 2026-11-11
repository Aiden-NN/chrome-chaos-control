let tabs = [
  { id: 1, title: 'Linear — Product roadmap', url: 'https://linear.app/team/roadmap', windowId: 1, active: true, lastAccessed: 10 },
  { id: 2, title: 'Figma — Design workspace', url: 'https://figma.com/files', windowId: 1, lastAccessed: 9 },
  { id: 3, title: 'GitHub — Pull requests', url: 'https://github.com/pulls', windowId: 1, pinned: true },
  { id: 4, title: 'Calendar', url: 'https://calendar.google.com', windowId: 1, pinned: true },
  { id: 5, title: 'Other window', url: 'https://example.org/', windowId: 2, active: true },
];
const event = { addListener() {} };
globalThis.chrome = {
  tabs: {
    query: async (query = {}) => tabs.filter(tab => query.windowId === undefined || tab.windowId === query.windowId),
    update: async (id, changes) => {
      const tab = tabs.find(tab => tab.id === id);
      if (changes.active) tabs.filter(other => other.windowId === tab.windowId).forEach(other => { other.active = false; });
      Object.assign(tab, changes);
      return tab;
    },
    remove: async ids => { tabs = tabs.filter(tab => ![ids].flat().includes(tab.id)); },
    duplicate: async id => {
      const tab = { ...tabs.find(tab => tab.id === id), id: Math.max(...tabs.map(tab => tab.id)) + 1 };
      tabs.push(tab);
      return tab;
    },
    getCurrent: async () => ({ id: 99 }),
    onCreated: event,
    onUpdated: event,
    onRemoved: event,
  },
  windows: { getLastFocused: async () => ({ id: 1 }), update: async () => {} },
  history: {
    search: async () => [
      { url: 'https://www.ign.com/', title: 'IGN', lastVisitTime: 95, visitCount: 12 },
      { url: 'https://www.instagram.com/', title: 'Instagram', lastVisitTime: 94, visitCount: 40 },
      { url: 'https://news.ycombinator.com/', title: 'Hacker News', lastVisitTime: 90 },
      { url: 'https://developer.mozilla.org/en-US/docs/Web', title: 'Web technology for developers', lastVisitTime: 80 },
      { url: 'https://github.com/pulls', title: 'GitHub — Pull requests', lastVisitTime: 70 },
      { url: 'https://stackoverflow.com/questions', title: 'Stack Overflow — Questions', lastVisitTime: 60 },
    ],
    onVisited: event,
    onVisitRemoved: event,
  },
  bookmarks: {
    getTree: async () => [{ id: '0', title: '', children: [
      { id: '1', parentId: '0', title: 'Bookmarks bar', children: [
        { id: '2', parentId: '1', title: 'Design resources', children: [
          { id: '3', parentId: '2', title: 'Layers — Design inspiration', url: 'https://layers.to' },
          { id: '4', parentId: '2', title: 'Figma — Design workspace', url: 'https://figma.com/files' },
          { id: '5', parentId: '2', title: 'Design systems', children: [
            { id: '6', parentId: '5', title: 'Radix primitives', url: 'https://radix-ui.com' },
            { id: '8', parentId: '5', title: 'Component libraries', children: [
              { id: '9', parentId: '8', title: 'Headless UI patterns', children: [
                { id: '10', parentId: '9', title: 'Accessible comboboxes', url: 'https://www.w3.org/WAI/ARIA/apg/patterns/combobox/' },
              ] },
            ] },
          ] },
        ] },
        { id: '7', parentId: '1', title: 'MDN — Web docs', url: 'https://developer.mozilla.org' },
      ] },
    ] }],
  },
  runtime: {
    getURL: path => new URL(path, `${location.origin}/extension/`).href,
    sendMessage: async message => {
      document.body.dataset.lastAction = JSON.stringify(message);
      if (new URLSearchParams(location.search).has('stale-worker')) return { ok: false, error: 'Unknown action.' };
      if (message.type === 'update') {
        document.body.dataset.previewReloaded = 'true';
        return { ok: true };
      }
      if (['close-others', 'duplicate', 'pin', 'mute'].includes(message.type)) {
        try {
          const { openItem } = await import('/extension/navigation.js');
          const value = await openItem(globalThis.chrome, message);
          document.body.dataset.previewTabs = JSON.stringify(tabs);
          return { ok: true, value };
        } catch (error) {
          return { ok: false, error: error.message };
        }
      }
      return { ok: true, value: message.type === 'folder' ? { id: 'fixture-folder' } : undefined };
    },
  },
};

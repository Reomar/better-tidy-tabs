const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const modules = ['00-config', '10-utils', '20-ai-common', '30-provider-gemini',
  '31-provider-local', '32-provider-openrouter', '33-provider-groq', '34-provider-mistral',
  '35-workspace-state', '40-sorting'];

function createHarness({ provider = 'firefox-local', embeddings = new Map(), namer = 'Related Pages' } = {}) {
  const world = { blocks: [], groups: [], moves: [], toasts: [], logs: [], requests: [], engineInputs: [],
    active: 'workspace', prefs: new Map(), timers: [], response: null, failEngine: false,
    addResult: 'normal' };
  let sequence = 0;
  class Tab {
    constructor({ id, title, url = 'https://example.test/', workspace = 'workspace', pinned = false }) {
      this.id = id; this.attrs = { label: title, 'zen-workspace-id': workspace };
      this.isConnected = true; this.pinned = pinned; this.group = null;
      this.linkedBrowser = { currentURI: { spec: url } };
      this.tagName = 'tab';
    }
    getAttribute(key) { return this.attrs[key] ?? null; }
    setAttribute(key, value) { this.attrs[key] = String(value); }
    hasAttribute(key) { return key in this.attrs; }
    closest() { return this.group; }
    querySelector() { return null; }
    get nextSibling() { return world.blocks[world.blocks.indexOf(this) + 1] || null; }
  }
  class Group {
    constructor(tabs, { id = `native-${++sequence}`, label = 'Existing', color = 'blue' } = {}) {
      if (world.groups.some((group) => group.id === id && group.isConnected))
        throw new Error('duplicate native group ID');
      this.id = id; this.attrs = { label }; this.color = color;
      this.tabs = []; this.isConnected = true; this.tagName = 'tab-group';
      world.groups.push(this); world.blocks.push(this);
      for (const tab of tabs) attach(tab, this);
    }
    getAttribute(key) { return this.attrs[key] ?? null; }
    setAttribute(key, value) { this.attrs[key] = String(value); }
    hasAttribute(key) { return key in this.attrs; }
    querySelectorAll(selector) { return selector === 'tab' ? this.tabs.filter((tab) => tab.isConnected) : []; }
    querySelector(selector) {
      if (selector === 'tab') return this.tabs.find((tab) => tab.isConnected) || null;
      if (selector === '.tab-group-label') return { setAttribute() {} };
      return null;
    }
    get collapsed() { return this.attrs.collapsed === 'true'; }
    set collapsed(value) { this.attrs.collapsed = String(value); }
    get nextSibling() { return world.blocks[world.blocks.indexOf(this) + 1] || null; }
    remove() {
      this.isConnected = false;
      world.blocks = world.blocks.filter((block) => block !== this);
    }
  }
  const tabs = () => world.blocks.flatMap((block) => block instanceof Group ? block.tabs : [block])
    .filter((tab) => tab.isConnected);
  function detach(tab) {
    const old = tab.group;
    if (old) {
      old.tabs = old.tabs.filter((member) => member !== tab);
      if (!old.tabs.length) old.remove();
    } else world.blocks = world.blocks.filter((block) => block !== tab);
    tab.group = null;
  }
  function attach(tab, group) {
    detach(tab); tab.group = group; group.tabs.push(tab);
  }
  const reorder = (item, target, after = false) => {
    const list = item instanceof Tab && item.group && item.group === target?.group ? item.group.tabs : world.blocks;
    const old = list.indexOf(item);
    if (old >= 0) list.splice(old, 1);
    const index = list.indexOf(target);
    list.splice(index < 0 ? list.length : index + (after ? 1 : 0), 0, item);
  };
  const gBrowser = {
    get tabs() { return tabs(); },
    addTabGroup(members, options) {
      const target = options.insertBefore;
      const index = world.blocks.indexOf(target instanceof Tab && target.group ? target.group : target);
      const group = new Group(members, options);
      world.blocks = world.blocks.filter((block) => block !== group);
      world.blocks.splice(index < 0 ? world.blocks.length : index, 0, group);
      world.moves.push(['create', group.id, members.map((tab) => tab.id)]);
      if (world.addResult === 'throw') throw new Error('created before throwing');
      return world.addResult === 'undefined' ? undefined : group;
    },
    moveTabToExistingGroup(tab, group) {
      if (!group.isConnected) throw new Error('destination disconnected');
      attach(tab, group); world.moves.push(['move', tab.id, group.id]);
    },
    ungroupTab(tab) { detach(tab); world.blocks.push(tab); },
    moveTabBefore(item, target) { reorder(item, target); },
  };
  const style = { getPropertyValue() { return ''; }, setProperty() {}, removeProperty() {} };
  const workspace = { isConnected: true, querySelector() { return null; },
    tabsContainer: { get children() { return world.blocks; },
      insertBefore(item, target) { reorder(item, target); },
      appendChild(item) { reorder(item, null); } } };
  const document = {
    querySelectorAll(selector) {
      if (selector.startsWith('tab-group:has')) {
        const id = selector.match(/zen-workspace-id="([^"]+)"/)?.[1];
        return world.groups.filter((group) => group.isConnected &&
          group.tabs.some((tab) => tab.getAttribute('zen-workspace-id') === id));
      }
      return [];
    },
    querySelector() { return null; }, createDocumentFragment() { return {}; },
    documentElement: { style },
  };
  const Services = { prefs: {
    getStringPref(key, fallback) { return world.prefs.get(key) ?? fallback; },
    setStringPref(key, value) { world.prefs.set(key, value); },
  } };
  world.prefs.set('extension.zen-tidy-tabs.provider', provider);
  const sandbox = {
    URL, AbortController, document, Services, gBrowser,
    console: Object.fromEntries(['log','warn','error'].map((level) => [level, (...args) => world.logs.push([level, ...args])])),
    setTimeout(fn) { world.timers.push(fn); return world.timers.length; }, clearTimeout() {},
    requestAnimationFrame() { return 1; }, cancelAnimationFrame() {}, performance,
    fetch: async (url, options) => {
      world.requests.push({ url, body: JSON.parse(options.body) });
      if (!world.response) throw new Error('No mock response configured');
      return typeof world.response === 'function' ? world.response(url, options) : world.response;
    },
    ChromeUtils: { importESModule() { return { createEngine: async (options) => {
      if (world.failEngine) throw new Error('ML unavailable');
      return { run: async (input) => {
        world.engineInputs.push({ options, input });
        if (options.taskName === 'feature-extraction') return [{ embedding: embeddings.get(input.args[0]) || [1, 0, 0] }];
        return [{ generated_text: typeof namer === 'function' ? namer(input.args[0]) : namer }];
      } };
    } }; } },
  };
  sandbox.window = { BetterTidyTabs: {}, gBrowser,
    gZenWorkspaces: { get activeWorkspace() { return world.active; }, activeWorkspaceElement: workspace } };
  const context = vm.createContext(sandbox);
  for (const name of modules) vm.runInContext(fs.readFileSync(path.join(root, 'modules', `${name}.js`), 'utf8'), context);
  const ns = sandbox.window.BetterTidyTabs;
  ns.showRuntimeToast = (toast) => world.toasts.push(toast);
  ns.updateButtonsVisibilityState = () => {};
  const addTab = (data) => { const tab = new Tab(data); world.blocks.push(tab); return tab; };
  const addGroup = (members, options) => new Group(members, options);
  return { ns, world, context, addTab, addGroup, tabs };
}

const jsonResponse = (payload, { gemini = false, status = 200 } = {}) => ({
  ok: status >= 200 && status < 300, status,
  async json() { return gemini ? { candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }
    : { choices: [{ message: { content: JSON.stringify(payload) } }] }; },
  async text() { return JSON.stringify({ error: { message: 'Synthetic failure' } }); },
});
module.exports = { createHarness, jsonResponse, root };

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'aaa.user.js');
const source = fs.readFileSync(scriptPath, 'utf8');

assert.match(source, /\/\/ @version\s+1\.6\.1/);
assert.match(source, /\/\/ @inject-into\s+auto/);
assert.match(source, /\/\/ @grant\s+none/);
assert.match(source, /const SCAN_MS = 10000;/);
assert.match(source, /if \(pageGenerating\) \{\s*return;\s*\}/);
assert.doesNotMatch(source, /recoverPermissionError|permissionErrorSurface/);

const tail = /\n  if \(document\.readyState === 'loading'\) \{[\s\S]*?\n\}\(\)\);\s*$/;
assert.match(source, tail);

const instrumented = source.replace(
  tail,
  `
  globalThis.__userscriptTest = {
    MODEL_ACTIVITY_SELECTOR,
    buttonLabel,
    canSubmit,
    generating,
    hasLiteralTableBreak,
    installSessionKeepalive,
    isRunActionLabel,
    isPromptRunButton,
    isStopActionLabel,
    keepSessionFresh,
    repairTableBreakTextNode
  };
}());`
);

let fetchCalls = 0;
let authReloadCalls = 0;
let statusElement = null;
const htmlAttributes = new Map();
const listeners = new Map();

const context = {
  Array,
  Boolean,
  Date,
  Error,
  Map,
  Math,
  Node: { ELEMENT_NODE: 1 },
  Number,
  Promise,
  RegExp,
  Set,
  String,
  URL,
  WeakMap,
  WeakSet,
  clearTimeout,
  console,
  document: {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    body: {
      appendChild(child) {
        statusElement = child;
      }
    },
    createDocumentFragment() {
      return {
        children: [],
        appendChild(child) {
          this.children.push(child);
        }
      };
    },
    createElement(tagName) {
      return {
        attributes: new Map(),
        className: '',
        tagName: tagName.toUpperCase(),
        removeAttribute(name) {
          this.attributes.delete(name);
        },
        setAttribute(name, value) {
          this.attributes.set(name, value);
        }
      };
    },
    createTextNode(text) {
      return { nodeType: 3, nodeValue: text };
    },
    documentElement: {
      setAttribute(name, value) {
        htmlAttributes.set(name, value);
      }
    },
    getElementById(id) {
      return statusElement && statusElement.id === id
        ? statusElement
        : null;
    },
    querySelectorAll() {
      return [];
    }
  },
  getComputedStyle() {
    return { display: 'block', visibility: 'visible' };
  },
  setTimeout,
  window: {
    clearTimeout,
    fetch: async (_url, options) => {
      fetchCalls += 1;
      assert.equal(options.credentials, 'include');
      assert.equal(options.cache, 'no-store');
      return {
        ok: true,
        url: 'https://aistudio.google.com/prompts/example',
        body: {
          cancel: async () => {}
        }
      };
    },
    gapi: {
      auth2: {
        getAuthInstance() {
          return {
            currentUser: {
              get() {
                return {
                  getAuthResponse() {
                    return { expires_at: Date.now() + 1000 };
                  },
                  async reloadAuthResponse() {
                    authReloadCalls += 1;
                  }
                };
              }
            }
          };
        }
      }
    },
    location: {
      href: 'https://aistudio.google.com/prompts/example#fragment',
      origin: 'https://aistudio.google.com'
    },
    setInterval() {
      return 1;
    },
    setTimeout
  }
};
context.globalThis = context;

vm.runInNewContext(instrumented, context, { filename: scriptPath });

const api = context.__userscriptTest;
assert.ok(api);
assert.ok(
  api.MODEL_ACTIVITY_SELECTOR.split(',').every((selector) => (
    /(?:aria-busy|progress-spinner|mat-spinner|progressbar)/.test(selector)
  )),
  'every activity selector must target an activity descendant, not a whole turn'
);
assert.equal(api.isRunActionLabel('Run Ctrl keyboard_return'), true);
assert.equal(api.isRunActionLabel('실행'), true);
assert.equal(api.isStopActionLabel('Stop'), true);
assert.equal(api.isStopActionLabel('Run'), false);
assert.equal(api.hasLiteralTableBreak('first<br>second'), true);
assert.equal(api.hasLiteralTableBreak('first<BR />second'), true);
assert.equal(api.hasLiteralTableBreak('first break second'), false);

let replacement = null;
const tableCell = {
  nodeType: 1,
  closest(selector) {
    return selector === 'th, td' ? this : null;
  }
};
const breakTextNode = {
  isConnected: true,
  nodeValue: 'first<br>second<BR />third **bold**',
  parentElement: tableCell,
  parentNode: {
    replaceChild(fragment, original) {
      replacement = { fragment, original };
    }
  }
};

assert.equal(api.repairTableBreakTextNode(breakTextNode), 3);
assert.equal(replacement.original, breakTextNode);
assert.deepEqual(
  replacement.fragment.children.map((child) => (
    child.tagName || child.nodeValue
  )),
  ['first', 'BR', 'second', 'BR', 'third ', 'STRONG']
);
assert.equal(replacement.fragment.children.at(-1).textContent, 'bold');

const outsideTableTextNode = {
  ...breakTextNode,
  parentElement: {
    nodeType: 1,
    closest() {
      return null;
    }
  }
};
assert.equal(api.repairTableBreakTextNode(outsideTableTextNode), 0);

const currentRunButton = {
  disabled: false,
  getAttribute(name) {
    if (name === 'aria-disabled') return 'false';
    return null;
  },
  querySelector(selector) {
    return selector === '.run-button-label'
      ? { textContent: 'Run' }
      : null;
  },
  textContent: 'Run Ctrl keyboard_return'
};

assert.match(api.buttonLabel(currentRunButton), /Run/);
assert.equal(api.isPromptRunButton(currentRunButton), true);
assert.equal(api.canSubmit(currentRunButton), true);
currentRunButton.getAttribute = (name) => (
  name === 'aria-disabled' ? 'true' : null
);
assert.equal(api.canSubmit(currentRunButton), false);

const makeVisibleButton = (label) => ({
  isConnected: true,
  getAttribute() {
    return null;
  },
  getBoundingClientRect() {
    return { width: 100, height: 40 };
  },
  querySelector(selector) {
    return selector === '.run-button-label'
      ? { textContent: label }
      : null;
  },
  textContent: label
});

context.document.querySelectorAll = (selector) => {
  if (selector === 'button') return [makeVisibleButton('Stop')];
  return [];
};
assert.equal(api.generating(), true);

context.document.querySelectorAll = (selector) => {
  if (selector === 'button') return [makeVisibleButton('Run')];
  return [];
};
assert.equal(api.generating(), false);

let programmaticRunClicks = 0;
const preflightRunButton = makeVisibleButton('Run');
preflightRunButton.disabled = false;
preflightRunButton.nodeType = 1;
preflightRunButton.getAttribute = (name) => (
  name === 'aria-disabled' ? 'false' : null
);
preflightRunButton.closest = (selector) => (
  selector.includes('button') ? preflightRunButton : null
);
preflightRunButton.matches = (selector) => (
  selector.includes('ctrl-enter-submits')
);
preflightRunButton.click = () => {
  programmaticRunClicks += 1;
};

context.document.querySelectorAll = (selector) => {
  if (selector === 'button') return [preflightRunButton];
  return [];
};

api.installSessionKeepalive();
assert.equal(typeof listeners.get('click'), 'function');

const staleClick = {
  isTrusted: true,
  target: preflightRunButton,
  preventDefault() {
    this.prevented = true;
  },
  stopImmediatePropagation() {
    this.stopped = true;
  }
};
listeners.get('click')(staleClick);
assert.equal(staleClick.prevented, true);
assert.equal(staleClick.stopped, true);

(async () => {
  assert.equal(await api.keepSessionFresh(true), true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fetchCalls, 1);
  assert.equal(authReloadCalls, 1);
  assert.equal(programmaticRunClicks, 1);
  assert.ok(htmlAttributes.has('data-aistudio-session-fresh-at'));

  assert.equal(await api.keepSessionFresh(false), true);
  assert.equal(fetchCalls, 1, 'fresh sessions must not fetch again');
  assert.equal(authReloadCalls, 1, 'fresh sessions must not reload auth again');

  const freshClick = {
    isTrusted: true,
    target: preflightRunButton,
    preventDefault() {
      this.prevented = true;
    },
    stopImmediatePropagation() {
      this.stopped = true;
    }
  };
  listeners.get('click')(freshClick);
  assert.equal(freshClick.prevented, undefined);
  assert.equal(freshClick.stopped, undefined);
  assert.equal(programmaticRunClicks, 1, 'fresh clicks must not be duplicated');

  console.log('userscript tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const katex = require('katex');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'aaa.user.js');
const source = fs.readFileSync(scriptPath, 'utf8');

assert.match(source, /\/\/ @version\s+1\.7\.0/);
assert.match(
  source,
  /\/\/ @require\s+https:\/\/cdn\.jsdelivr\.net\/npm\/katex@0\.18\.1\/dist\/katex\.min\.js/
);
assert.match(source, /\/\/ @inject-into\s+auto/);
assert.match(source, /\/\/ @grant\s+none/);
assert.match(source, /const SCAN_MS = 10000;/);
assert.match(source, /function repairSplitTableBreaksInCell/);
assert.match(source, /function repairInlineEmphasisInContainer/);
assert.match(source, /if \(pageGenerating\) \{\s*return;\s*\}/);
assert.doesNotMatch(source, /recoverPermissionError|permissionErrorSurface/);

const tail = /\n  if \(document\.readyState === 'loading'\) \{[\s\S]*?\n\}\(\)\);\s*$/;
assert.match(source, tail);

const instrumented = source.replace(
  tail,
  `
  globalThis.__userscriptTest = {
    availableKatex,
    bracesAreBalanced,
    MODEL_ACTIVITY_SELECTOR,
    RAW_MATH_ENVIRONMENTS,
    buttonLabel,
    canSubmit,
    findMatches,
    generating,
    hasLiteralTableBreak,
    installSessionKeepalive,
    isRunActionLabel,
    isPromptRunButton,
    isStopActionLabel,
    keepSessionFresh,
    hasRawMathText,
    normalizeCollapsedRowSeparators,
    normalizeKatexCommands,
    parseRawAligned,
    parseRawArray,
    parseRawMathCandidate,
    repairTableBreakTextNode,
    simpleTexRuns
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
  katex,
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
assert.equal(api.availableKatex().version, '0.18.1');
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

const adjacentMathMatch = api.findMatches(
  'Formula $x$ remains raw while **this is bold**.'
);
assert.equal(adjacentMathMatch.length, 1);
assert.equal(adjacentMathMatch[0].inner, 'this is bold');
assert.equal(api.findMatches('Keep **$x$** math untouched.').length, 0);
assert.equal(api.findMatches('Keep \\**escaped** markers.').length, 0);
assert.equal(api.findMatches('foo__bar__baz').length, 0);
assert.equal(api.findMatches('Render ***bold italic*** too.').length, 1);
assert.equal(
  api.findMatches('Render ***bold italic*** too.')[0].marker,
  '***'
);

const brokenArray = String.raw`begin{array}{ll|ll}
\text{(차) 기계장치(신)} & 55,000 & \text{(대) 기계장치(구)} & 100,000 \
\text{(차) 감가상각누계액} & 20,000 & & \
\text{(차) 현금} & 25,000 & &
end{array}`;
const parsedArray = api.parseRawArray(brokenArray);
assert.ok(parsedArray);
assert.deepEqual(Array.from(parsedArray.alignments), ['l', 'l', 'l', 'l']);
assert.deepEqual(Array.from(parsedArray.dividers), [2]);
assert.deepEqual(Array.from(parsedArray.rows, (row) => Array.from(row)), [
  ['(차) 기계장치(신)', '55,000', '(대) 기계장치(구)', '100,000'],
  ['(차) 감가상각누계액', '20,000', '', ''],
  ['(차) 현금', '25,000', '', '']
]);

const validRawArray = String.raw`\begin{array}{lr}
\text{현금} & 25,000 \\
\text{합계} & 25,000
\end{array}`;
assert.deepEqual(
  Array.from(api.parseRawArray(validRawArray).rows, (row) => Array.from(row)),
  [
    ['현금', '25,000'],
    ['합계', '25,000']
  ]
);
assert.equal(api.parseRawArray('begin{array}{ll} no columns end{array}'), null);

const brokenAligned = String.raw`begin{aligned}
\text{기계장치 처분손익} &= \text{\bf [기계장치]의 공정가치(시세)} - \text{\bf [기계장치]의 장부원가(장부금액)} \
&= 30,000\text{원} - 20,000\text{원}(50,000 - 30,000) \
&= \mathbf{+10,000\text{원 (처분이익)}}
end{aligned}`;
const parsedAligned = api.parseRawAligned(brokenAligned);
assert.ok(parsedAligned);
assert.equal(parsedAligned.rows.length, 3);
assert.deepEqual(
  Array.from(parsedAligned.rows, (row) => Array.from(row)),
  [
    [
      String.raw`\text{기계장치 처분손익}`,
      String.raw`= \text{\bf [기계장치]의 공정가치(시세)} - \text{\bf [기계장치]의 장부원가(장부금액)}`
    ],
    [
      '',
      String.raw`= 30,000\text{원} - 20,000\text{원}(50,000 - 30,000)`
    ],
    [
      '',
      String.raw`= \mathbf{+10,000\text{원 (처분이익)}}`
    ]
  ]
);

const plainRuns = (text) => Array.from(
  api.simpleTexRuns(text),
  (run) => ({ text: run.text, bold: run.bold })
);
assert.deepEqual(plainRuns(parsedAligned.rows[0][0]), [
  { text: '기계장치 처분손익', bold: false }
]);
assert.deepEqual(plainRuns(parsedAligned.rows[0][1]), [
  { text: '= ', bold: false },
  { text: '[기계장치]의 공정가치(시세)', bold: true },
  { text: ' - ', bold: false },
  { text: '[기계장치]의 장부원가(장부금액)', bold: true }
]);
assert.deepEqual(plainRuns(parsedAligned.rows[2][1]), [
  { text: '= ', bold: false },
  { text: '+10,000원 (처분이익)', bold: true }
]);
assert.equal(api.parseRawAligned('begin{aligned} no alignment end{aligned}'), null);

assert.equal(api.bracesAreBalanced(String.raw`\mathbf{x_{1}}`), true);
assert.equal(api.bracesAreBalanced(String.raw`\mathbf{x_{1}`), false);
assert.equal(
  api.normalizeCollapsedRowSeparators(String.raw`a &= b \
&= c \\
&= d \cr
&= e`),
  String.raw`a &= b \\
&= c \\
&= d \cr
&= e`
);
assert.equal(
  api.normalizeCollapsedRowSeparators(String.raw`a &= b \ &= c`),
  String.raw`a &= b \\ &= c`
);
assert.equal(
  api.normalizeKatexCommands(String.raw`\bm{x}+{\bfseries y}`),
  String.raw`\boldsymbol{x}+{\bf y}`
);

const rawMathCases = [
  {
    name: 'lost array commands and row separators',
    input: brokenArray,
    environment: 'array',
    kind: 'environment'
  },
  {
    name: 'lost aligned commands with nested bold text',
    input: brokenAligned,
    environment: 'aligned',
    kind: 'environment'
  },
  {
    name: 'matrix with mathematical bold commands',
    input: String.raw`\begin{pmatrix}
\mathbf{x} & \boldsymbol{\alpha} \\
y & z
\end{pmatrix}`,
    environment: 'pmatrix',
    kind: 'environment'
  },
  {
    name: 'cases with missing begin and end slashes',
    input: String.raw`begin{cases}
\mathbf{x^2} & \textbf{if } x > 0 \
-x & \text{otherwise}
end{cases}`,
    environment: 'cases',
    kind: 'environment'
  },
  {
    name: 'starred matrix with alignment option',
    input: String.raw`begin{Bmatrix*}[r]
1 & \mathbf{2} \
\boldsymbol{\beta} & 4
end{Bmatrix*}`,
    environment: 'Bmatrix*',
    kind: 'environment'
  },
  {
    name: 'equation containing split',
    input: String.raw`begin{equation}
\begin{split}
a &= \mathbf{b} \
&= \boldsymbol{\gamma}
\end{split}
end{equation}`,
    environment: 'equation',
    kind: 'environment'
  },
  {
    name: 'top-level align converted to aligned',
    input: String.raw`begin{align*}
a &= \mathbf{b} \
c &= \boldsymbol{d}
end{align*}`,
    environment: 'align*',
    kind: 'environment',
    texPattern: /\\begin\{aligned\}/
  },
  {
    name: 'top-level alignat converted to alignedat',
    input: String.raw`begin{alignat*}{2}
10&x+&3&y=2 \
3&x+&13&y=4
end{alignat*}`,
    environment: 'alignat*',
    kind: 'environment',
    texPattern: /\\begin\{alignedat\}\{2\}/
  },
  {
    name: 'top-level gather converted to gathered',
    input: String.raw`begin{gather*}
\mathbf{a}=b \
c=\boldsymbol{d}
end{gather*}`,
    environment: 'gather*',
    kind: 'environment',
    texPattern: /\\begin\{gathered\}/
  },
  {
    name: 'display delimiters',
    input: String.raw`$$\frac{\mathbf{x}}{\boldsymbol{\alpha}}$$`,
    environment: null,
    kind: 'delimited',
    displayMode: true
  },
  {
    name: 'inline delimiters',
    input: String.raw`\(\sqrt{\mathbf{x_1}}\)`,
    environment: null,
    kind: 'delimited',
    displayMode: false
  },
  {
    name: 'markdown bold around delimited math',
    input: String.raw`**\(\frac{x}{y}\)**`,
    environment: null,
    kind: 'delimited',
    displayMode: false,
    bold: true
  },
  {
    name: 'standalone nested text bold',
    input: String.raw`\text{\bf 굵은 금액 }+\mathbf{10,000}`,
    environment: null,
    kind: 'standalone-bold',
    displayMode: false
  },
  {
    name: 'bm alias normalized to boldsymbol',
    input: String.raw`\bm{x}+\textbf{bold}`,
    environment: null,
    kind: 'standalone-bold',
    displayMode: false,
    texPattern: /\\boldsymbol\{x\}/
  },
  {
    name: 'bold and poor mans bold commands',
    input: String.raw`\bold{x}+\pmb{y}`,
    environment: null,
    kind: 'standalone-bold',
    displayMode: false
  }
];

for (const testCase of rawMathCases) {
  const candidate = api.parseRawMathCandidate(testCase.input);
  assert.ok(candidate, `${testCase.name}: candidate must be detected`);
  assert.equal(candidate.environment, testCase.environment, testCase.name);
  assert.equal(candidate.kind, testCase.kind, testCase.name);
  assert.equal(
    candidate.displayMode,
    testCase.displayMode ?? true,
    testCase.name
  );
  assert.equal(candidate.bold, testCase.bold ?? false, testCase.name);

  if (testCase.texPattern) {
    assert.match(candidate.tex, testCase.texPattern, testCase.name);
  }

  const renderedMath = katex.renderToString(candidate.tex, {
    displayMode: candidate.displayMode,
    output: 'htmlAndMathml',
    throwOnError: true,
    strict: 'ignore',
    trust: false,
    maxExpand: 1000,
    maxSize: 20
  });
  assert.match(renderedMath, /class="katex"/, testCase.name);
  assert.match(renderedMath, /<math/, testCase.name);
}

const allSupportedEnvironments = [
  'array', 'darray', 'subarray', 'aligned', 'alignedat', 'gathered', 'split',
  'cases', 'dcases', 'rcases', 'drcases', 'matrix', 'matrix*', 'pmatrix',
  'pmatrix*', 'bmatrix', 'bmatrix*', 'Bmatrix', 'Bmatrix*', 'vmatrix',
  'vmatrix*', 'Vmatrix', 'Vmatrix*', 'smallmatrix', 'equation', 'equation*',
  'align', 'align*', 'alignat', 'alignat*', 'gather', 'gather*', 'CD'
];
assert.deepEqual(
  Array.from(api.RAW_MATH_ENVIRONMENTS).sort(),
  allSupportedEnvironments.slice().sort(),
  'every allowlisted environment must stay in the real KaTeX coverage matrix'
);

const arrayEnvironments = new Set(['array', 'darray']);
const caseEnvironments = new Set(['cases', 'dcases', 'rcases', 'drcases']);
const matrixEnvironments = new Set([
  'matrix', 'matrix*', 'pmatrix', 'pmatrix*', 'bmatrix', 'bmatrix*',
  'Bmatrix', 'Bmatrix*', 'vmatrix', 'vmatrix*', 'Vmatrix', 'Vmatrix*',
  'smallmatrix'
]);
const gatherEnvironments = new Set(['gathered', 'gather', 'gather*']);
const alignedatEnvironments = new Set(['alignedat', 'alignat', 'alignat*']);

for (const environment of allSupportedEnvironments) {
  let argument = '';
  let body = String.raw`a &= \mathbf{b} \\
c &= \boldsymbol{d}`;

  if (arrayEnvironments.has(environment)) {
    argument = '{cc}';
    body = String.raw`a & \mathbf{b} \\
c & d`;
  } else if (environment === 'subarray') {
    argument = '{c}';
    body = String.raw`a \\
\mathbf{b}`;
  } else if (alignedatEnvironments.has(environment)) {
    argument = '{2}';
    body = String.raw`a&=b&c&=\mathbf{d} \\
e&=f&g&=h`;
  } else if (caseEnvironments.has(environment)) {
    body = String.raw`\mathbf{x} & x>0 \\
-x & x\leq0`;
  } else if (matrixEnvironments.has(environment)) {
    argument = environment.endsWith('*') ? '[r]' : '';
    body = String.raw`\mathbf{a} & b \\
c & \boldsymbol{d}`;
  } else if (gatherEnvironments.has(environment)) {
    body = String.raw`a=\mathbf{b} \\
c=\boldsymbol{d}`;
  } else if (/^equation\*?$/.test(environment)) {
    body = String.raw`a+\mathbf{b}=c`;
  } else if (environment === 'CD') {
    body = String.raw`A @>\mathbf{a}>> B \\
@VbVV @AAcA \\
C @>>d> D`;
  }

  const sourceForEnvironment = `begin{${environment}}${argument}\n${body}\nend{${environment}}`;
  const candidate = api.parseRawMathCandidate(sourceForEnvironment);
  assert.ok(candidate, `${environment}: allowlisted candidate must be detected`);
  assert.equal(candidate.environment, environment, environment);
  const rendered = katex.renderToString(candidate.tex, {
    displayMode: true,
    output: 'htmlAndMathml',
    throwOnError: true,
    strict: 'ignore',
    trust: false,
    maxExpand: 1000,
    maxSize: 20
  });
  assert.match(rendered, /class="katex"/, environment);
  assert.match(rendered, /<math/, environment);
}

assert.equal(
  api.parseRawMathCandidate(String.raw`begin{array}{cc}a&b\end{matrix}`),
  null
);
assert.equal(
  api.parseRawMathCandidate(String.raw`begin{tikzpicture}x\end{tikzpicture}`),
  null
);
assert.equal(
  api.parseRawMathCandidate(String.raw`\mathbf{x_{1}`),
  null
);
assert.equal(
  api.parseRawMathCandidate(String.raw`Use \mathbf{x} in this sentence.`),
  null
);
assert.equal(
  api.parseRawMathCandidate(`\\mathbf{${'x'.repeat(12001)}}`),
  null
);
assert.equal(
  api.parseRawMathCandidate(
    String.raw`Explanation before begin{aligned}a&=b\end{aligned}`
  ),
  null
);
assert.equal(
  api.hasRawMathText(
    String.raw`Explanation paragraph
begin{cases}x&1\end{cases}`
  ),
  true
);

const untrustedLink = api.parseRawMathCandidate(
  String.raw`$\href{javascript:alert(1)}{x}$`
);
assert.ok(untrustedLink);
const untrustedHtml = katex.renderToString(untrustedLink.tex, {
  throwOnError: true,
  strict: 'ignore',
  trust: false
});
assert.doesNotMatch(untrustedHtml, /href="javascript:/i);

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

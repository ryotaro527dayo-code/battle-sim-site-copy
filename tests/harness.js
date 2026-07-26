const fs = require('fs');
const path = require('path');

function makeFakeElement(id = '') {
  return {
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    className: '',
    style: {},
    dataset: {},
    options: [],
    appendChild(child) { return child; },
    removeChild() {},
    setAttribute(name, value) { this[name] = value; },
    getAttribute(name) { return this[name] ?? null; },
    addEventListener() {},
    select() {},
    focus() {},
  };
}

function loadBattleSim() {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const inlineScript = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1];
  const fakeElements = new Map();
  const document = {
    documentElement: { lang: '' },
    title: '',
    body: makeFakeElement('body'),
    querySelectorAll() { return []; },
    querySelector() { return null; },
    createElement(tag) { return makeFakeElement(tag); },
    getElementById(id) {
      if (!fakeElements.has(id)) fakeElements.set(id, makeFakeElement(id));
      return fakeElements.get(id);
    },
    execCommand() { return true; },
  };
  const store = new Map();
  const localStorage = {
    setItem(key, value) { store.set(key, String(value)); },
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    clear() { store.clear(); },
  };

  return new Function(
    'document',
    'localStorage',
    'navigator',
    'alert',
    'URL',
    'console',
    `${inlineScript}
return {
  CHARS,
  TEAM_SEL,
  SLOT_STAT,
  OCR_CHAR_IDS,
  ENABLE_QUAKE_HARDEN_LINK_BUG,
  SEAL_BLOCKS_DEFENSE_RAGE_SKILLS,
  getUniqueOcrCharIds,
  buildOcrCharOptions,
  defaultSkillLevels,
  calcNormalRageGain,
  applyOcrResultToSlot,
  simulateBattle6v6,
  withSeededRandom,
};`
  )(
    document,
    localStorage,
    {},
    () => {},
    { revokeObjectURL() {}, createObjectURL() { return ''; } },
    console
  );
}

function beast(id, name, stats, skills) {
  return {
    id,
    name,
    lv: 100,
    stars: 5,
    dur: stats.dur ?? 5000,
    atk: stats.atk ?? 1,
    agi: stats.agi ?? 100,
    will: stats.will ?? 1,
    skills,
  };
}

module.exports = { loadBattleSim, beast };

const assert = require('assert');
const { loadBattleSim } = require('./harness');

const app = loadBattleSim();

app.TEAM_SEL.A[0] = 'kong';
app.SLOT_STAT.A[0] = {
  lv: 75,
  dur: 720,
  atk: 360,
  agi: 359,
  will: 212,
  params: { 'combo.param': 0.77, 'combo.rageCost': 44 },
  skillLevels: { combo: { level: 3, source: 'manual', status: 'active' } },
  disabledSkills: { wild: true },
};

app.applyOcrResultToSlot(
  'A',
  0,
  'kong',
  { lv: 80, dur: 800, atk: 400, agi: 401, will: 222 },
  app.defaultSkillLevels('kong')
);

assert.strictEqual(app.SLOT_STAT.A[0].lv, 80);
assert.strictEqual(app.SLOT_STAT.A[0].dur, 800);
assert.strictEqual(app.SLOT_STAT.A[0].atk, 400);
assert.strictEqual(app.SLOT_STAT.A[0].agi, 401);
assert.strictEqual(app.SLOT_STAT.A[0].will, 222);
assert.strictEqual(app.SLOT_STAT.A[0].params['combo.param'], 0.77);
assert.strictEqual(app.SLOT_STAT.A[0].params['combo.rageCost'], 44);
assert.deepStrictEqual(app.SLOT_STAT.A[0].skillLevels.combo, {
  level: 3,
  source: 'manual',
  status: 'active',
});
assert.deepStrictEqual(app.SLOT_STAT.A[0].disabledSkills, { wild: true });

app.applyOcrResultToSlot(
  'A',
  0,
  'dark_rex',
  { lv: 40, dur: null, atk: 170, agi: undefined, will: 114 },
  app.defaultSkillLevels('dark_rex')
);

assert.strictEqual(app.SLOT_STAT.A[0].params['combo.param'], undefined);
assert.strictEqual(app.SLOT_STAT.A[0].disabledSkills?.wild, undefined);
assert.strictEqual(app.SLOT_STAT.A[0].lv, 40);
assert.strictEqual(app.SLOT_STAT.A[0].atk, 170);
assert.strictEqual(app.SLOT_STAT.A[0].will, 114);
assert.strictEqual(app.SLOT_STAT.A[0].dur, undefined);
assert.strictEqual(app.SLOT_STAT.A[0].agi, undefined);

{
  const unicorn = app.CHARS.holy_light_unicorn;
  assert(unicorn, 'Holy Light Unicorn must be registered');
  assert.deepStrictEqual(
    { lv: unicorn.lv, stars: unicorn.stars, dur: unicorn.dur, atk: unicorn.atk, agi: unicorn.agi, will: unicorn.will },
    { lv: 100, stars: 5, dur: 834, atk: 416, agi: 420, will: 235 }
  );
  assert.deepStrictEqual(
    unicorn.skills.map(skill => skill.effect),
    ['full_power', 'counter', 'heavy_wound']
  );
  assert.deepStrictEqual(app.SKILL_LV4_EFFECTS.holy_light_unicorn, {
    full_power: { rageCost: 60, param: 2.30 },
    counter: { rageCost: 40, param: 0.25 },
    heavy_wound: { param: 0.10 },
  });
  assert(app.getUniqueOcrCharIds().includes('holy_light_unicorn'), 'Holy Light Unicorn must appear in OCR choices');

  const opponent = app.CHARS.gigant;
  const result = app.withSeededRandom(3943, () =>
    app.simulateBattle6v6([unicorn], [opponent], false)
  );
  assert(result && ['A', 'B'].includes(result.winningTeam), 'Holy Light Unicorn must be usable in battle');
}

console.log('ocr preservation ok');

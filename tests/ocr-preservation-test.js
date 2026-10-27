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
    full_power: { rageCost: 60, param: 2.40 },
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

{
  const fullPowerBeasts = Object.values(app.CHARS).filter(char =>
    char.skills?.some(skill => skill.effect === 'full_power')
  );
  assert.strictEqual(fullPowerBeasts.length, 6);
  fullPowerBeasts.forEach(char => {
    const skill = char.skills.find(row => row.effect === 'full_power');
    assert.strictEqual(skill.rageCost, 60, `${char.name} full power rage cost`);
    assert.strictEqual(skill.param, 2.40, `${char.name} full power Lv4 ratio`);
    assert.strictEqual(app.SKILL_LV4_EFFECTS[char.id].full_power.param, 2.40, `${char.name} Lv4 effect table`);
  });

  app.TEAM_SEL.A.splice(0, 2, 'haou_tiger', 'yutyrannus');
  app.SLOT_STAT.A[0] = {
    params: { 'full_power.param': 2.30 },
    skillLevels: { full_power: { level: 4, source: 'default4', status: 'active' } },
  };
  app.SLOT_STAT.A[1] = {
    params: { 'full_power.param': 2.30 },
    skillLevels: { full_power: { level: 2, source: 'manual', status: 'active' } },
  };
  assert.strictEqual(app.migrateFullPowerLv4Defaults(), true);
  assert.strictEqual(app.SLOT_STAT.A[0].params['full_power.param'], 2.40, 'saved Lv4 default must migrate to 240%');
  assert.strictEqual(app.SLOT_STAT.A[1].params['full_power.param'], 2.30, 'saved non-Lv4 value must not be migrated');
}

{
  app.TEAM_SEL.B.splice(0, 6, 'kong', 'dark_rex', 'holy_light_unicorn', '', '', '');
  app.SLOT_STAT.B[0] = {
    lv: 91, stars: 4, dur: 901, atk: 451, agi: 401, will: 231, hp_start: 1234,
    params: { 'combo.param': 0.77 },
    skillLevels: { combo: { level: 3, source: 'manual', status: 'active' } },
    disabledSkills: { wild: true },
  };
  app.SLOT_STAT.B[1] = { lv: 92, dur: 902, params: { 'slow.param': 0.20 } };
  app.SLOT_STAT.B[2] = { lv: 93, dur: 903, params: { 'full_power.param': 2.35 } };
  const movedStats = JSON.parse(JSON.stringify(app.SLOT_STAT.B[0]));

  assert.strictEqual(app.moveTeamSlot('B', 0, 2), true);
  assert.deepStrictEqual(app.TEAM_SEL.B.slice(0, 3), ['dark_rex', 'holy_light_unicorn', 'kong']);
  assert.deepStrictEqual(app.SLOT_STAT.B[2], movedStats, 'all slot stats and skill settings must move with the beast');
  assert.strictEqual(app.SLOT_STAT.B[0].lv, 92);
  assert.strictEqual(app.SLOT_STAT.B[1].lv, 93);
}

console.log('ocr preservation ok');

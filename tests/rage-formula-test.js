const assert = require('assert');
const { loadBattleSim, beast } = require('./harness');

const app = loadBattleSim();

const cases = [
  [66, 19],
  [67, 20],
  [148, 40],
  [186, 49],
  [187, 50],
  [237, 62],
];

for (const [will, expected] of cases) {
  assert.strictEqual(
    app.calcNormalRageGain(will),
    expected,
    `will ${will} should gain ${expected} rage`
  );
}

{
  const attacker = beast('rage_attacker_67', 'Rage Attacker 67', { agi: 200, atk: 100, will: 67, dur: 1000 }, []);
  const defender = beast('rage_defender_66', 'Rage Defender 66', { agi: 100, atk: 1, will: 66, dur: 1 }, []);

  const result = app.withSeededRandom(1, () => app.simulateBattle6v6([attacker], [defender], true));

  assert.strictEqual(result.teamA[0].atkRage, 20, 'normal attack should add attack rage with the measured formula');
  assert.strictEqual(result.teamB[0].defRage, 19, 'normal hit should add defense rage with the measured formula');
}

console.log('rage formula ok');

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { loadBattleSim } = require('../tests/harness');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'search-results-30');
const DRY_RUN_PATH = path.join(OUT_DIR, 'dry-run.json');
const CHECKPOINT_PATH = path.join(OUT_DIR, 'checkpoint.json');
const FINAL_JSON_PATH = path.join(OUT_DIR, 'final-results.json');
const FINAL_CSV_PATH = path.join(OUT_DIR, 'beast-ranking.csv');
const FINAL_REPORT_PATH = path.join(OUT_DIR, 'final-report.md');
const SEED_INFO_PATH = path.join(OUT_DIR, 'seed-info.json');
const PREVIOUS_RESULTS_PATH = path.join(ROOT, 'search-results', 'final-results.json');
const STAGE_RESULT_DIR = path.join(OUT_DIR, 'stages');

const BASE_SEED = 5272026;
const MAX_RETRIES = 3;
const DEFAULT_STATS = Object.freeze({
  lv: 100,
  stars: 5,
  dur: 1000,
  atk: 500,
  agi: 500,
  will: 236,
});

const EXCLUDED_NAMES = Object.freeze([
  '黄棘レックス',
  'ヤングレックス',
  'ミニレックス',
  'ヴェロキラプトル',
  'インフェルノ炎竜',
]);

const EXCLUDED_IDS = Object.freeze([
  'kibarra_rex_50',
  'kibarra_rex',
  'young_rex',
  'mini_rex',
  'velociraptor',
  'inferno_dragon',
]);

const DUPLICATE_IDS = Object.freeze([
  'k_kong',
  'k_kong_100',
  'k_tyrex',
]);

const TARGET_IDS = Object.freeze([
  'kong',
  'dark_rex',
  'ice_ptera',
  'golden_rex',
  'tyrannorex',
  'white_saber',
  'gigant',
  'mineral_rex',
  'haou_tiger',
  'luminous_dragon',
  'ankylosaurus',
  'feather_serpent',
  'quetzalcoatlus',
  'ice_mammoth',
  'yutyrannus',
  'spinosaurus',
  'shadow_unicorn',
  'thunder_dragon',
  'triceratops',
  'crimson_birddrake',
  'wandering_dragon',
  'horned_rex',
  'alphasaurus',
  'black_panther',
  'zephyrax',
  'flame_tail_ptera',
  'azure_stego',
  'thunder_bull',
  'dacentrurus',
  'silver_frost_rex',
]);

const OPPONENT_POOLS = Object.freeze([
  {
    name: '基準編成1',
    ids: ['quetzalcoatlus', 'haou_tiger', 'thunder_dragon', 'horned_rex', 'golden_rex', 'triceratops'],
  },
  {
    name: '基準編成2',
    ids: ['shadow_unicorn', 'ice_mammoth', 'spinosaurus', 'wandering_dragon', 'tyrannorex', 'flame_tail_ptera'],
  },
  {
    name: '基準編成3',
    ids: ['yutyrannus', 'feather_serpent', 'luminous_dragon', 'dark_rex', 'gigant', 'dacentrurus'],
  },
  {
    name: '基準編成4',
    ids: ['mineral_rex', 'zephyrax', 'ice_ptera', 'white_saber', 'ankylosaurus', 'thunder_bull'],
  },
  {
    name: '基準編成5',
    ids: ['crimson_birddrake', 'kong', 'alphasaurus', 'black_panther', 'silver_frost_rex', 'azure_stego'],
  },
]);

const ORDER_PATTERNS = Object.freeze([
  [0, 1, 2, 3, 4, 5],
  [5, 4, 3, 2, 1, 0],
  [1, 3, 5, 0, 2, 4],
  [2, 4, 0, 5, 1, 3],
  [3, 0, 4, 1, 5, 2],
  [4, 2, 1, 5, 3, 0],
  [0, 2, 4, 1, 3, 5],
  [5, 3, 1, 4, 2, 0],
  [1, 0, 3, 2, 5, 4],
  [4, 5, 2, 3, 0, 1],
  [2, 1, 0, 4, 5, 3],
  [3, 5, 4, 0, 1, 2],
]);

const OPPONENT_ORDER_PATTERNS = Object.freeze([
  [0, 1, 2, 3, 4, 5],
  [2, 0, 4, 1, 5, 3],
  [5, 3, 1, 4, 2, 0],
  [1, 4, 0, 3, 5, 2],
  [3, 2, 5, 0, 4, 1],
  [4, 5, 2, 1, 0, 3],
  [0, 3, 1, 5, 2, 4],
  [5, 0, 2, 4, 1, 3],
  [1, 2, 3, 4, 5, 0],
  [4, 3, 0, 2, 1, 5],
  [2, 5, 4, 3, 0, 1],
  [3, 1, 5, 2, 4, 0],
]);

const STAGES = Object.freeze({
  stage1: { candidates: 50000, trials: 10, checkpointEvery: 500 },
  stage2: { candidates: 30000, trials: 20, checkpointEvery: 500 },
  stage3: { candidates: 800, trials: 200, checkpointEvery: 50 },
  stage4: { candidates: 80, trials: 2000, checkpointEvery: 5 },
  final: { candidates: 10, trials: 5000, checkpointEvery: 1 },
  replacement: { candidates: 144, trials: 300, checkpointEvery: 12 },
});

const PLANNED_BATTLES = Object.values(STAGES)
  .reduce((sum, stage) => sum + stage.candidates * stage.trials, 0);

function createMulberry32(seed) {
  let state = seed >>> 0;
  if (state === 0) state = 1;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function withGenerator(generator, callback) {
  const originalRandom = Math.random;
  Math.random = generator;
  try {
    return callback();
  } finally {
    Math.random = originalRandom;
  }
}

function generationRandom(seed, callback) {
  return withGenerator(createMulberry32(seed), callback);
}

function comboKey(ids) {
  return [...ids].sort().join('|');
}

function compareTeams(a, b) {
  if (b.winRate !== a.winRate) return b.winRate - a.winRate;
  if (b.avgAlive !== a.avgAlive) return b.avgAlive - a.avgAlive;
  if (b.avgHp !== a.avgHp) return b.avgHp - a.avgHp;
  return a.key.localeCompare(b.key);
}

function stageSeed(stageName, trial) {
  let hash = BASE_SEED ^ (stageName.length * 2654435761) ^ Math.imul(trial + 1, 2246822519);
  for (let i = 0; i < stageName.length; i++) {
    hash = Math.imul(hash ^ stageName.charCodeAt(i), 3266489917);
  }
  return hash >>> 0;
}

function stageSchedule(stageName, trial) {
  return {
    stage: stageName,
    trial,
    opponentPoolIndex: trial % OPPONENT_POOLS.length,
    candidateOrderPatternIndex: trial % ORDER_PATTERNS.length,
    opponentOrderPatternIndex:
      Math.floor(trial / OPPONENT_POOLS.length) % OPPONENT_ORDER_PATTERNS.length,
    seed: stageSeed(stageName, trial),
  };
}

function randInt(n) {
  return Math.floor(Math.random() * n);
}

function shuffle(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function generateBalancedCombos(count) {
  return generationRandom(BASE_SEED ^ 0xA11CE, () => {
    const adoptionCounts = Object.fromEntries(TARGET_IDS.map(id => [id, 0]));
    const seen = new Set();
    const combos = [];
    let attempts = 0;

    while (combos.length < count && attempts < count * 250) {
      attempts++;
      const picked = [];
      const pool = [...TARGET_IDS];

      for (let slot = 0; slot < 6; slot++) {
        let totalWeight = 0;
        const weights = pool.map(id => {
          const weight = 1 / Math.pow(adoptionCounts[id] + 1, 1.35);
          totalWeight += weight;
          return weight;
        });
        let roll = Math.random() * totalWeight;
        let pickIndex = 0;
        for (; pickIndex < pool.length; pickIndex++) {
          roll -= weights[pickIndex];
          if (roll <= 0) break;
        }
        const [id] = pool.splice(Math.min(pickIndex, pool.length - 1), 1);
        picked.push(id);
      }

      const key = comboKey(picked);
      if (seen.has(key)) continue;
      seen.add(key);
      picked.sort();
      picked.forEach(id => adoptionCounts[id]++);
      combos.push(picked);
    }

    if (combos.length !== count) {
      throw new Error(`Stage 1 candidate generation stopped at ${combos.length}/${count}`);
    }
    return { combos, adoptionCounts, attempts };
  });
}

function randomComboFromBase(base, replaceCount) {
  const keep = shuffle(base).slice(0, 6 - replaceCount);
  const replacements = shuffle(TARGET_IDS.filter(id => !keep.includes(id))).slice(0, replaceCount);
  return [...keep, ...replacements].sort();
}

function generateNeighborCombos(topResults, count) {
  return generationRandom(BASE_SEED ^ 0xBEEF, () => {
    const seen = new Set();
    const combos = [];
    const add = ids => {
      const key = comboKey(ids);
      if (seen.has(key)) return false;
      seen.add(key);
      combos.push([...ids].sort());
      return true;
    };

    topResults.forEach(result => add(result.ids));
    const oneReplacementTarget = Math.min(count, 15750);
    let attempts = 0;
    while (combos.length < oneReplacementTarget && attempts < 800000) {
      attempts++;
      add(randomComboFromBase(topResults[randInt(topResults.length)].ids, 1));
    }
    attempts = 0;
    while (combos.length < count && attempts < 1200000) {
      attempts++;
      add(randomComboFromBase(topResults[randInt(topResults.length)].ids, 2));
    }
    if (combos.length !== count) {
      throw new Error(`Stage 2 candidate generation stopped at ${combos.length}/${count}`);
    }
    return combos;
  });
}

function validateConfiguration(app) {
  const errors = [];
  const targetSet = new Set(TARGET_IDS);
  const opponentIds = OPPONENT_POOLS.flatMap(pool => pool.ids);
  const opponentSet = new Set(opponentIds);
  const excludedIdSet = new Set(EXCLUDED_IDS);
  const duplicateIdSet = new Set(DUPLICATE_IDS);

  if (TARGET_IDS.length !== 30 || targetSet.size !== 30) {
    errors.push(`Target IDs must contain 30 unique entries, got ${TARGET_IDS.length}/${targetSet.size}`);
  }
  for (const id of TARGET_IDS) {
    if (!app.CHARS[id]) errors.push(`Unknown target ID: ${id}`);
    if (excludedIdSet.has(id)) errors.push(`Excluded ID in targets: ${id}`);
    if (duplicateIdSet.has(id)) errors.push(`Duplicate/legacy ID in targets: ${id}`);
    if (EXCLUDED_NAMES.includes(app.CHARS[id]?.name)) {
      errors.push(`Excluded beast name in targets: ${app.CHARS[id].name}`);
    }
  }
  if (OPPONENT_POOLS.length !== 5) errors.push(`Expected 5 opponent pools, got ${OPPONENT_POOLS.length}`);
  for (const pool of OPPONENT_POOLS) {
    if (pool.ids.length !== 6 || new Set(pool.ids).size !== 6) {
      errors.push(`${pool.name} must contain 6 unique beasts`);
    }
  }
  if (opponentIds.length !== 30 || opponentSet.size !== 30) {
    errors.push(`Opponent pools must contain 30 unique slots, got ${opponentIds.length}/${opponentSet.size}`);
  }
  for (const id of opponentIds) {
    if (!targetSet.has(id)) errors.push(`Opponent ID is outside target set: ${id}`);
    if (excludedIdSet.has(id)) errors.push(`Excluded ID in opponents: ${id}`);
    if (duplicateIdSet.has(id)) errors.push(`Duplicate/legacy ID in opponents: ${id}`);
  }
  for (const id of TARGET_IDS) {
    if (!opponentSet.has(id)) errors.push(`Target missing from opponent pools: ${id}`);
  }
  if (PLANNED_BATTLES !== 1513200) {
    errors.push(`Planned battle count must be 1513200, got ${PLANNED_BATTLES}`);
  }
  return errors;
}

function makeBeast(app, id) {
  const beast = structuredClone(app.CHARS[id]);
  Object.assign(beast, DEFAULT_STATS);
  beast.skills = beast.skills.map(skill => {
    const copy = { ...skill };
    const level4 =
      app.SKILL_LV4_EFFECTS[id]?.[copy.effect] ||
      app.SKILL_LEVEL_VALUE_TABLE[copy.effect]?.[4] ||
      {};
    Object.assign(copy, level4);
    copy.level = 4;
    return copy;
  });
  beast.skillLevels = Object.fromEntries(beast.skills.map(skill => [skill.effect, 4]));
  return beast;
}

function orderedTeam(app, ids, pattern) {
  return pattern.map(index => makeBeast(app, ids[index]));
}

function emptyTeamStats(ids, trials) {
  return {
    ids: [...ids],
    key: comboKey(ids),
    trials,
    wins: 0,
    losses: 0,
    draws: 0,
    aliveSum: 0,
    hpSum: 0,
    byOpponent: OPPONENT_POOLS.map(pool => ({
      name: pool.name,
      wins: 0,
      losses: 0,
      draws: 0,
      trials: 0,
    })),
  };
}

function finalizeTeamStats(app, stats) {
  stats.winRate = stats.trials ? stats.wins / stats.trials : 0;
  stats.avgAlive = stats.trials ? stats.aliveSum / stats.trials : 0;
  stats.avgHp = stats.trials ? stats.hpSum / stats.trials : 0;
  stats.names = stats.ids.map(id => app.CHARS[id].name);
  stats.byOpponent = stats.byOpponent.map(item => ({
    ...item,
    winRate: item.trials ? item.wins / item.trials : 0,
  }));
  return stats;
}

function createCounters() {
  return {
    plannedBattles: PLANNED_BATTLES,
    startedBattles: 0,
    completedBattles: 0,
    errorBattles: 0,
    retries: 0,
  };
}

function runBattleWithCounters(app, createTeams, seed, counters) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) counters.retries++;
    counters.startedBattles++;
    try {
      const { teamA, teamB } = createTeams();
      const result = app.withSeededRandom(seed, () =>
        app.simulateBattle6v6(teamA, teamB, false)
      );
      if (!result || !['A', 'B', 'draw'].includes(result.winningTeam)) {
        throw new Error(`Invalid battle result: ${result?.winningTeam}`);
      }
      counters.completedBattles++;
      return result;
    } catch (error) {
      counters.errorBattles++;
      lastError = error;
    }
  }
  throw lastError;
}

function evaluateOne(app, ids, stageName, trials, counters) {
  const stats = emptyTeamStats(ids, trials);
  for (let trial = 0; trial < trials; trial++) {
    const schedule = stageSchedule(stageName, trial);
    const opponent = OPPONENT_POOLS[schedule.opponentPoolIndex];
    const result = runBattleWithCounters(
      app,
      () => ({
        teamA: orderedTeam(
          app,
          ids,
          ORDER_PATTERNS[schedule.candidateOrderPatternIndex]
        ),
        teamB: orderedTeam(
          app,
          opponent.ids,
          OPPONENT_ORDER_PATTERNS[schedule.opponentOrderPatternIndex]
        ),
      }),
      schedule.seed,
      counters
    );
    const opponentStats = stats.byOpponent[schedule.opponentPoolIndex];
    opponentStats.trials++;
    if (result.winningTeam === 'A') {
      stats.wins++;
      opponentStats.wins++;
    } else if (result.winningTeam === 'B') {
      stats.losses++;
      opponentStats.losses++;
    } else {
      stats.draws++;
      opponentStats.draws++;
    }
    const survivors = (result.teamA || []).filter(fighter => fighter.hp > 0);
    stats.aliveSum += survivors.length;
    stats.hpSum += survivors.reduce((sum, fighter) => sum + Math.max(0, fighter.hp), 0);
  }
  return finalizeTeamStats(app, stats);
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2));
  fs.renameSync(tempPath, filePath);
}

function saveCheckpoint(state) {
  writeJsonAtomic(CHECKPOINT_PATH, {
    version: 1,
    savedAt: new Date().toISOString(),
    ...state,
  });
}

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_PATH)) return null;
  return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
}

function stageResultPath(stageName) {
  return path.join(STAGE_RESULT_DIR, `${stageName}.json`);
}

function saveStageResult(stageName, result) {
  writeJsonAtomic(stageResultPath(stageName), result);
}

function loadStageResult(stageName) {
  const filePath = stageResultPath(stageName);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function evaluateStage(app, stageName, combos, counters, resumeCheckpoint = null) {
  const config = STAGES[stageName];
  const resumed =
    resumeCheckpoint?.stage === stageName &&
    Array.isArray(resumeCheckpoint.partialResults);
  const results = resumed ? resumeCheckpoint.partialResults : [];
  const startIndex = resumed ? resumeCheckpoint.completedCandidates : 0;
  const start = performance.now();

  for (let index = startIndex; index < combos.length; index++) {
    results.push(evaluateOne(app, combos[index], stageName, config.trials, counters));
    const completedCandidates = index + 1;
    if (
      completedCandidates % config.checkpointEvery === 0 ||
      completedCandidates === combos.length
    ) {
      saveCheckpoint({
        status: 'running',
        stage: stageName,
        completedCandidates,
        totalCandidates: combos.length,
        partialResults: results,
        counters,
      });
      console.log(JSON.stringify({
        stage: stageName,
        completedCandidates,
        totalCandidates: combos.length,
        counters,
      }));
    }
  }
  results.sort(compareTeams);
  return { results, elapsedMs: performance.now() - start };
}

function evaluateOrResumeStage(
  app,
  stageName,
  combos,
  counters,
  checkpoint,
  resume
) {
  if (resume) {
    const completed = loadStageResult(stageName);
    if (completed) {
      if (completed.results?.length !== combos.length) {
        throw new Error(
          `${stageName} saved result count mismatch: ${completed.results?.length}/${combos.length}`
        );
      }
      return completed;
    }
  }
  const result = evaluateStage(app, stageName, combos, counters, checkpoint);
  saveStageResult(stageName, result);
  return result;
}

function adoption(app, results, limit) {
  const selected = results.slice(0, Math.min(limit, results.length));
  const counts = Object.fromEntries(TARGET_IDS.map(id => [id, 0]));
  selected.forEach(result => result.ids.forEach(id => counts[id]++));
  return TARGET_IDS.map(id => ({
    id,
    name: app.CHARS[id].name,
    count: counts[id],
    rate: selected.length ? counts[id] / selected.length : 0,
  }));
}

function buildBeastRanking(app, finalTop20, stage4Results, stage3Results) {
  const top20 = adoption(app, finalTop20, 20);
  const top50 = adoption(app, stage4Results, 50);
  const top100 = adoption(app, stage3Results, 100);
  const map20 = new Map(top20.map(item => [item.id, item]));
  const map50 = new Map(top50.map(item => [item.id, item]));
  const map100 = new Map(top100.map(item => [item.id, item]));

  const ranking = TARGET_IDS.map(id => {
    const adoptedTop20 = finalTop20.filter(result => result.ids.includes(id));
    const top20Rate = map20.get(id).rate;
    const top50Rate = map50.get(id).rate;
    const top100Rate = map100.get(id).rate;
    return {
      id,
      name: app.CHARS[id].name,
      score: top50Rate * 0.45 + top20Rate * 0.45 + top100Rate * 0.10,
      top20AdoptionRate: top20Rate,
      top50AdoptionRate: top50Rate,
      top100AdoptionRate: top100Rate,
      adoptedTop20Count: adoptedTop20.length,
      adoptedTop20AverageWinRate: adoptedTop20.length
        ? adoptedTop20.reduce((sum, result) => sum + result.winRate, 0) / adoptedTop20.length
        : 0,
      adoptedTop20AverageAlive: adoptedTop20.length
        ? adoptedTop20.reduce((sum, result) => sum + result.avgAlive, 0) / adoptedTop20.length
        : 0,
      adoptedTop20AverageHp: adoptedTop20.length
        ? adoptedTop20.reduce((sum, result) => sum + result.avgHp, 0) / adoptedTop20.length
        : 0,
    };
  });

  ranking.sort((a, b) =>
    b.score - a.score ||
    b.top20AdoptionRate - a.top20AdoptionRate ||
    b.top50AdoptionRate - a.top50AdoptionRate ||
    b.top100AdoptionRate - a.top100AdoptionRate ||
    b.adoptedTop20AverageWinRate - a.adoptedTop20AverageWinRate ||
    a.name.localeCompare(b.name, 'ja')
  );
  ranking.forEach((item, index) => {
    item.rank = index + 1;
  });
  return ranking;
}

function buildPreviousRanking(app) {
  if (!fs.existsSync(PREVIOUS_RESULTS_PATH)) return [];
  const previous = JSON.parse(fs.readFileSync(PREVIOUS_RESULTS_PATH, 'utf8'));
  const adoptionSets = previous.adoption || {};
  const maps = Object.fromEntries(
    ['top20', 'top50', 'top100'].map(key => [
      key,
      new Map((adoptionSets[key] || []).map(item => [item.id, item.rate])),
    ])
  );
  const ranking = TARGET_IDS
    .filter(id => maps.top50.has(id))
    .map(id => ({
      id,
      name: app.CHARS[id].name,
      score:
        (maps.top50.get(id) || 0) * 0.45 +
        (maps.top20.get(id) || 0) * 0.45 +
        (maps.top100.get(id) || 0) * 0.10,
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ja'));
  ranking.forEach((item, index) => {
    item.rank = index + 1;
  });
  return ranking;
}

function createReplacementCombos(bestTeam) {
  const combos = [];
  const outside = TARGET_IDS.filter(id => !bestTeam.ids.includes(id));
  for (const addId of outside) {
    for (let slot = 0; slot < bestTeam.ids.length; slot++) {
      const ids = [...bestTeam.ids];
      const removeId = ids[slot];
      ids[slot] = addId;
      combos.push({
        ids: ids.sort(),
        removeId,
        addId,
      });
    }
  }
  if (combos.length !== STAGES.replacement.candidates) {
    throw new Error(`Expected 144 replacement candidates, got ${combos.length}`);
  }
  return combos;
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeFinalOutputs(payload) {
  writeJsonAtomic(FINAL_JSON_PATH, payload);
  writeJsonAtomic(SEED_INFO_PATH, payload.seedInfo);

  const previousMap = new Map(payload.previousRanking.map(item => [item.id, item.rank]));
  const csvRows = [[
    'rank',
    'name',
    'score',
    'top20AdoptionRate',
    'top50AdoptionRate',
    'top100AdoptionRate',
    'adoptedTop20AverageWinRate',
    'previousRank',
    'rankDelta',
  ]];
  payload.beastRanking.forEach(item => {
    const previousRank = previousMap.get(item.id) || '';
    csvRows.push([
      item.rank,
      item.name,
      item.score.toFixed(6),
      item.top20AdoptionRate.toFixed(6),
      item.top50AdoptionRate.toFixed(6),
      item.top100AdoptionRate.toFixed(6),
      item.adoptedTop20AverageWinRate.toFixed(6),
      previousRank,
      previousRank ? previousRank - item.rank : '',
    ]);
  });
  fs.writeFileSync(
    FINAL_CSV_PATH,
    csvRows.map(row => row.map(csvEscape).join(',')).join('\n')
  );

  const report = [
    '# 猛獣育成優先度探索 30体版',
    '',
    `- 実行日時: ${payload.finishedAt}`,
    `- 予定戦闘数: ${payload.counters.plannedBattles.toLocaleString()}`,
    `- 開始戦闘数: ${payload.counters.startedBattles.toLocaleString()}`,
    `- 正常完了戦闘数: ${payload.counters.completedBattles.toLocaleString()}`,
    `- エラー戦闘数: ${payload.counters.errorBattles.toLocaleString()}`,
    `- 再試行数: ${payload.counters.retries.toLocaleString()}`,
    `- 実行時間: ${(payload.elapsedMs / 60000).toFixed(2)}分`,
    '',
    '## 猛獣ランキング',
    '|順位|猛獣|評価点|Top20|Top50|Top100|上位20採用編成の平均勝率|',
    '|---:|---|---:|---:|---:|---:|---:|',
    ...payload.beastRanking.map(item =>
      `|${item.rank}|${item.name}|${(item.score * 100).toFixed(2)}|` +
      `${(item.top20AdoptionRate * 100).toFixed(1)}%|` +
      `${(item.top50AdoptionRate * 100).toFixed(1)}%|` +
      `${(item.top100AdoptionRate * 100).toFixed(1)}%|` +
      `${(item.adoptedTop20AverageWinRate * 100).toFixed(2)}%|`
    ),
  ];
  fs.writeFileSync(FINAL_REPORT_PATH, report.join('\n'));
}

function buildSeedInfo() {
  return {
    baseSeed: BASE_SEED,
    generator: 'mulberry32',
    formula: 'stageSeed(stageName, trial)',
    commonRandomNumbers:
      'Within a stage, every candidate uses the same seed, opponent order, and placement indexes for the same trial index.',
    stages: Object.fromEntries(
      Object.entries(STAGES).map(([stageName, config]) => [
        stageName,
        Array.from({ length: config.trials }, (_, trial) => stageSchedule(stageName, trial)),
      ])
    ),
  };
}

function runDryRun() {
  const app = loadBattleSim();
  const errors = validateConfiguration(app);
  if (errors.length) throw new Error(errors.join('\n'));

  const generated = generateBalancedCombos(STAGES.stage1.candidates);
  const adoptionValues = Object.values(generated.adoptionCounts);
  const averageAdoptions =
    adoptionValues.reduce((sum, value) => sum + value, 0) / adoptionValues.length;
  const targetNames = TARGET_IDS.map(id => app.CHARS[id].name);
  const opponentPools = OPPONENT_POOLS.map(pool => ({
    name: pool.name,
    ids: pool.ids,
    names: pool.ids.map(id => app.CHARS[id].name),
  }));
  const duplicateOrLegacyIds = [...TARGET_IDS, ...OPPONENT_POOLS.flatMap(pool => pool.ids)]
    .filter(id => DUPLICATE_IDS.includes(id));
  const excludedInTargets = TARGET_IDS.filter(id => EXCLUDED_IDS.includes(id));
  const excludedInOpponents = OPPONENT_POOLS
    .flatMap(pool => pool.ids)
    .filter(id => EXCLUDED_IDS.includes(id));
  const probeSeed = stageSeed('stage1', 0);
  const randomProbeA = app.withSeededRandom(
    probeSeed,
    () => Array.from({ length: 12 }, () => Math.random())
  );
  const randomProbeB = app.withSeededRandom(
    probeSeed,
    () => Array.from({ length: 12 }, () => Math.random())
  );

  const result = {
    generatedAt: new Date().toISOString(),
    status: 'dry-run-complete',
    fullSearchStarted: false,
    targetCount: TARGET_IDS.length,
    targets: TARGET_IDS.map(id => ({ id, name: app.CHARS[id].name })),
    excludedNames: EXCLUDED_NAMES,
    excludedIds: EXCLUDED_IDS,
    duplicateIds: DUPLICATE_IDS,
    excludedInTargets,
    excludedInOpponents,
    duplicateOrLegacyIds,
    opponentPools,
    opponentPoolSlotCount: opponentPools.reduce((sum, pool) => sum + pool.ids.length, 0),
    opponentPoolUniqueCount: new Set(OPPONENT_POOLS.flatMap(pool => pool.ids)).size,
    stage1: {
      candidates: generated.combos.length,
      attempts: generated.attempts,
      totalAdoptions: adoptionValues.reduce((sum, value) => sum + value, 0),
      expectedAverageAdoptions: averageAdoptions,
      minAdoptions: Math.min(...adoptionValues),
      maxAdoptions: Math.max(...adoptionValues),
      spread: Math.max(...adoptionValues) - Math.min(...adoptionValues),
      adoptionCounts: Object.fromEntries(
        TARGET_IDS.map(id => [app.CHARS[id].name, generated.adoptionCounts[id]])
      ),
      allTeamsHaveSixUniqueBeasts: generated.combos.every(
        ids => ids.length === 6 && new Set(ids).size === 6
      ),
      uniqueCandidateCount: new Set(generated.combos.map(comboKey)).size,
    },
    stages: STAGES,
    plannedBattles: PLANNED_BATTLES,
    countersAtDryRun: createCounters(),
    fixedStats: DEFAULT_STATS,
    skillLevel: 4,
    orderPatterns: {
      candidate: ORDER_PATTERNS.length,
      opponent: OPPONENT_ORDER_PATTERNS.length,
    },
    scheduleSamples: {
      stage1: Array.from({ length: STAGES.stage1.trials }, (_, trial) =>
        stageSchedule('stage1', trial)
      ),
      reproducibilityCheck: randomProbeA.every(
        (value, index) => value === randomProbeB[index]
      ),
      randomSequenceProbe: {
        seed: probeSeed,
        sequence: randomProbeA,
      },
    },
    scoreFormula:
      'top50AdoptionRate * 0.45 + top20AdoptionRate * 0.45 + top100AdoptionRate * 0.10',
    outputPaths: {
      dryRun: DRY_RUN_PATH,
      checkpoint: CHECKPOINT_PATH,
      finalJson: FINAL_JSON_PATH,
      finalCsv: FINAL_CSV_PATH,
      finalReport: FINAL_REPORT_PATH,
      seedInfo: SEED_INFO_PATH,
      stageResults: STAGE_RESULT_DIR,
    },
    resumeCommand: 'node ranking/beast-priority-search-30.js --run --resume',
    targetNames,
  };
  writeJsonAtomic(DRY_RUN_PATH, result);
  return result;
}

function runFullSearch({ resume = false } = {}) {
  const app = loadBattleSim();
  const errors = validateConfiguration(app);
  if (errors.length) throw new Error(errors.join('\n'));

  if (!resume) {
    fs.rmSync(STAGE_RESULT_DIR, { recursive: true, force: true });
    fs.rmSync(CHECKPOINT_PATH, { force: true });
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const checkpoint = resume ? loadCheckpoint() : null;
  const counters = checkpoint?.counters || createCounters();
  const start = performance.now();

  const stage1Generated = generateBalancedCombos(STAGES.stage1.candidates);
  const stage1 = evaluateOrResumeStage(
    app,
    'stage1',
    stage1Generated.combos,
    counters,
    checkpoint,
    resume
  );
  const stage2Combos = generateNeighborCombos(
    stage1.results.slice(0, STAGES.stage3.candidates),
    STAGES.stage2.candidates
  );
  const stage2 = evaluateOrResumeStage(
    app,
    'stage2',
    stage2Combos,
    counters,
    checkpoint,
    resume
  );
  const stage3 = evaluateOrResumeStage(
    app,
    'stage3',
    stage2.results.slice(0, STAGES.stage3.candidates).map(result => result.ids),
    counters,
    checkpoint,
    resume
  );
  const stage4 = evaluateOrResumeStage(
    app,
    'stage4',
    stage3.results.slice(0, STAGES.stage4.candidates).map(result => result.ids),
    counters,
    checkpoint,
    resume
  );
  const finalStage = evaluateOrResumeStage(
    app,
    'final',
    stage4.results.slice(0, STAGES.final.candidates).map(result => result.ids),
    counters,
    checkpoint,
    resume
  );

  const finalByKey = new Map(finalStage.results.map(result => [result.key, result]));
  const finalTop20 = stage4.results
    .slice(0, 20)
    .map(result => finalByKey.get(result.key) || result)
    .sort(compareTeams);

  const replacements = createReplacementCombos(finalTop20[0]);
  const replacementStage = evaluateOrResumeStage(
    app,
    'replacement',
    replacements.map(item => item.ids),
    counters,
    checkpoint,
    resume
  );
  const replacementResults = replacementStage.results.map(result => {
    const source = replacements.find(item => comboKey(item.ids) === result.key);
    return {
      ...result,
      removeId: source?.removeId || null,
      removeName: source ? app.CHARS[source.removeId].name : null,
      addId: source?.addId || null,
      addName: source ? app.CHARS[source.addId].name : null,
      delta: result.winRate - finalTop20[0].winRate,
    };
  });

  const beastRanking = buildBeastRanking(app, finalTop20, stage4.results, stage3.results);
  const previousRanking = buildPreviousRanking(app);
  const previousRankMap = new Map(previousRanking.map(item => [item.id, item.rank]));
  beastRanking.forEach(item => {
    item.previousRank = previousRankMap.get(item.id) || null;
    item.rankDelta = item.previousRank ? item.previousRank - item.rank : null;
  });

  if (counters.completedBattles !== PLANNED_BATTLES) {
    throw new Error(
      `Completed battle count mismatch: ${counters.completedBattles}/${PLANNED_BATTLES}`
    );
  }

  const payload = {
    finishedAt: new Date().toISOString(),
    elapsedMs: performance.now() - start,
    config: {
      targets: TARGET_IDS,
      excludedNames: EXCLUDED_NAMES,
      excludedIds: EXCLUDED_IDS,
      duplicateIds: DUPLICATE_IDS,
      fixedStats: DEFAULT_STATS,
      skillLevel: 4,
      opponentPools: OPPONENT_POOLS,
      stages: STAGES,
      baseSeed: BASE_SEED,
    },
    counters,
    stageSummary: {
      stage1: { candidates: stage1.results.length, trials: STAGES.stage1.trials },
      stage2: { candidates: stage2.results.length, trials: STAGES.stage2.trials },
      stage3: { candidates: stage3.results.length, trials: STAGES.stage3.trials },
      stage4: { candidates: stage4.results.length, trials: STAGES.stage4.trials },
      final: { candidates: finalStage.results.length, trials: STAGES.final.trials },
      replacement: {
        candidates: replacementResults.length,
        trials: STAGES.replacement.trials,
      },
    },
    beastRanking,
    previousRanking,
    finalTop20,
    finalTop10: finalStage.results,
    replacementImpact: replacementResults.sort((a, b) => a.delta - b.delta),
    seedInfo: buildSeedInfo(),
  };

  writeFinalOutputs(payload);
  saveCheckpoint({
    status: 'complete',
    stage: 'complete',
    completedCandidates: 0,
    totalCandidates: 0,
    partialResults: [],
    counters,
  });
  return payload;
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--run')) {
    const result = runFullSearch({ resume: args.has('--resume') });
    console.log(JSON.stringify({
      status: 'complete',
      counters: result.counters,
      finalJson: FINAL_JSON_PATH,
      finalCsv: FINAL_CSV_PATH,
      finalReport: FINAL_REPORT_PATH,
    }, null, 2));
    return;
  }
  const result = runDryRun();
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  BASE_SEED,
  DEFAULT_STATS,
  EXCLUDED_NAMES,
  EXCLUDED_IDS,
  DUPLICATE_IDS,
  TARGET_IDS,
  OPPONENT_POOLS,
  ORDER_PATTERNS,
  OPPONENT_ORDER_PATTERNS,
  STAGES,
  PLANNED_BATTLES,
  comboKey,
  stageSeed,
  stageSchedule,
  generateBalancedCombos,
  generateNeighborCombos,
  validateConfiguration,
  createCounters,
  runBattleWithCounters,
  buildBeastRanking,
  runDryRun,
  runFullSearch,
};

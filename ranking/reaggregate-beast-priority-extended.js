const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RESULTS_DIR = path.join(ROOT, 'search-results-30');
const FINAL_RESULTS_PATH = path.join(RESULTS_DIR, 'final-results.json');
const STAGE1_PATH = path.join(RESULTS_DIR, 'stages', 'stage1.json');
const STAGE3_PATH = path.join(RESULTS_DIR, 'stages', 'stage3.json');
const CSV_PATH = path.join(RESULTS_DIR, 'beast-ranking-extended.csv');
const REPORT_PATH = path.join(RESULTS_DIR, 'final-report-extended.md');

const EXPECTED_STAGE1_RESULTS = 50000;
const EXPECTED_STAGE3_RESULTS = 800;
const SCORE_FORMULA =
  'top20AdoptionRate * 0.40 + top50AdoptionRate * 0.30 + ' +
  'top100AdoptionRate * 0.15 + top800AdoptionRate * 0.10 + ' +
  'stage1PerformanceIndex * 0.05';

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required saved result is missing: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateStage(stage, expectedCount, expectedTrials, label) {
  if (!Array.isArray(stage.results) || stage.results.length !== expectedCount) {
    throw new Error(
      `${label} result count mismatch: ${stage.results?.length}/${expectedCount}`
    );
  }
  for (const result of stage.results) {
    if (
      !Array.isArray(result.ids) ||
      result.ids.length !== 6 ||
      result.trials !== expectedTrials ||
      !Number.isFinite(result.winRate) ||
      !Number.isFinite(result.avgAlive) ||
      !Number.isFinite(result.avgHp)
    ) {
      throw new Error(`${label} contains an incomplete result: ${result.key || 'unknown'}`);
    }
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function adoption(results, beastIds) {
  const counts = Object.fromEntries(beastIds.map(id => [id, 0]));
  for (const result of results) {
    for (const id of result.ids) {
      if (Object.hasOwn(counts, id)) counts[id]++;
    }
  }
  return counts;
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatRate(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function calculateExtendedRanking(finalResults, stage1, stage3) {
  const oldRanking = finalResults.beastRanking;
  if (!Array.isArray(oldRanking) || oldRanking.length !== 30) {
    throw new Error(`Expected 30 old ranking entries, got ${oldRanking?.length}`);
  }
  const beastIds = oldRanking.map(item => item.id);
  const oldById = new Map(oldRanking.map(item => [item.id, item]));
  const top800Counts = adoption(stage3.results, beastIds);

  const stage1Stats = beastIds.map(id => {
    const adopted = stage1.results.filter(result => result.ids.includes(id));
    if (!adopted.length) throw new Error(`No Stage 1 result includes beast: ${id}`);
    return {
      id,
      stage1AdoptedTeamCount: adopted.length,
      beastStage1AvgWinRate:
        adopted.reduce((sum, result) => sum + result.winRate, 0) / adopted.length,
      beastStage1MedianWinRate: median(adopted.map(result => result.winRate)),
      beastStage1AvgAlive:
        adopted.reduce((sum, result) => sum + result.avgAlive, 0) / adopted.length,
      beastStage1AvgHp:
        adopted.reduce((sum, result) => sum + result.avgHp, 0) / adopted.length,
    };
  });
  const minStage1AvgWinRate = Math.min(
    ...stage1Stats.map(item => item.beastStage1AvgWinRate)
  );
  const maxStage1AvgWinRate = Math.max(
    ...stage1Stats.map(item => item.beastStage1AvgWinRate)
  );
  const stage1Range = maxStage1AvgWinRate - minStage1AvgWinRate;

  const ranking = stage1Stats.map(stats => {
    const old = oldById.get(stats.id);
    const top20AdoptionRate = old.top20AdoptionRate;
    const top50AdoptionRate = old.top50AdoptionRate;
    const top100AdoptionRate = old.top100AdoptionRate;
    const top800AdoptionRate = top800Counts[stats.id] / 800;
    const stage1PerformanceIndex = stage1Range
      ? (stats.beastStage1AvgWinRate - minStage1AvgWinRate) / stage1Range
      : 0;
    const newScore =
      top20AdoptionRate * 0.40 +
      top50AdoptionRate * 0.30 +
      top100AdoptionRate * 0.15 +
      top800AdoptionRate * 0.10 +
      stage1PerformanceIndex * 0.05;
    return {
      id: stats.id,
      name: old.name,
      newScore,
      newScorePoints: newScore * 100,
      displayedNewScorePoints: Math.max(newScore * 100, 0.01),
      oldScore: old.score,
      oldScorePoints: old.score * 100,
      oldRank: old.rank,
      top20AdoptionCount: old.top20AdoptionCount,
      top20AdoptionRate,
      top50AdoptionCount: old.top50AdoptionCount,
      top50AdoptionRate,
      top100AdoptionCount: old.top100AdoptionCount,
      top100AdoptionRate,
      top800AdoptionCount: top800Counts[stats.id],
      top800AdoptionRate,
      stage1PerformanceIndex,
      ...stats,
    };
  });

  ranking.sort((a, b) =>
    b.newScore - a.newScore ||
    b.stage1PerformanceIndex - a.stage1PerformanceIndex ||
    b.top20AdoptionRate - a.top20AdoptionRate ||
    b.top50AdoptionRate - a.top50AdoptionRate ||
    b.top100AdoptionRate - a.top100AdoptionRate ||
    b.top800AdoptionRate - a.top800AdoptionRate ||
    b.beastStage1MedianWinRate - a.beastStage1MedianWinRate ||
    a.name.localeCompare(b.name, 'ja')
  );
  ranking.forEach((item, index) => {
    item.newRank = index + 1;
    item.rankDelta = item.oldRank - item.newRank;
  });

  return {
    ranking,
    minStage1AvgWinRate,
    maxStage1AvgWinRate,
  };
}

function writeOutputs(result) {
  const headers = [
    'newRank',
    'name',
    'newScorePoints',
    'oldScorePoints',
    'rankDelta',
    'oldRank',
    'top20AdoptionCount',
    'top20AdoptionRate',
    'top50AdoptionCount',
    'top50AdoptionRate',
    'top100AdoptionCount',
    'top100AdoptionRate',
    'top800AdoptionCount',
    'top800AdoptionRate',
    'stage1AdoptedTeamCount',
    'beastStage1AvgWinRate',
    'beastStage1MedianWinRate',
    'beastStage1AvgAlive',
    'beastStage1AvgHp',
    'stage1PerformanceIndex',
  ];
  const csvRows = [headers];
  for (const item of result.ranking) {
    csvRows.push([
      item.newRank,
      item.name,
      item.displayedNewScorePoints.toFixed(2),
      item.oldScorePoints.toFixed(2),
      item.rankDelta,
      item.oldRank,
      item.top20AdoptionCount,
      item.top20AdoptionRate.toFixed(8),
      item.top50AdoptionCount,
      item.top50AdoptionRate.toFixed(8),
      item.top100AdoptionCount,
      item.top100AdoptionRate.toFixed(8),
      item.top800AdoptionCount,
      item.top800AdoptionRate.toFixed(8),
      item.stage1AdoptedTeamCount,
      item.beastStage1AvgWinRate.toFixed(8),
      item.beastStage1MedianWinRate.toFixed(8),
      item.beastStage1AvgAlive.toFixed(8),
      item.beastStage1AvgHp.toFixed(4),
      item.stage1PerformanceIndex.toFixed(8),
    ]);
  }
  fs.writeFileSync(
    CSV_PATH,
    csvRows.map(row => row.map(csvEscape).join(',')).join('\n')
  );

  const report = [
    '# 猛獣育成優先度 30体版 拡張再集計',
    '',
    `- 生成日時: ${new Date().toISOString()}`,
    '- 戦闘再実行: なし',
    '- 使用データ: 保存済みStage 1（50,000編成）・Stage 3（800編成）',
    `- 新評価式: \`${SCORE_FORMULA}\``,
    `- Stage 1平均勝率の最小値: ${formatRate(result.minStage1AvgWinRate)}`,
    `- Stage 1平均勝率の最大値: ${formatRate(result.maxStage1AvgWinRate)}`,
    '- 順位差: 旧順位 - 新順位（正数は順位上昇）',
    '- 計算上0点の場合のみ表示値を0.01点とし、順位は丸め前newScoreで決定',
    '',
    '## 拡張育成優先度',
    '',
    '|新順位|猛獣|新評価点|旧評価点|順位差|Top20|Top50|Top100|Top800|Stage 1平均勝率|性能指数|',
    '|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...result.ranking.map(item =>
      `|${item.newRank}|${item.name}|${item.displayedNewScorePoints.toFixed(2)}|` +
      `${item.oldScorePoints.toFixed(2)}|${item.rankDelta > 0 ? '+' : ''}${item.rankDelta}|` +
      `${item.top20AdoptionCount}/20 (${formatRate(item.top20AdoptionRate)})|` +
      `${item.top50AdoptionCount}/50 (${formatRate(item.top50AdoptionRate)})|` +
      `${item.top100AdoptionCount}/100 (${formatRate(item.top100AdoptionRate)})|` +
      `${item.top800AdoptionCount}/800 (${formatRate(item.top800AdoptionRate)})|` +
      `${formatRate(item.beastStage1AvgWinRate)}|` +
      `${item.stage1PerformanceIndex.toFixed(6)}|`
    ),
    '',
    '## Stage 1安定性',
    '',
    '|猛獣|採用編成数|平均勝率|勝率中央値|平均生存数|平均残HP|',
    '|---|---:|---:|---:|---:|---:|',
    ...result.ranking.map(item =>
      `|${item.name}|${item.stage1AdoptedTeamCount}|` +
      `${formatRate(item.beastStage1AvgWinRate)}|` +
      `${formatRate(item.beastStage1MedianWinRate)}|` +
      `${item.beastStage1AvgAlive.toFixed(4)}|${item.beastStage1AvgHp.toFixed(2)}|`
    ),
  ];
  fs.writeFileSync(REPORT_PATH, report.join('\n'));
}

function main() {
  const finalResults = readJson(FINAL_RESULTS_PATH);
  const stage1 = readJson(STAGE1_PATH);
  const stage3 = readJson(STAGE3_PATH);
  validateStage(stage1, EXPECTED_STAGE1_RESULTS, 10, 'Stage 1');
  validateStage(stage3, EXPECTED_STAGE3_RESULTS, 200, 'Stage 3');
  const result = calculateExtendedRanking(finalResults, stage1, stage3);
  writeOutputs(result);
  console.log(JSON.stringify({
    status: 'complete',
    battlesExecuted: 0,
    rankingCount: result.ranking.length,
    uniqueRawScores: new Set(result.ranking.map(item => item.newScore)).size,
    csv: CSV_PATH,
    report: REPORT_PATH,
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  SCORE_FORMULA,
  calculateExtendedRanking,
  median,
  validateStage,
};

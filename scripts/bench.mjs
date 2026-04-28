// Usage: node scripts/bench.mjs [games] [thinkMs] [agent0] [agent1]
//   games   — number of games to play (default 20)
//   thinkMs — MCTS think time per move in ms (default 500); used for mcts/mcts2
//   agent0  — greedy | random | mcts | mcts2  (default mcts2)
//   agent1  — greedy | random | mcts | mcts2  (default greedy)
//
// Examples:
//   node scripts/bench.mjs 50 500 mcts2 greedy
//   node scripts/bench.mjs 50 500 mcts greedy
//   node scripts/bench.mjs 50 500 mcts2 mcts

import { OmakaseEnv } from '../web/engine/env.js';
import { SimpleGreedyAgent, RandomAgent } from '../web/agents/greedy.js';
import { ISMCTSAgent } from '../web/agents/mcts.js';
import { ISMCTSAgentV2 } from '../web/agents/mcts2.js';
import { scoreBreakdown } from '../web/engine/scoring.js';

const N_GAMES   = parseInt(process.argv[2] ?? '20', 10);
const THINK_MS  = parseInt(process.argv[3] ?? '500', 10);
const AGENT0_ID = process.argv[4] ?? 'mcts2';
const AGENT1_ID = process.argv[5] ?? 'greedy';

function makeAgent(id) {
  if (id === 'greedy')  return new SimpleGreedyAgent();
  if (id === 'random')  return new RandomAgent();
  if (id === 'mcts')    return new ISMCTSAgent({ timeBudgetMs: THINK_MS });
  if (id === 'mcts2')   return new ISMCTSAgentV2({ timeBudgetMs: THINK_MS });
  throw new Error(`Unknown agent: ${id}`);
}

const agentA = makeAgent(AGENT0_ID);
const agentB = makeAgent(AGENT1_ID);

const SET_NAMES = ['Omakase Set', 'Sakura Set', 'Ume Set', 'Kids Set'];

const meta = {
  a: { sets: Object.fromEntries(SET_NAMES.map(n => [n, 0])), checks: 0, winCards: {} },
  b: { sets: Object.fromEntries(SET_NAMES.map(n => [n, 0])), checks: 0, winCards: {} },
};
let totalTurns = 0;
let neitherChecked = 0;

let aWins = 0, bWins = 0, draws = 0;
let totalAScore = 0, totalBScore = 0;

for (let g = 0; g < N_GAMES; g++) {
  const env = new OmakaseEnv(2);
  env.reset(g);

  // Alternate who sits at seat 0 each game for fairness
  const aIdx = g % 2;
  const bIdx = 1 - aIdx;

  while (!env.state.gameOver) {
    const legal = env.getLegalActions();
    const agent = env.state.currentPlayer === aIdx ? agentA : agentB;
    env.step(agent.chooseAction(env, legal));
  }

  const results = env.getGameResults();
  const as = results[aIdx] ?? 0;
  const bs = results[bIdx] ?? 0;
  totalAScore += as;
  totalBScore += bs;

  if      (as > bs) aWins++;
  else if (bs > as) bWins++;
  else              draws++;

  // Metadata
  totalTurns += env.turnCount;

  for (const [slot, pIdx] of [['a', aIdx], ['b', bIdx]]) {
    const lines = scoreBreakdown(env.state.players[pIdx].hand);
    for (const line of lines) {
      if (SET_NAMES.includes(line.label)) meta[slot].sets[line.label]++;
    }
  }

  const aChecked = env.state.players[aIdx].hasCalledCheck;
  const bChecked = env.state.players[bIdx].hasCalledCheck;
  if (aChecked) meta.a.checks++;
  if (bChecked) meta.b.checks++;
  if (!aChecked && !bChecked) neitherChecked++;

  const winSlot = as > bs ? 'a' : (bs > as ? 'b' : null);
  if (winSlot) {
    const winPIdx = winSlot === 'a' ? aIdx : bIdx;
    for (const c of env.state.players[winPIdx].hand) {
      const type = c.isSushi ? c.sushiCard : c.actionCard;
      meta[winSlot].winCards[type] = (meta[winSlot].winCards[type] ?? 0) + 1;
    }
  }

  const pct = (100 * (g + 1) / N_GAMES).toFixed(0);
  process.stdout.write(
    `\r[${pct.padStart(3)}%] game ${g+1}/${N_GAMES}  ${AGENT0_ID} ${aWins}W  ${AGENT1_ID} ${bWins}W  Draws ${draws}`
  );
}

console.log('\n');
console.log(`Games:  ${N_GAMES}  (think time: ${THINK_MS}ms)`);
console.log(`${AGENT0_ID.padEnd(8)} wins: ${aWins}  (${(100*aWins/N_GAMES).toFixed(1)}%)  avg score: ${(totalAScore/N_GAMES).toFixed(0)}`);
console.log(`${AGENT1_ID.padEnd(8)} wins: ${bWins}  (${(100*bWins/N_GAMES).toFixed(1)}%)  avg score: ${(totalBScore/N_GAMES).toFixed(0)}`);
console.log(`Draws:  ${draws}`);

function cardLabel(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

console.log('\n─── Sets Achieved ───');
console.log(`${''.padEnd(18)} ${AGENT0_ID.padEnd(10)} ${AGENT1_ID}`);
for (const name of SET_NAMES) {
  console.log(`  ${name.padEnd(16)} ${String(meta.a.sets[name]).padEnd(10)} ${meta.b.sets[name]}`);
}

console.log('\n─── Check Called ───');
console.log(`  ${AGENT0_ID}: ${meta.a.checks}/${N_GAMES} (${(100*meta.a.checks/N_GAMES).toFixed(0)}%)`
          + `    ${AGENT1_ID}: ${meta.b.checks}/${N_GAMES} (${(100*meta.b.checks/N_GAMES).toFixed(0)}%)`
          + `    Neither: ${neitherChecked}`);

console.log(`\n─── Avg Turns per Game ───  ${(totalTurns / N_GAMES).toFixed(1)}`);

for (const [slot, id] of [['a', AGENT0_ID], ['b', AGENT1_ID]]) {
  const sorted = Object.entries(meta[slot].winCards)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 8)
    .map(([k, v]) => `${cardLabel(k)} ×${v}`)
    .join(', ');
  console.log(`\n─── Top Cards in ${id} Wins ───`);
  console.log(`  ${sorted || '(no wins)'}`);
}

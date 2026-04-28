import { performance } from 'perf_hooks';
import { OmakaseEnv, MAX_BELT_SIZE } from '../web/engine/env.js';
import { Phase } from '../web/engine/gameState.js';
import { SimpleGreedyAgent } from '../web/agents/greedy.js';
import { ISMCTSAgentV2 } from '../web/agents/mcts2.js';

const SIMS = parseInt(process.argv[2] ?? '1000', 10);

const agentA = new ISMCTSAgentV2({ nSimulations: SIMS, timeBudgetMs: 0 });
const agentB = new SimpleGreedyAgent();

const env = new OmakaseEnv(2);
env.reset(0);

const names = ['mcts2', 'greedy'];

function cardName(c) {
  const raw = c.isSushi ? c.sushiCard : c.actionCard;
  return raw.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
}

function isPassive(c) {
  return !c.isSushi && (c.actionCard === 'wasabi' || c.actionCard === 'shoyu' || c.actionCard === 'ginger');
}

function decodeAction(state, action) {
  const { phase } = state;
  const player = state.players[state.currentPlayer];

  if (phase === Phase.PHASE_1 || phase === Phase.PHASE_3) {
    if (action === 0) return 'skip';
    const playable = player.hand.filter(c => !c.isSushi && !isPassive(c));
    return `play ${cardName(playable[action - 1])}`;
  }
  if (phase === Phase.PHASE_2) {
    const hIdx = Math.floor(action / MAX_BELT_SIZE);
    const bIdx = action % MAX_BELT_SIZE;
    const hCard = player.hand[hIdx];
    const bCard = state.conveyorBelt[bIdx];
    return `swap ${cardName(hCard)} ↔ belt[${bIdx}] ${cardName(bCard)}`;
  }
  if (phase === Phase.PHASE_4) {
    return action === 1 ? 'CALL CHECK ✓' : 'pass';
  }
  if (phase === Phase.CHEFS_CHOICE_SELECT_CARDS) {
    return `chef's choice: select ${cardName(player.hand[action])}`;
  }
  if (phase === Phase.CHEFS_CHOICE_SELECT_POSITIONS) {
    return `chef's choice: insert at deck pos ${action}`;
  }
  if (phase === Phase.PHASE_DISCARD) {
    return `discard ${cardName(player.hand[action])}`;
  }
  return `action ${action}`;
}

const PHASE_LABELS = {
  [Phase.PHASE_1]: 'P1',
  [Phase.PHASE_2]: 'P2',
  [Phase.PHASE_3]: 'P3',
  [Phase.PHASE_4]: 'P4',
  [Phase.CHEFS_CHOICE_SELECT_CARDS]: 'Chef-pick',
  [Phase.CHEFS_CHOICE_SELECT_POSITIONS]: 'Chef-pos',
  [Phase.PHASE_DISCARD]: 'Discard',
};

let lastTurn = -1;
const t0 = performance.now();

while (!env.state.gameOver) {
  const { state } = env;
  const p = state.currentPlayer;

  if (env.turnCount !== lastTurn && state.phase === Phase.PHASE_1) {
    lastTurn = env.turnCount;
    const hand = state.players[p].hand.map(cardName).join(', ');
    console.log(`\n── Turn ${env.turnCount + 1}  ${names[p]} (seat ${p})  deck:${state.deck.length} ──`);
    console.log(`   Hand: ${hand}`);
  }

  const legal = env.getLegalActions();
  const agent = p === 0 ? agentA : agentB;
  const action = agent.chooseAction(env, legal);

  const label = PHASE_LABELS[state.phase] ?? `phase${state.phase}`;
  const desc = decodeAction(state, action);
  console.log(`   ${label.padEnd(10)} ${desc}`);

  env.step(action);
}

const elapsed = ((performance.now() - t0) / 1000).toFixed(3);

console.log('\n══ Game Over ══');
const results = env.getGameResults();
for (let i = 0; i < 2; i++) {
  const hand = env.state.players[i].hand.map(cardName).join(', ');
  console.log(`  ${names[i].padEnd(8)} ¥${results[i]}   [${hand}]`);
}
const winner = results[0] > results[1] ? 'mcts2' : results[1] > results[0] ? 'greedy' : 'Draw';
console.log(`  Winner: ${winner}`);
console.log(`  Total time: ${elapsed}s  (${SIMS} sims/move)`);

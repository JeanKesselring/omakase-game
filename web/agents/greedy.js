import { Phase } from '../engine/gameState.js';
import { MAX_BELT_SIZE } from '../engine/env.js';
import { calculateScore, hasValidSet } from '../engine/scoring.js';
import { PASSIVE_ACTION_CARDS, CARD_VALUES, ActionCard } from '../engine/cards.js';

export class SimpleGreedyAgent {
  constructor({ checkThreshold = 300 } = {}) {
    this._checkThreshold = checkThreshold;
  }

  chooseAction(env, legalActions) {
    const { phase } = env.state;
    if (phase === Phase.PHASE_2)                       return this._phase2(env, legalActions);
    if (phase === Phase.PHASE_1 || phase === Phase.PHASE_3) return chooseActionCard(env, legalActions);
    if (phase === Phase.PHASE_4)                       return this._phase4(env, legalActions);
    if (phase === Phase.PHASE_DISCARD)                 return this._phaseDiscard(env, legalActions);
    return 0;
  }

  _phase2(env, legalActions) {
    const player = env.state.players[env.state.currentPlayer];
    const belt   = env.state.conveyorBelt;
    if (!player.hand.length || !belt.length) return legalActions[0];
    const { bestAction } = bestSwap(player.hand, belt, legalActions);
    return bestAction ?? legalActions[0];
  }

  _phaseDiscard(env, legalActions) {
    const player = env.state.players[env.state.currentPlayer];
    let worstIdx = legalActions[0];
    let worstScore = Infinity;
    for (const idx of legalActions) {
      if (idx >= player.hand.length) continue;
      const card = player.hand[idx];
      const val = card.isSushi ? (CARD_VALUES[card.sushiCard] ?? 0) : 0;
      if (val < worstScore) { worstScore = val; worstIdx = idx; }
    }
    return worstIdx;
  }

  _phase4(env, legalActions) {
    if (!legalActions.includes(1)) return 0;
    const player = env.state.players[env.state.currentPlayer];
    if (!hasValidSet(player.hand)) return 0;
    const myScore = calculateScore(player.hand);
    const oppScores = Array.from({ length: env.state.numPlayers }, (_, i) => i)
      .filter(i => i !== env.state.currentPlayer)
      .map(i => calculateScore(env.state.players[i].hand));
    if (oppScores.length > 0 && myScore > Math.max(...oppScores) + this._checkThreshold && player.hand.length >= 5) {
      return 1;
    }
    return 0;
  }
}

export class RandomAgent {
  chooseAction(env, legalActions) {
    return legalActions[Math.floor(Math.random() * legalActions.length)];
  }
}

// ── Shared helpers (also used by MCTS) ──────────────────────────────────────

export function bestSwap(hand, belt, legalActions) {
  const currentScore = calculateScore(hand);
  let bestAction = null;
  let bestDelta = -Infinity;
  for (const action of legalActions) {
    const hIdx = Math.floor(action / MAX_BELT_SIZE);
    const bIdx = action % MAX_BELT_SIZE;
    if (hIdx >= hand.length || bIdx >= belt.length) continue;
    const newHand = [...hand.slice(0, hIdx), belt[bIdx], ...hand.slice(hIdx + 1)];
    const delta = calculateScore(newHand) - currentScore;
    if (delta > bestDelta) { bestDelta = delta; bestAction = action; }
  }
  return { bestAction, bestDelta };
}

export function scoreActionCard(actionCardType, player, oppHands) {
  const oppBestSushi = oppHands.reduce((max, h) => {
    const v = h.filter(c => c.isSushi).reduce((m, c) => Math.max(m, CARD_VALUES[c.sushiCard] ?? 0), 0);
    return Math.max(max, v);
  }, 0);
  const myScore = calculateScore(player.hand);
  const maxOppScore = oppHands.reduce((m, h) => Math.max(m, calculateScore(h)), 0);
  const handFullness = player.hand.length / Math.max(player.maxHandSize, 1);
  const mySushi = player.hand.filter(c => c.isSushi);
  const worstSushiVal = mySushi.length > 0
    ? Math.min(...mySushi.map(c => CARD_VALUES[c.sushiCard] ?? 0))
    : 9999;

  if (actionCardType === ActionCard.CHOPSTICKS) return oppBestSushi > 500 ? oppBestSushi : 0;
  if (actionCardType === ActionCard.FORK)       return oppBestSushi > 500 ? oppBestSushi * 0.7 : 0;
  if (actionCardType === ActionCard.SAKE)       return mySushi.length > 0 && worstSushiVal < 400 ? Math.max(0, 400 - worstSushiVal) : 0;
  if (actionCardType === ActionCard.UMESHU)     return maxOppScore > myScore + 800 ? Math.max(0, (maxOppScore - myScore) * 0.3) : 0;
  if (actionCardType === ActionCard.CHEFS_CHOICE) return handFullness < 0.75 ? 500 * (1 - handFullness) : 0;
  if (actionCardType === ActionCard.MATCHA)     return handFullness < 0.75 ? 400 * (1 - handFullness) : 0;
  return 0;
}

export function chooseActionCard(env, legalActions) {
  const { state } = env;
  const player = state.players[state.currentPlayer];
  const playable = player.hand.filter(c => !c.isSushi && !PASSIVE_ACTION_CARDS.has(c.actionCard));
  if (!playable.length) return 0;

  const oppHands = Array.from({ length: state.numPlayers }, (_, i) => i)
    .filter(i => i !== state.currentPlayer)
    .map(i => state.players[i].hand);

  let bestIdx = null;
  let bestVal = 0;
  for (let i = 0; i < playable.length; i++) {
    const val = scoreActionCard(playable[i].actionCard, player, oppHands);
    if (val > bestVal && legalActions.includes(i + 1)) {
      bestVal = val;
      bestIdx = i;
    }
  }
  return bestIdx === null ? 0 : bestIdx + 1;
}

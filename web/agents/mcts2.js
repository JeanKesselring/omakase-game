// IS-MCTS v2 — improved over mcts.js with four changes:
//
//  1. Sigmoid reward  : sigmoid(myScore − maxOppScore, K=600) instead of linear score-ratio
//  2. Value estimation: set-completion probability for rolloutDepth truncation (default depth=10)
//  3. Phase 4 priors  : state-dependent check-call prior instead of uniform 50/50
//  4. Aggressive check: rollout agent calls check at any positive lead (vs +300 in the greedy default)

import { OmakaseEnv, MAX_BELT_SIZE } from '../engine/env.js';
import { Phase } from '../engine/gameState.js';
import { calculateScore, hasValidSet } from '../engine/scoring.js';
import { createDeck, PASSIVE_ACTION_CARDS } from '../engine/cards.js';
import { bestSwap, scoreActionCard, SimpleGreedyAgent } from './greedy.js';

const REWARD_K = 600; // sigmoid temperature — 1 Kids-Set lead (2000 pts) → reward ≈ 0.96

const SETS_WITH_VALUES = [
  [new Set(["fatty_tuna","conger_eel","crab","tuna","salmon","salmon_roe"]), 6000],
  [new Set(["conger_eel","crab","tuna","shrimp","tuna_roll","salmon_roll"]), 4500],
  [new Set(["salmon_roe","salmon","shrimp","tuna_roll","salmon_roll","omelette"]), 3500],
  [new Set(["omelette","cucumber_roll","tofu","karaage"]), 2000],
];

function sigmoid(x) { return 1 / (1 + Math.exp(-x / REWARD_K)); }

class MCTSNode {
  constructor(action, parent, prior = 1.0) {
    this.action = action;
    this.parent = parent;
    this.children = new Map();
    this.visits = 0;
    this.totalReward = 0.0;
    this.prior = prior;
  }

  ucb(c) {
    if (this.visits === 0) return Infinity;
    return (
      this.totalReward / this.visits
      + c * this.prior * Math.sqrt(this.parent.visits) / (1 + this.visits)
    );
  }
}

export class ISMCTSAgentV2 {
  constructor({ nSimulations = 500, timeBudgetMs = 0, c = 1.5, rolloutDepth = 10 } = {}) {
    this.nSimulations = nSimulations;
    this.timeBudgetMs = timeBudgetMs;
    this.c = c;
    this.rolloutDepth = rolloutDepth;
    // Rollout agent calls check at any lead (threshold=0) so games end at natural win points
    this._rolloutAgent = new SimpleGreedyAgent({ checkThreshold: 0 });
    this._root = null;
    this._lastAction = null;
    this._allCards = createDeck();
    this._playerIdx = 0;

    // Precompute card-type frequencies once (used by _valueEstimate per simulation)
    this._typeFrequencies = new Map();
    for (const c of this._allCards) {
      const type = c.isSushi ? c.sushiCard : c.actionCard;
      this._typeFrequencies.set(type, (this._typeFrequencies.get(type) ?? 0) + 1);
    }
  }

  chooseAction(env, legalActions) {
    this._playerIdx = env.state.currentPlayer;

    if (legalActions.length === 1) {
      this._advanceRoot(legalActions[0]);
      return legalActions[0];
    }

    const root = this._getWarmRoot();

    if (this.timeBudgetMs > 0) {
      const deadline = Date.now() + this.timeBudgetMs;
      while (Date.now() < deadline) {
        const detEnv = this._determinize(env);
        this._simulate(root, detEnv);
      }
    } else {
      for (let i = 0; i < this.nSimulations; i++) {
        const detEnv = this._determinize(env);
        this._simulate(root, detEnv);
      }
    }

    if (root.children.size === 0) {
      this._root = null;
      this._lastAction = null;
      return legalActions[Math.floor(Math.random() * legalActions.length)];
    }

    let bestAction = null;
    let bestVisits = -1;
    for (const [action, child] of root.children) {
      if (child.visits > bestVisits) { bestVisits = child.visits; bestAction = action; }
    }

    this._root = root;
    this._lastAction = bestAction;
    return bestAction;
  }

  _getWarmRoot() {
    if (this._root && this._lastAction != null && this._root.children.has(this._lastAction)) {
      const child = this._root.children.get(this._lastAction);
      child.parent = null;
      return child;
    }
    const root = new MCTSNode(null, null);
    root.visits = 1;
    return root;
  }

  _advanceRoot(action) {
    if (this._root && this._root.children.has(action)) {
      const child = this._root.children.get(action);
      child.parent = null;
      this._root = child;
    } else {
      this._root = null;
    }
    this._lastAction = null;
  }

  _determinize(env) {
    const { state } = env;
    const known = new Set([
      ...state.players[this._playerIdx].hand.map(c => c.cardId),
      ...state.conveyorBelt.map(c => c.cardId),
      ...state.trash.map(c => c.cardId),
      ...state.chefChoiceDrawnCards.map(c => c.cardId),
    ]);
    const pool = this._allCards.filter(c => !known.has(c.cardId));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const det = env.copy();
    let idx = 0;
    for (let p = 0; p < state.numPlayers; p++) {
      if (p === this._playerIdx) continue;
      const size = state.players[p].hand.length;
      det.state.players[p].hand = pool.slice(idx, idx + size);
      idx += size;
    }
    det.state.deck = pool.slice(idx);
    return det;
  }

  _simulate(root, env) {
    let node = root;

    while (!env.state.gameOver) {
      while (!env.state.gameOver && env.state.currentPlayer !== this._playerIdx) {
        const legal = env.getLegalActions();
        env.step(this._rolloutAgent.chooseAction(env, legal));
      }
      if (env.state.gameOver) break;

      const legal = env.getLegalActions();
      const untried = legal.filter(a => !node.children.has(a));

      if (untried.length > 0) {
        const priors = this._computePriors(env, legal);
        const action = untried.reduce((best, a) => (priors[a] ?? 0) > (priors[best] ?? 0) ? a : best, untried[0]);
        const child = new MCTSNode(action, node, priors[action] ?? 1 / legal.length);
        node.children.set(action, child);
        node = child;
        env.step(action);
        break;
      }

      const valid = legal.filter(a => node.children.has(a));
      if (valid.length === 0) break;
      const action = valid.reduce((best, a) =>
        node.children.get(a).ucb(this.c) > node.children.get(best).ucb(this.c) ? a : best, valid[0]);
      node = node.children.get(action);
      env.step(action);
    }

    const reward = this._rollout(env);

    let cur = node;
    while (cur !== null) {
      cur.visits++;
      cur.totalReward += reward;
      cur = cur.parent;
    }
  }

  _computePriors(env, legalActions) {
    const { state } = env;
    const player = state.players[state.currentPlayer];
    const priors = {};

    if (state.phase === Phase.PHASE_2) {
      const currentScore = calculateScore(player.hand);
      for (const action of legalActions) {
        const hIdx = Math.floor(action / MAX_BELT_SIZE);
        const bIdx = action % MAX_BELT_SIZE;
        if (hIdx >= player.hand.length || bIdx >= state.conveyorBelt.length) {
          priors[action] = 50; continue;
        }
        const newHand = [...player.hand.slice(0, hIdx), state.conveyorBelt[bIdx], ...player.hand.slice(hIdx + 1)];
        const delta = calculateScore(newHand) - currentScore;
        priors[action] = Math.max(0, delta) + 50;
      }
    } else if (state.phase === Phase.PHASE_1 || state.phase === Phase.PHASE_3) {
      for (const action of legalActions) {
        priors[action] = action === 0 ? 100 : this._actionCardPrior(env, action);
      }
    } else if (state.phase === Phase.PHASE_4) {
      // State-dependent check prior: high when winning with a set, low otherwise
      const myScore = calculateScore(player.hand);
      const maxOppScore = Math.max(
        ...Array.from({ length: state.numPlayers }, (_, i) => i)
          .filter(i => i !== state.currentPlayer)
          .map(i => calculateScore(state.players[i].hand)),
        0
      );
      const lead = myScore - maxOppScore;
      priors[0] = 100; // pass baseline
      if (legalActions.includes(1)) {
        priors[1] = hasValidSet(player.hand) && lead > 0
          ? Math.max(200, 100 + lead / 5)
          : 20;
      }
    } else {
      for (const action of legalActions) priors[action] = 1;
    }

    const total = Object.values(priors).reduce((s, v) => s + v, 0) || 1;
    for (const a of legalActions) priors[a] = (priors[a] ?? 1) / total;
    return priors;
  }

  _actionCardPrior(env, action) {
    if (action === 0) return 100;
    const { state } = env;
    const player = state.players[state.currentPlayer];
    const playable = player.hand.filter(c => !c.isSushi && !PASSIVE_ACTION_CARDS.has(c.actionCard));
    const idx = action - 1;
    if (idx >= playable.length) return 0;
    const oppHands = Array.from({ length: state.numPlayers }, (_, i) => i)
      .filter(i => i !== state.currentPlayer)
      .map(i => state.players[i].hand);
    const val = scoreActionCard(playable[idx].actionCard, player, oppHands);
    return Math.max(50, val);
  }

  _rollout(env) {
    const startTurn = env.turnCount;
    let steps = 0;
    while (!env.state.gameOver && steps < 500) {
      if (this.rolloutDepth > 0 && env.turnCount - startTurn >= this.rolloutDepth) {
        return this._valueEstimate(env);
      }
      const legal = env.getLegalActions();
      env.step(this._rolloutAgent.chooseAction(env, legal));
      steps++;
    }
    // Terminal: sigmoid of score difference
    const results = env.getGameResults();
    const myScore = results[this._playerIdx] ?? 0;
    const maxOppScore = Math.max(
      ...Object.entries(results)
        .filter(([i]) => +i !== this._playerIdx)
        .map(([, s]) => s),
      0
    );
    return sigmoid(myScore - maxOppScore);
  }

  // Set-completion probability value estimate used at rollout truncation points.
  // Computes expected score = currentScore + sum(P(complete set S) × bonus) for each
  // not-yet-complete set, then applies sigmoid over the score difference vs best opponent.
  _valueEstimate(env) {
    const { state } = env;
    const ownHand = state.players[this._playerIdx].hand;

    // Visible cards (used to compute how many of each type are still in the unknown pool)
    const seenCounts = new Map();
    for (const c of [...ownHand, ...state.conveyorBelt, ...state.trash, ...state.chefChoiceDrawnCards]) {
      if (c.isSushi) seenCounts.set(c.sushiCard, (seenCounts.get(c.sushiCard) ?? 0) + 1);
    }

    // Unknown pool size = deck + all opponent hands
    let poolSize = state.deck.length;
    for (let p = 0; p < state.numPlayers; p++) {
      if (p !== this._playerIdx) poolSize += state.players[p].hand.length;
    }
    // Conservative estimate of remaining draws for this player
    const turnsLeft = poolSize > 0 ? Math.ceil(state.deck.length / state.numPlayers) : 0;

    const ownSushiTypes = new Set(ownHand.filter(c => c.isSushi).map(c => c.sushiCard));
    let expectedScore = calculateScore(ownHand);

    for (const [setCards, setBonus] of SETS_WITH_VALUES) {
      const needed = [...setCards].filter(t => !ownSushiTypes.has(t));
      if (needed.length === 0 || turnsLeft === 0 || poolSize === 0) continue;

      // P(complete set) = product over needed types of P(draw ≥1 of that type in turnsLeft draws)
      // With-replacement approximation: slightly underestimates (conservative bias)
      let pComplete = 1;
      for (const t of needed) {
        const total  = this._typeFrequencies.get(t) ?? 0;
        const hidden = Math.max(0, total - (seenCounts.get(t) ?? 0));
        if (hidden === 0) { pComplete = 0; break; }
        pComplete *= (1 - Math.pow((poolSize - hidden) / poolSize, turnsLeft));
      }
      expectedScore += pComplete * setBonus;
    }

    // Opponent score: use current score only (conservative — don't model their improvement)
    let maxOppExpected = 0;
    for (let p = 0; p < state.numPlayers; p++) {
      if (p !== this._playerIdx) {
        const s = calculateScore(state.players[p].hand);
        if (s > maxOppExpected) maxOppExpected = s;
      }
    }

    return sigmoid(expectedScore - maxOppExpected);
  }
}

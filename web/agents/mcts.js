import { OmakaseEnv, MAX_BELT_SIZE } from '../engine/env.js';
import { Phase } from '../engine/gameState.js';
import { calculateScore } from '../engine/scoring.js';
import { createDeck, PASSIVE_ACTION_CARDS } from '../engine/cards.js';
import { bestSwap, scoreActionCard, chooseActionCard, SimpleGreedyAgent } from './greedy.js';

const SETS_WITH_VALUES = [
  [new Set(["fatty_tuna","conger_eel","crab","tuna","salmon","salmon_roe"]), 6000],
  [new Set(["conger_eel","crab","tuna","shrimp","tuna_roll","salmon_roll"]), 4500],
  [new Set(["salmon_roe","salmon","shrimp","tuna_roll","salmon_roll","omelette"]), 3500],
  [new Set(["omelette","cucumber_roll","tofu","karaage"]), 2000],
];

class MCTSNode {
  constructor(action, parent, prior = 1.0) {
    this.action = action;
    this.parent = parent;
    this.children = new Map(); // action → MCTSNode
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

export class ISMCTSAgent {
  constructor({ nSimulations = 100, c = 1.5, rolloutDepth = 0 } = {}) {
    this.nSimulations = nSimulations;
    this.c = c;
    this.rolloutDepth = rolloutDepth;
    this._rolloutAgent = new SimpleGreedyAgent();
    this._root = null;
    this._lastAction = null;
    this._allCards = createDeck();
    this._playerIdx = 0;
  }

  chooseAction(env, legalActions) {
    this._playerIdx = env.state.currentPlayer;

    if (legalActions.length === 1) {
      this._advanceRoot(legalActions[0]);
      return legalActions[0];
    }

    const root = this._getWarmRoot();

    for (let i = 0; i < this.nSimulations; i++) {
      const detEnv = this._determinize(env);
      this._simulate(root, detEnv);
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
    // Shuffle pool
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

    // Selection + Expansion
    while (!env.state.gameOver) {
      // Advance opponent turns without branching into tree
      while (!env.state.gameOver && env.state.currentPlayer !== this._playerIdx) {
        const legal = env.getLegalActions();
        env.step(this._rolloutAgent.chooseAction(env, legal));
      }
      if (env.state.gameOver) break;

      const legal = env.getLegalActions();
      const untried = legal.filter(a => !node.children.has(a));

      if (untried.length > 0) {
        // Biased expansion: pick highest-prior untried action
        const priors = this._computePriors(env, legal);
        const action = untried.reduce((best, a) => (priors[a] ?? 0) > (priors[best] ?? 0) ? a : best, untried[0]);
        const child = new MCTSNode(action, node, priors[action] ?? 1 / legal.length);
        node.children.set(action, child);
        node = child;
        env.step(action);
        break;
      }

      // Selection: PUCT over children that are legal in this determinization
      const valid = legal.filter(a => node.children.has(a));
      if (valid.length === 0) break;
      const action = valid.reduce((best, a) =>
        node.children.get(a).ucb(this.c) > node.children.get(best).ucb(this.c) ? a : best, valid[0]);
      node = node.children.get(action);
      env.step(action);
    }

    // Rollout
    const reward = this._rollout(env);

    // Backpropagation
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
          priors[action] = 50;
          continue;
        }
        const newHand = [...player.hand.slice(0, hIdx), state.conveyorBelt[bIdx], ...player.hand.slice(hIdx + 1)];
        const delta = calculateScore(newHand) - currentScore;
        priors[action] = Math.max(0, delta) + 50;
      }
    } else if (state.phase === Phase.PHASE_1 || state.phase === Phase.PHASE_3) {
      for (const action of legalActions) {
        priors[action] = action === 0 ? 100 : this._actionCardPrior(env, action);
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
    const results = env.getGameResults();
    const total = Object.values(results).reduce((s, v) => s + v, 0) || 1;
    return (results[this._playerIdx] ?? 0) / total;
  }

  _valueEstimate(env) {
    const ourScore = calculateScore(env.state.players[this._playerIdx].hand);
    const totalScore = env.state.players.reduce((s, p) => s + calculateScore(p.hand), 0) || 1;
    const scoreRatio = ourScore / totalScore;

    const totalSetValue = SETS_WITH_VALUES.reduce((s, [, v]) => s + v, 0);
    const sushiTypes = new Set(env.state.players[this._playerIdx].hand.filter(c => c.isSushi).map(c => c.sushiCard));
    const mySetProgress = SETS_WITH_VALUES.reduce((s, [setCards, v]) => {
      let cnt = 0;
      for (const t of setCards) if (sushiTypes.has(t)) cnt++;
      return s + (cnt / setCards.size) * v;
    }, 0) / totalSetValue;

    let oppSetProgress = 0;
    for (let p = 0; p < env.state.numPlayers; p++) {
      if (p === this._playerIdx) continue;
      const oppSushi = new Set(env.state.players[p].hand.filter(c => c.isSushi).map(c => c.sushiCard));
      const opp = SETS_WITH_VALUES.reduce((s, [setCards, v]) => {
        let cnt = 0;
        for (const t of setCards) if (oppSushi.has(t)) cnt++;
        return s + (cnt / setCards.size) * v;
      }, 0) / totalSetValue;
      oppSetProgress = Math.max(oppSetProgress, opp);
    }

    const netSet = (mySetProgress - oppSetProgress + 1) / 2;
    return 0.6 * scoreRatio + 0.4 * netSet;
  }
}

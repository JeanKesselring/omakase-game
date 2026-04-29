import { createDeck, ActionCard, PASSIVE_ACTION_CARDS, CARD_VALUES } from './cards.js';
import { makeGameState, makePlayerState, Phase, copyState } from './gameState.js';
import { calculateScore, hasValidSet } from './scoring.js';

export const MAX_BELT_SIZE = 6;

// Seeded PRNG (mulberry32) — deterministic games when seed is provided
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function shuffleArray(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function randomChoice(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

export class OmakaseEnv {
  constructor(numPlayers = 2) {
    this.numPlayers = numPlayers;
    this.state = null;
    this.turnCount = 0;
    this._rng = Math.random;
    this._nextActionChoices = null; // set by game.js for human player picks
  }

  reset(seed = null) {
    this._rng = seed != null ? mulberry32(seed) : Math.random.bind(Math);
    const deck = createDeck();
    shuffleArray(deck, this._rng);

    const state = makeGameState(this.numPlayers);
    for (let i = 0; i < this.numPlayers; i++) {
      state.players[i].hand.push(deck.pop());
    }
    for (let i = 0; i < 6; i++) {
      state.conveyorBelt.push(deck.pop());
    }
    state.deck = deck;
    this.state = state;
    this.turnCount = 0;
    this._nextActionChoices = null;
    this._handleTurnStart();
  }

  // Copy constructor for MCTS determinizations
  copy() {
    const env = new OmakaseEnv(this.numPlayers);
    env.state = copyState(this.state);
    env.turnCount = this.turnCount;
    env._rng = this._rng;
    // _nextActionChoices intentionally NOT copied — simulations always use random
    return env;
  }

  step(action) {
    if (this.state.gameOver) return;
    const { phase } = this.state;
    if      (phase === Phase.PHASE_1)                       this._handlePhase1(action);
    else if (phase === Phase.PHASE_2)                       this._handlePhase2(action);
    else if (phase === Phase.PHASE_3)                       this._handlePhase3(action);
    else if (phase === Phase.PHASE_4)                       this._handlePhase4(action);
    else if (phase === Phase.CHEFS_CHOICE_SELECT_CARDS)     this._handleChefsChoiceSelectCards(action);
    else if (phase === Phase.CHEFS_CHOICE_SELECT_POSITIONS) this._handleChefsChoiceSelectPositions(action);
    else if (phase === Phase.PHASE_DISCARD)                 this._handlePhaseDiscard(action);
  }

  getLegalActions() {
    const { state } = this;
    const player = state.players[state.currentPlayer];

    if (state.phase === Phase.PHASE_1) {
      const actions = [0];
      const playable = player.hand.filter(c => !c.isSushi && !PASSIVE_ACTION_CARDS.has(c.actionCard));
      for (let i = 0; i < playable.length; i++) actions.push(i + 1);
      return actions;
    }

    if (state.phase === Phase.PHASE_2) {
      const actions = [];
      for (let hIdx = 0; hIdx < player.hand.length; hIdx++) {
        const hCard = player.hand[hIdx];
        if (!hCard.isSushi && hCard.actionCard === ActionCard.GINGER) continue;
        for (let bIdx = 0; bIdx < state.conveyorBelt.length; bIdx++) {
          const bCard = state.conveyorBelt[bIdx];
          if (hCard.cardId === bCard.cardId) continue;
          if (hCard.isSushi && bCard.isSushi && hCard.sushiCard === bCard.sushiCard) continue;
          if (!hCard.isSushi && !bCard.isSushi && hCard.actionCard === bCard.actionCard) continue;
          actions.push(hIdx * MAX_BELT_SIZE + bIdx);
        }
      }
      return actions.length > 0 ? actions : [0];
    }

    if (state.phase === Phase.PHASE_3) {
      if (state.actionPlayedThisTurn) return [0];
      const actions = [0];
      const playable = player.hand.filter(c => !c.isSushi && !PASSIVE_ACTION_CARDS.has(c.actionCard));
      for (let i = 0; i < playable.length; i++) actions.push(i + 1);
      return actions;
    }

    if (state.phase === Phase.PHASE_4) {
      const actions = [0];
      if (this._canCallCheck(state.currentPlayer)) actions.push(1);
      return actions;
    }

    if (state.phase === Phase.CHEFS_CHOICE_SELECT_CARDS) {
      const actions = player.hand.map((_, i) => i);
      return actions.length > 0 ? actions : [0];
    }

    if (state.phase === Phase.CHEFS_CHOICE_SELECT_POSITIONS) {
      return Array.from({ length: state.deck.length + 1 }, (_, i) => i);
    }

    if (state.phase === Phase.PHASE_DISCARD) {
      return player.hand.map((_, i) => i);
    }

    return [0];
  }

  getGameResults() {
    const scores = {};
    for (let i = 0; i < this.numPlayers; i++) {
      scores[i] = calculateScore(this.state.players[i].hand);
    }
    return scores;
  }

  getActivePlayer() {
    return this.state.players[this.state.currentPlayer];
  }

  // ── Phase handlers ────────────────────────────────────────────────────

  _handlePhase1(action) {
    const { state } = this;
    const player = state.players[state.currentPlayer];
    const playable = player.hand.filter(c => !c.isSushi && !PASSIVE_ACTION_CARDS.has(c.actionCard));

    if (action === 0) {
      state.phase = Phase.PHASE_2;
      return;
    }
    const idx = action - 1;
    if (idx < playable.length) {
      const card = playable[idx];
      const wasChefs = card.actionCard === ActionCard.CHEFS_CHOICE;
      if (this._playActionCard(state.currentPlayer, card.actionCard)) {
        state.actionPlayedThisTurn = true;
        if (wasChefs) {
          state.phase = Phase.CHEFS_CHOICE_SELECT_CARDS;
          state.chefChoiceSelectedCards = [];
          state.chefChoiceSelectedPositions = [];
          state.chefChoiceReturnPhase = Phase.PHASE_2;
        } else {
          state.phase = Phase.PHASE_2;
        }
      }
    }
  }

  _handlePhase2(action) {
    const { state } = this;
    if (state.conveyorBelt.length === 0) { state.phase = Phase.PHASE_3; return; }

    const hIdx = Math.floor(action / MAX_BELT_SIZE);
    const bIdx = action % MAX_BELT_SIZE;

    if (this._exchangeCard(state.currentPlayer, hIdx, bIdx)) {
      state.phase = Phase.PHASE_3;
    } else {
      const player = state.players[state.currentPlayer];
      outer: for (let hi = 0; hi < player.hand.length; hi++) {
        for (let bi = 0; bi < state.conveyorBelt.length; bi++) {
          if (this._exchangeCard(state.currentPlayer, hi, bi)) {
            state.phase = Phase.PHASE_3;
            break outer;
          }
        }
      }
      if (state.phase !== Phase.PHASE_3) state.phase = Phase.PHASE_3;
    }
  }

  _handlePhase3(action) {
    const { state } = this;
    if (state.actionPlayedThisTurn) { state.phase = Phase.PHASE_4; return; }

    const player = state.players[state.currentPlayer];
    const playable = player.hand.filter(c => !c.isSushi && !PASSIVE_ACTION_CARDS.has(c.actionCard));

    if (action === 0) {
      state.phase = Phase.PHASE_4;
      return;
    }
    const idx = action - 1;
    if (idx < playable.length) {
      const card = playable[idx];
      const wasChefs = card.actionCard === ActionCard.CHEFS_CHOICE;
      if (this._playActionCard(state.currentPlayer, card.actionCard)) {
        state.actionPlayedThisTurn = true;
        if (wasChefs) {
          state.phase = Phase.CHEFS_CHOICE_SELECT_CARDS;
          state.chefChoiceSelectedCards = [];
          state.chefChoiceSelectedPositions = [];
          state.chefChoiceReturnPhase = Phase.PHASE_4;
        } else {
          state.phase = Phase.PHASE_4;
        }
      }
    }
  }

  _handlePhase4(action) {
    const player = this.state.players[this.state.currentPlayer];
    if (action === 1 && this._canCallCheck(this.state.currentPlayer)) {
      player.hasCalledCheck = true;
      player.checkProtected = true;
      this.state.gameEnding = true;
    }
    this._endTurn();
  }

  _handleChefsChoiceSelectCards(action) {
    const { state } = this;
    const player = state.players[state.currentPlayer];
    if (action < player.hand.length) {
      const selected = player.hand[action];
      player.hand.splice(action, 1);
      state.chefChoiceSelectedCards.push(selected);
    }
    if (state.chefChoiceSelectedCards.length === 2) {
      state.phase = Phase.CHEFS_CHOICE_SELECT_POSITIONS;
    }
  }

  _handleChefsChoiceSelectPositions(action) {
    const { state } = this;
    if (action <= state.deck.length) {
      state.chefChoiceSelectedPositions.push(action);
    }
    if (state.chefChoiceSelectedPositions.length === 2) {
      const cards     = state.chefChoiceSelectedCards;
      const positions = state.chefChoiceSelectedPositions;
      const paired = positions.map((p, i) => [p, cards[i]]).sort((a, b) => b[0] - a[0]);
      for (const [pos, card] of paired) {
        state.deck.splice(pos, 0, card);
      }
      state.chefChoiceDrawnCards = [];
      state.chefChoiceSelectedCards = [];
      state.chefChoiceSelectedPositions = [];
      state.phase = state.chefChoiceReturnPhase;
    }
  }

  _handlePhaseDiscard(action) {
    const { state } = this;
    const player = state.players[state.currentPlayer];
    if (action >= 0 && action < player.hand.length) {
      state.trash.push(player.hand.splice(action, 1)[0]);
    }
    if (player.hand.length > player.maxHandSize) {
      return; // still over limit, stay in PHASE_DISCARD
    }
    this._proceedToNextTurn();
  }

  // ── Turn lifecycle ────────────────────────────────────────────────────

  _endTurn() {
    const { state } = this;
    this._moveConveyor();
    if (state.gameOver) return;

    const player = state.players[state.currentPlayer];
    if (player.hand.length > player.maxHandSize) {
      state.phase = Phase.PHASE_DISCARD;
      return;
    }

    this._proceedToNextTurn();
  }

  _proceedToNextTurn() {
    const { state } = this;
    if (state.gameOver) return;

    this.turnCount++;
    const nextPlayer = (state.currentPlayer + 1) % state.numPlayers;

    if (state.gameEnding && state.players[nextPlayer].hasCalledCheck) {
      state.gameOver = true;
      return;
    }

    state.currentPlayer = nextPlayer;
    state.phase = Phase.PHASE_1;
    state.actionPlayedThisTurn = false;

    this._handleTurnStart();
  }

  _handleTurnStart() {
    const { state } = this;
    const player = state.players[state.currentPlayer];

    if (player.wasabiSkipFlag > 0) {
      player.wasabiSkipFlag--;
      state.wasabiEvents.push({ type: 'skip', playerIdx: state.currentPlayer });
      this._endTurn();
      return;
    }

    const card = this._drawFromDeck();
    if (!card) return;

    if (!card.isSushi && card.actionCard === ActionCard.WASABI) {
      player.wasabiSkipFlag++;
      state.wasabiEvents.push({ type: 'draw', playerIdx: state.currentPlayer });
    }
    player.hand.push(card);
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  _drawFromDeck() {
    const { state } = this;
    if (state.deck.length === 0) {
      state.gameOver = true;
      return null;
    }
    return state.deck.shift();
  }

  _moveConveyor() {
    const { state } = this;
    if (state.conveyorBelt.length > 0) {
      state.trash.push(state.conveyorBelt.pop());
    }
    const card = this._drawFromDeck();
    if (card) {
      state.conveyorBelt.unshift(card);
    }
  }

  _canCallCheck(playerIdx) {
    const player = this.state.players[playerIdx];
    if (player.hasCalledCheck) return false;
    return hasValidSet(player.hand);
  }

  _exchangeCard(playerIdx, hIdx, bIdx) {
    const { state } = this;
    const player = state.players[playerIdx];
    if (hIdx < 0 || hIdx >= player.hand.length) return false;
    if (bIdx < 0 || bIdx >= state.conveyorBelt.length) return false;

    const hCard = player.hand[hIdx];
    const bCard = state.conveyorBelt[bIdx];

    if (!hCard.isSushi && hCard.actionCard === ActionCard.GINGER) return false;
    if (hCard.cardId === bCard.cardId) return false;
    if (hCard.isSushi && bCard.isSushi && hCard.sushiCard === bCard.sushiCard) return false;
    if (!hCard.isSushi && !bCard.isSushi && hCard.actionCard === bCard.actionCard) return false;

    player.hand[hIdx] = bCard;
    state.conveyorBelt[bIdx] = hCard;
    return true;
  }

  _playActionCard(playerIdx, actionCardType) {
    const { state } = this;
    const player = state.players[playerIdx];
    // Consume choices set by the human player UI (null during AI/MCTS simulations)
    const choices = this._nextActionChoices ?? {};
    this._nextActionChoices = null;

    const cardIdx = player.hand.findIndex(c => !c.isSushi && c.actionCard === actionCardType);
    if (cardIdx === -1) return false;
    if (PASSIVE_ACTION_CARDS.has(actionCardType)) return false;

    const card = player.hand[cardIdx];
    player.hand.splice(cardIdx, 1);
    state.trash.push(card);

    const opponents = Array.from({ length: state.numPlayers }, (_, i) => i).filter(i => i !== playerIdx);

    if (actionCardType === ActionCard.MATCHA) {
      player.matchaCount++;
      player.maxHandSize++;
      const drawn = this._drawFromDeck();
      if (drawn) {
        player.hand.push(drawn);
        if (!drawn.isSushi && drawn.actionCard === ActionCard.WASABI) {
          player.wasabiSkipFlag++;
          state.wasabiEvents.push({ type: 'draw', playerIdx });
        }
      }
      return true;
    }

    if (actionCardType === ActionCard.CHOPSTICKS) {
      if (opponents.length > 0) {
        const victim = randomChoice(opponents, this._rng);
        const vp = state.players[victim];
        if (!vp.checkProtected && vp.hand.length > 0) {
          let stolen;
          if (choices.victimCardIdx != null && choices.victimCardIdx < vp.hand.length) {
            stolen = vp.hand[choices.victimCardIdx];
          } else {
            stolen = randomChoice(vp.hand, this._rng);
          }
          vp.hand.splice(vp.hand.indexOf(stolen), 1);
          player.hand.push(stolen);
          if (!stolen.isSushi && stolen.actionCard === ActionCard.WASABI) {
            player.wasabiSkipFlag++;
            state.wasabiEvents.push({ type: 'draw', playerIdx });
          }
        }
      }
      return true;
    }

    if (actionCardType === ActionCard.SAKE) {
      if (opponents.length > 0) {
        const victim = randomChoice(opponents, this._rng);
        const vp = state.players[victim];
        if (!vp.checkProtected && vp.hand.length > 0) {
          let stolen;
          if (choices.victimCardIdx != null && choices.victimCardIdx < vp.hand.length) {
            stolen = vp.hand[choices.victimCardIdx];
          } else {
            stolen = randomChoice(vp.hand, this._rng);
          }
          vp.hand.splice(vp.hand.indexOf(stolen), 1);
          player.hand.push(stolen);
          if (!stolen.isSushi && stolen.actionCard === ActionCard.WASABI) player.wasabiSkipFlag++;
          if (player.hand.length > 0) {
            let returned;
            // returnCardIdx indexes the hand BEFORE the steal was appended (push → it's at the end)
            if (choices.returnCardIdx != null && choices.returnCardIdx < player.hand.length) {
              returned = player.hand[choices.returnCardIdx];
            } else {
              returned = randomChoice(player.hand, this._rng);
            }
            player.hand.splice(player.hand.indexOf(returned), 1);
            vp.hand.push(returned);
            if (!returned.isSushi && returned.actionCard === ActionCard.WASABI) vp.wasabiSkipFlag++;
          }
        }
      }
      return true;
    }

    if (actionCardType === ActionCard.UMESHU) {
      if (opponents.length > 0) {
        const victim = randomChoice(opponents, this._rng);
        const vp = state.players[victim];
        if (vp.checkProtected) return true;
        const combined = [...player.hand, ...vp.hand];
        shuffleArray(combined, this._rng);
        player.hand = [];
        vp.hand = [];
        for (let i = 0; i < combined.length; i++) {
          const c = combined[i];
          if (i % 2 === 0) {
            player.hand.push(c);
            if (!c.isSushi && c.actionCard === ActionCard.WASABI) player.wasabiSkipFlag++;
          } else {
            vp.hand.push(c);
            if (!c.isSushi && c.actionCard === ActionCard.WASABI) vp.wasabiSkipFlag++;
          }
        }
      }
      return true;
    }

    if (actionCardType === ActionCard.CHEFS_CHOICE) {
      const drawn = [];
      for (let i = 0; i < 3; i++) {
        const c = this._drawFromDeck();
        if (c) {
          drawn.push(c);
          player.hand.push(c);
          if (!c.isSushi && c.actionCard === ActionCard.WASABI) player.wasabiSkipFlag++;
        }
      }
      state.chefChoiceDrawnCards = drawn;
      return true;
    }

    if (actionCardType === ActionCard.FORK) {
      for (const victim of opponents) {
        const vp = state.players[victim];
        if (vp.checkProtected) continue;
        if (vp.hand.length > 0) {
          let target;
          if (choices.victimCardIdx != null && choices.victimCardIdx < vp.hand.length) {
            // Player chose a specific card (face-down pick — any card type)
            target = vp.hand[choices.victimCardIdx];
          } else {
            // Auto: take most expensive sushi
            const sushi = vp.hand.filter(c => c.isSushi);
            if (sushi.length === 0) continue;
            target = sushi.reduce((a, b) =>
              (CARD_VALUES[a.sushiCard] ?? 0) >= (CARD_VALUES[b.sushiCard] ?? 0) ? a : b
            );
          }
          vp.hand.splice(vp.hand.indexOf(target), 1);
          state.trash.push(target);
        }
      }
      return true;
    }

    return false;
  }
}

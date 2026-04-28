import { OmakaseEnv, MAX_BELT_SIZE } from './engine/env.js';
import { Phase } from './engine/gameState.js';
import { calculateScore, scoreBreakdown } from './engine/scoring.js';
import { CARD_VALUES, CARD_DISPLAY_NAMES, PASSIVE_ACTION_CARDS } from './engine/cards.js';
import { SimpleGreedyAgent, RandomAgent } from './agents/greedy.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const PLAYER_IDX = 0;
const AI_IDX = 1;
const IMG_OVERRIDES = { karaage: 'Karaage.png', shoyu: 'Shoyu.png' };
const cardImg     = name => `../cards/${IMG_OVERRIDES[name] ?? (name + '.png')}`;
const BACK_IMG    = '../cards/cards_back.png';

const ACTION_EFFECTS = {
  chopsticks:   'Steal a card from your opponent\'s hand',
  sake:         'Trade one card with your opponent',
  umeshu:       'Shuffle both hands and redistribute',
  chefs_choice: 'Draw 3, then return 2 to the deck',
  matcha:       'Draw an extra card, increase hand limit',
  fork:         'Remove a card from opponent\'s hand',
  wasabi:       'Skip your opponent\'s next turn (passive)',
  shoyu:        'Double value of 2 standalone cards (passive)',
  ginger:       "Block opponent's next swap (passive)",
};

// ── Game state ────────────────────────────────────────────────────────────────
let env = null;
let selectedAgent = 'greedy';
let mctsNSims = 500;
let agent = null;
let mctsWorker = null;
let aiThinking = false;

// Phase 2 UI state machine
let p2 = { step: 'SELECT_HAND', handIdx: null, legalBeltIdxs: new Set() };

// Chef's Choice selection
let chefsSelectedIndices = [];

// Score change tracking
const lastScores = { [PLAYER_IDX]: -1, [AI_IDX]: -1 };
let _lastPhaseMsg = '';
let _lastPhase = -1;

// Two-step action card confirmation
let pendingActionCard = null;

// Belt deal animation state
let beltDealIn = null;      // card object that just entered belt[0]
let beltDealAnimating = false; // true while fly-in animation is running

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('screen--active'));
  $(id).classList.add('screen--active');
}

// ── Card rendering ────────────────────────────────────────────────────────────
function cardName(card) {
  return card.isSushi ? card.sushiCard : card.actionCard;
}

function makeCardEl(card, opts = {}) {
  const el = document.createElement('div');
  el.className = 'card';
  el.setAttribute('role', 'listitem');

  const name = cardName(card);
  const displayName = CARD_DISPLAY_NAMES[name] ?? name;

  const img = document.createElement('img');
  img.src = cardImg(name);
  img.alt = displayName;
  img.className = 'card__img';
  img.loading = 'lazy';
  img.onerror = () => { img.style.visibility = 'hidden'; };
  el.appendChild(img);

  if (!card.isSushi) {
    el.classList.add(PASSIVE_ACTION_CARDS.has(card.actionCard) ? 'card--passive' : 'card--action');
  }

  if (opts.selected)    el.classList.add('card--selected');
  if (opts.validTarget) el.classList.add('card--valid-target');
  if (opts.playable)    el.classList.add('card--playable');
  if (opts.disabled)    el.classList.add('card--disabled');

  return el;
}

// Small face-down back for opp-hand; large=true for full card size in modals
function makeCardBackEl(large = false) {
  const el = document.createElement('div');
  el.className = large ? 'card' : 'card-back';
  el.setAttribute('aria-label', 'Face-down card');
  const img = document.createElement('img');
  img.src = BACK_IMG;
  img.alt = '';
  if (large) img.className = 'card__img';
  el.appendChild(img);
  return el;
}

// ── Score animation ───────────────────────────────────────────────────────────
function updateScore(elId, newScore, key) {
  const el = $(elId);
  el.textContent = `¥${newScore.toLocaleString()}`;
  if (newScore !== lastScores[key] && newScore > 0) {
    el.classList.remove('ticking');
    void el.offsetWidth;
    el.classList.add('ticking');
    setTimeout(() => el.classList.remove('ticking'), 300);
  }
  lastScores[key] = newScore;
}

// ── Phase message ─────────────────────────────────────────────────────────────
function setPhaseMsg(msg, highlight = false) {
  if (msg === _lastPhaseMsg) return;
  _lastPhaseMsg = msg;
  const el = $('phase-msg');
  el.style.opacity = '0';
  setTimeout(() => {
    el.textContent = msg;
    el.classList.toggle('phase-msg--highlight', highlight);
    el.style.opacity = '';
  }, 200);
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  if (!env || !env.state) return;
  const { state } = env;
  const player = state.players[PLAYER_IDX];
  const opp    = state.players[AI_IDX];

  updateScore('player-score', calculateScore(player.hand), PLAYER_IDX);

  $('turn-number').textContent = env.turnCount + 1;
  $('deck-count').textContent  = state.deck.length;

  // Update deck pile appearance
  const deckImg = $('deck-pile-img');
  if (deckImg) deckImg.style.opacity = state.deck.length === 0 ? '0.2' : '1';

  // Update trash pile
  renderTrashPile(state);

  // Game-ending banner
  const existingBanner = document.querySelector('.game-ending-banner');
  if (state.gameEnding && !state.gameOver) {
    if (!existingBanner) {
      const banner = document.createElement('div');
      banner.className = 'game-ending-banner';
      const caller = state.players.findIndex(p => p.hasCalledCheck);
      banner.textContent = caller === PLAYER_IDX
        ? 'You called Check! AI gets one more turn.'
        : 'AI called Check! This is your last turn.';
      $('screen-game').appendChild(banner);
    }
  } else if (existingBanner && !state.gameEnding) {
    existingBanner.remove();
  }

  // Opponent hand (face-down)
  const oppHandEl = $('opp-hand');
  oppHandEl.innerHTML = '';
  opp.hand.forEach(() => oppHandEl.appendChild(makeCardBackEl(false)));
  $('opp-hand-count').textContent = `${opp.hand.length} card${opp.hand.length !== 1 ? 's' : ''}`;

  const isPlayerTurn = state.currentPlayer === PLAYER_IDX && !aiThinking;
  const { phase } = state;

  renderBelt(state, isPlayerTurn, phase);
  renderPlayerHand(player, state, isPlayerTurn, phase);
  renderPhaseBar(phase, isPlayerTurn, state);
  renderControls(isPlayerTurn, phase);
  renderPassiveEffects(player);
}

function renderTrashPile(state) {
  const pileEl = $('trash-pile');
  $('trash-count').textContent = state.trash.length;

  // Show top card of trash
  const oldImg = pileEl.querySelector('img');
  if (oldImg) oldImg.remove();
  const emptyEl = $('trash-empty');

  if (state.trash.length > 0) {
    emptyEl && (emptyEl.style.display = 'none');
    const topCard = state.trash[state.trash.length - 1];
    const img = document.createElement('img');
    img.src = cardImg(cardName(topCard));
    img.alt = CARD_DISPLAY_NAMES[cardName(topCard)] ?? '';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit;';
    img.onerror = () => { img.style.visibility = 'hidden'; };
    pileEl.insertBefore(img, pileEl.firstChild);
  } else {
    emptyEl && (emptyEl.style.display = '');
  }
}

function renderBelt(state, isPlayerTurn, phase) {
  const beltEl = $('belt-slots');
  beltEl.innerHTML = '';

  const showTargets = isPlayerTurn && phase === Phase.PHASE_2 && p2.step === 'SELECT_BELT';
  const animEntry = beltDealIn != null || beltDealAnimating;

  state.conveyorBelt.forEach((card, bIdx) => {
    const isTarget = showTargets && p2.legalBeltIdxs.has(bIdx);
    const cardEl = makeCardEl(card, { validTarget: isTarget });

    if (animEntry) {
      if (bIdx === 0) {
        // Hidden while flying card animates in from deck
        cardEl.style.opacity = '0';
        cardEl.dataset.dealTarget = 'true';
      } else {
        // Cards that shifted right: start slightly right and move left to position
        cardEl.classList.add('card--deal-shift');
      }
    }

    if (isTarget) {
      cardEl.style.cursor = 'pointer';
      cardEl.addEventListener('click', () => onBeltCardClick(bIdx));
    }

    const slot = document.createElement('div');
    slot.className = 'belt-slot';
    slot.appendChild(cardEl);
    beltEl.appendChild(slot);
  });
}

function renderPassiveEffects(player) {
  const el = $('passive-effects');
  el.innerHTML = '';

  const add = (label, cls) => {
    const b = document.createElement('span');
    b.className = 'effect-badge ' + cls;
    b.textContent = label;
    el.appendChild(b);
  };

  if (player.hand.some(c => !c.isSushi && c.actionCard === 'wasabi'))
    add('Wasabi', 'effect-badge--mustard');
  if (player.wasabiSkipFlag > 0)
    add(`Wasabi Skip ×${player.wasabiSkipFlag}`, 'effect-badge--mustard');
  if (player.hand.some(c => !c.isSushi && c.actionCard === 'shoyu'))
    add('Shoyu', 'effect-badge--peri');
  if (player.hand.some(c => !c.isSushi && c.actionCard === 'ginger'))
    add('Ginger', 'effect-badge--nori');
  if (player.matchaCount > 0)
    add(`Matcha ×${player.matchaCount}`, 'effect-badge--nori');
}

function renderPlayerHand(player, state, isPlayerTurn, phase) {
  const handEl = $('player-hand');
  handEl.innerHTML = '';

  const legalActions = isPlayerTurn ? env.getLegalActions() : [];
  const playable = player.hand.filter(c => !c.isSushi && !PASSIVE_ACTION_CARDS.has(c.actionCard));

  player.hand.forEach((card, hIdx) => {
    let selected = false, isPlayable = false, disabled = false;

    if (isPlayerTurn && phase === Phase.PHASE_2) {
      if (p2.step === 'SELECT_HAND') {
        selected  = p2.handIdx === hIdx;
        disabled  = !legalActions.some(a => Math.floor(a / MAX_BELT_SIZE) === hIdx);
      } else {
        selected  = p2.handIdx === hIdx;
        disabled  = !selected;
      }
    } else if (isPlayerTurn && (phase === Phase.PHASE_1 || phase === Phase.PHASE_3)) {
      if (!card.isSushi && !PASSIVE_ACTION_CARDS.has(card.actionCard)) {
        const idx = playable.indexOf(card);
        isPlayable = idx >= 0 && legalActions.includes(idx + 1);
        if (pendingActionCard === card) {
          // This card is pending confirmation — show gold-highlighted, still clickable
          isPlayable = true;
          disabled   = false;
        } else if (pendingActionCard !== null) {
          // Another card is pending — dim everything else
          disabled = true;
        } else {
          disabled = !isPlayable;
        }
      } else {
        disabled = true;
      }
    } else {
      disabled = !isPlayerTurn;
    }

    const isPending = pendingActionCard === card;
    const el = makeCardEl(card, { selected, playable: isPlayable && !isPending, disabled });
    if (isPending) el.classList.add('card--pending');

    if (isPlayerTurn) {
      if (phase === Phase.PHASE_2 && p2.step === 'SELECT_HAND' && !disabled) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => onHandCardClick(hIdx));
      } else if (phase === Phase.PHASE_2 && p2.step === 'SELECT_BELT' && selected) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', onHandCardDeselect);
      } else if ((phase === Phase.PHASE_1 || phase === Phase.PHASE_3) && (isPlayable || isPending)) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => onActionCardClick(card, player));
      }
    }

    handEl.appendChild(el);
  });
}

const PHASE_MSGS = [
  'Play an action card, or skip to swap',
  'Select a hand card, then a belt card to swap',
  'Play another action card, or skip',
  'Call Check to end the game, or end your turn',
];

const PASS_BTN_LABELS = {
  [Phase.PHASE_1]: 'Skip',
  [Phase.PHASE_2]: 'Skip',
  [Phase.PHASE_3]: 'Skip',
  [Phase.PHASE_4]: 'Done',
};

function renderPhaseBar(phase, isPlayerTurn, state) {
  const displayPhase = Math.min(phase, Phase.PHASE_4);
  document.querySelectorAll('.phase-pip').forEach((pip, i) => {
    pip.classList.toggle('phase-pip--active', i === displayPhase);
    pip.classList.toggle('phase-pip--done',   i < displayPhase);
  });

  if (displayPhase !== _lastPhase && _lastPhase !== -1) {
    const bar = document.querySelector('.phase-bar');
    bar.classList.remove('phase-bar--flash');
    void bar.offsetWidth;
    bar.classList.add('phase-bar--flash');
  }
  _lastPhase = displayPhase;

  let msg = '', highlight = false;
  if (pendingActionCard && isPlayerTurn && (phase === Phase.PHASE_1 || phase === Phase.PHASE_3)) {
    const n = cardName(pendingActionCard);
    msg = `Play ${CARD_DISPLAY_NAMES[n] ?? n}? Click again to confirm, or Skip to cancel`;
    highlight = true;
  } else if (phase === Phase.CHEFS_CHOICE_SELECT_CARDS || phase === Phase.CHEFS_CHOICE_SELECT_POSITIONS) {
    msg = isPlayerTurn ? "Chef's Choice — pick 2 cards to return" : "Opponent using Chef's Choice…";
    highlight = isPlayerTurn;
  } else if (phase === Phase.PHASE_DISCARD) {
    msg = isPlayerTurn ? 'Discard a card — hand is over limit' : 'Opponent discarding…';
    highlight = isPlayerTurn;
  } else if (isPlayerTurn) {
    msg = PHASE_MSGS[phase] ?? 'Waiting…';
    highlight = phase === Phase.PHASE_2;
  } else {
    msg = 'Opponent is thinking…';
  }
  setPhaseMsg(msg, highlight);
}

function renderControls(isPlayerTurn, phase) {
  const passBtn  = $('btn-pass');
  const checkBtn = $('btn-check');

  const canPass  = isPlayerTurn && (phase === Phase.PHASE_1 || phase === Phase.PHASE_3 || phase === Phase.PHASE_4);
  const canCheck = isPlayerTurn && phase === Phase.PHASE_4 && (env?.getLegalActions().includes(1) ?? false);

  passBtn.disabled  = !canPass;
  checkBtn.disabled = !canCheck;
  checkBtn.classList.toggle('btn--check-avail', canCheck);

  // Dynamic label — "Cancel" overrides when an action card is pending
  if (canPass) {
    if (pendingActionCard && (phase === Phase.PHASE_1 || phase === Phase.PHASE_3)) {
      passBtn.textContent = 'Cancel';
    } else {
      passBtn.textContent = PASS_BTN_LABELS[phase] ?? 'Pass';
    }
  }
}

// ── Phase 2 handlers ──────────────────────────────────────────────────────────
function onHandCardClick(hIdx) {
  if (!env || p2.step !== 'SELECT_HAND') return;
  const { state } = env;
  if (state.currentPlayer !== PLAYER_IDX || state.phase !== Phase.PHASE_2) return;

  if (p2.handIdx === hIdx) { onHandCardDeselect(); return; }

  const legalBeltIdxs = new Set(
    env.getLegalActions()
      .filter(a => Math.floor(a / MAX_BELT_SIZE) === hIdx)
      .map(a => a % MAX_BELT_SIZE)
  );
  if (legalBeltIdxs.size === 0) return;

  p2 = { step: 'SELECT_BELT', handIdx: hIdx, legalBeltIdxs };
  render();
}

function onHandCardDeselect() {
  p2 = { step: 'SELECT_HAND', handIdx: null, legalBeltIdxs: new Set() };
  render();
}

function onBeltCardClick(bIdx) {
  if (!env || p2.step !== 'SELECT_BELT') return;
  const { state } = env;
  if (state.currentPlayer !== PLAYER_IDX || state.phase !== Phase.PHASE_2) return;
  if (!p2.legalBeltIdxs.has(bIdx)) return;

  const action   = p2.handIdx * MAX_BELT_SIZE + bIdx;
  const handCards = document.querySelectorAll('#player-hand .card');
  const beltCards = document.querySelectorAll('#belt-slots .card');
  const handEl    = handCards[p2.handIdx];
  const beltEl    = beltCards[bIdx];

  p2 = { step: 'SELECT_HAND', handIdx: null, legalBeltIdxs: new Set() };

  const afterSwap = () => {
    env.step(action);
    if (env.state.gameOver) { endGame(); return; }
    if (env.state.phase === Phase.PHASE_DISCARD && env.state.currentPlayer === PLAYER_IDX) {
      render(); showDiscardModal(); return;
    }
    render();
    postRenderCheck();
    scheduleTurn();
  };

  handEl && beltEl ? animateSwap(handEl, beltEl, afterSwap) : afterSwap();
}

// ── Action card handler ───────────────────────────────────────────────────────
async function onActionCardClick(card, player) {
  if (!env) return;
  const { state } = env;
  if (state.currentPlayer !== PLAYER_IDX) return;
  if (state.phase !== Phase.PHASE_1 && state.phase !== Phase.PHASE_3) return;

  const playable = player.hand.filter(c => !c.isSushi && !PASSIVE_ACTION_CARDS.has(c.actionCard));
  const idx = playable.indexOf(card);
  if (idx < 0) return;
  const action = idx + 1;
  if (!env.getLegalActions().includes(action)) return;

  // Step 1: first click selects the card (pending)
  if (pendingActionCard !== card) {
    pendingActionCard = card;
    render();
    return;
  }

  // Step 2: second click confirms — clear pending and proceed
  pendingActionCard = null;

  const name = cardName(card);
  await playActionCardAnimation(name, CARD_DISPLAY_NAMES[name] ?? name);

  // Interactive choices for select-from-opponent actions
  const oppPlayer = state.players[AI_IDX];
  const oppHasCards = !oppPlayer.checkProtected && oppPlayer.hand.length > 0;

  if (name === 'chopsticks' && oppHasCards) {
    const idx = await showPickOppCardModal(
      'Steal a Card',
      "Choose a face-down card from opponent's hand",
      oppPlayer.hand.length
    );
    if (idx !== null) env._nextActionChoices = { victimCardIdx: idx };
  }

  // Fork: auto-picks most expensive card — no player choice needed

  if (name === 'sake' && oppHasCards) {
    const victimIdx = await showPickOppCardModal(
      'Take a Card',
      "Choose a card to take from opponent (face-down)",
      oppPlayer.hand.length
    );
    // Exclude the sake card itself — engine removes it before looking up returnCardIdx,
    // so the filtered indices map 1:1 to the post-removal hand.
    const handForReturn = state.players[PLAYER_IDX].hand.filter(
      c => !(!c.isSushi && c.actionCard === 'sake')
    );
    const returnIdx = await showSakeReturnModal(handForReturn);
    if (victimIdx !== null && returnIdx !== null) {
      env._nextActionChoices = { victimCardIdx: victimIdx, returnCardIdx: returnIdx };
    }
  }

  // Capture hand IDs before step so we can find the gained card afterwards
  const preHandIds = (name === 'chopsticks' || name === 'sake')
    ? new Set(state.players[PLAYER_IDX].hand.map(c => c.cardId))
    : null;

  env.step(action);
  if (env.state.gameOver) { endGame(); return; }

  // Reveal the card gained from the opponent
  if (preHandIds) {
    const gained = env.state.players[PLAYER_IDX].hand.find(c => !preHandIds.has(c.cardId));
    if (gained) await revealCardAnimation(gained, 'You received');
  }

  await drainWasabiEvents();

  if (env.state.phase === Phase.CHEFS_CHOICE_SELECT_CARDS && env.state.currentPlayer === PLAYER_IDX) {
    render();
    const drawn = env.state.chefChoiceDrawnCards ?? [];
    if (drawn.length > 0) await revealCardsAnimation(drawn, "Chef's Choice — you drew:");
    showChefsChoiceModal();
    return;
  }
  if (env.state.phase === Phase.PHASE_DISCARD && env.state.currentPlayer === PLAYER_IDX) {
    render(); showDiscardModal(); return;
  }

  render();
  postRenderCheck();
}

// ── Pass / Check handler ──────────────────────────────────────────────────────
async function onPassOrCheck(action) {
  if (!env) return;
  const { state } = env;
  if (state.currentPlayer !== PLAYER_IDX) return;
  const { phase } = state;

  // Cancel a pending action card selection
  if (action === 0 && pendingActionCard !== null) {
    pendingActionCard = null;
    render();
    return;
  }

  if (phase !== Phase.PHASE_1 && phase !== Phase.PHASE_3 && phase !== Phase.PHASE_4) return;
  if (action === 1 && !env.getLegalActions().includes(1)) return;

  const prevBelt = phase === Phase.PHASE_4 ? capturePreStepBelt() : null;
  env.step(action);
  if (env.state.gameOver) { endGame(); return; }

  if (prevBelt) {
    checkAndSetBeltAnim(prevBelt);
    render();
    if (beltDealIn) await animateBeltDeal();
  }

  await drainWasabiEvents();

  if (env.state.phase === Phase.PHASE_DISCARD && env.state.currentPlayer === PLAYER_IDX) {
    render(); showDiscardModal(); return;
  }

  render();
  postRenderCheck();
  scheduleTurn();
}

// ── Chef's Choice modal (card selection) ──────────────────────────────────────
function showChefsChoiceModal() {
  const player = env.state.players[PLAYER_IDX];
  chefsSelectedIndices = [];
  $('chefs-modal-instr').textContent = 'Select 2 cards to return to the deck';
  $('chefs-select-count').textContent = '0 / 2 selected';

  const cardsEl = $('chefs-modal-cards');
  cardsEl.innerHTML = '';
  player.hand.forEach((card, idx) => {
    const el = makeCardEl(card);
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => onChefsModalCardClick(idx, cardsEl));
    cardsEl.appendChild(el);
  });

  $('chefs-modal-bg').hidden = false;
}

function onChefsModalCardClick(idx, cardsEl) {
  if (!env || env.state.phase !== Phase.CHEFS_CHOICE_SELECT_CARDS) return;

  const cardEls = cardsEl.querySelectorAll('.card');
  const selPos  = chefsSelectedIndices.indexOf(idx);

  if (selPos >= 0) {
    chefsSelectedIndices.splice(selPos, 1);
    cardEls[idx]?.classList.remove('card--selected');
  } else if (chefsSelectedIndices.length < 2) {
    chefsSelectedIndices.push(idx);
    cardEls[idx]?.classList.add('card--selected');
  }

  $('chefs-select-count').textContent = `${chefsSelectedIndices.length} / 2 selected`;

  if (chefsSelectedIndices.length === 2) {
    const sorted = [...chefsSelectedIndices].sort((a, b) => b - a);
    setTimeout(() => {
      env.step(sorted[0]);
      env.step(sorted[1]);

      chefsSelectedIndices = [];
      $('chefs-modal-bg').hidden = true;

      if (env.state.phase === Phase.CHEFS_CHOICE_SELECT_POSITIONS) {
        render();
        showChefsPositionModal();
        return;
      }

      if (env.state.gameOver) { endGame(); return; }
      render();
      postRenderCheck();
      scheduleTurn();
    }, 300);
  }
}

// ── Chef's Choice position modal ──────────────────────────────────────────────
function showChefsPositionModal() {
  const cards  = env.state.chefChoiceSelectedCards;
  const deckLen = env.state.deck.length;
  const positions = [0, 0];

  const instr = $('chefs-pos-modal-instr');
  instr.textContent = `Deck has ${deckLen} card${deckLen !== 1 ? 's' : ''}. 0 = top, ${deckLen} = bottom.`;

  const body = $('chefs-pos-modal-body');
  body.innerHTML = '';

  cards.forEach((card, i) => {
    const row = document.createElement('div');
    row.className = 'chefs-pos-row';

    // Mini card thumbnail
    const thumb = makeCardEl(card, {});
    thumb.style.cssText = `pointer-events:none; flex-shrink:0; width:60px; height:84px;`;
    thumb.querySelector('.card__img').style.cssText = 'width:100%;height:100%;object-fit:cover;';

    const sliderWrap = document.createElement('div');
    sliderWrap.className = 'chefs-pos-slider';

    const labelEl = document.createElement('label');
    labelEl.textContent = `Card ${i + 1}: ${CARD_DISPLAY_NAMES[cardName(card)] ?? cardName(card)}`;
    labelEl.htmlFor = `chefs-pos-slider-${i}`;

    const input = document.createElement('input');
    input.type = 'range'; input.min = '0';
    input.max = String(deckLen); input.value = '0';
    input.id = `chefs-pos-slider-${i}`;
    input.style.width = '100%';
    input.setAttribute('accent-color', 'var(--peri-deep)');

    const display = document.createElement('span');
    display.className = 'chefs-pos-display';
    display.textContent = '0 (top)';

    const hint = document.createElement('span');
    hint.className = 'chefs-pos-hint';
    hint.textContent = `0 = top of deck, ${deckLen} = bottom`;

    input.addEventListener('input', () => {
      const v = parseInt(input.value, 10);
      positions[i] = v;
      display.textContent = v === 0 ? '0 (top)' : v === deckLen ? `${v} (bottom)` : String(v);
    });

    sliderWrap.append(labelEl, input, display, hint);
    row.append(thumb, sliderWrap);
    body.appendChild(row);
  });

  const confirmBtn = $('btn-chefs-pos-confirm');
  confirmBtn.onclick = () => {
    env.step(positions[0]);
    env.step(positions[1]);

    $('chefs-pos-modal-bg').hidden = true;

    if (env.state.gameOver) { endGame(); return; }
    render();
    postRenderCheck();
    scheduleTurn();
  };

  $('chefs-pos-modal-bg').hidden = false;
}

// ── Pick opponent card modal ──────────────────────────────────────────────────
function showPickOppCardModal(title, instr, numCards) {
  return new Promise(resolve => {
    $('pick-opp-modal-title').textContent = title;
    $('pick-opp-modal-instr').textContent = instr;

    const container = $('pick-opp-modal-cards');
    container.innerHTML = '';

    for (let i = 0; i < numCards; i++) {
      const back = makeCardBackEl(true); // large back card
      back.style.cursor = 'pointer';
      back.addEventListener('click', () => {
        $('pick-opp-modal-bg').hidden = true;
        resolve(i);
      });
      container.appendChild(back);
    }

    $('pick-opp-modal-bg').hidden = false;
  });
}

// ── Sake return modal ─────────────────────────────────────────────────────────
function showSakeReturnModal(hand) {
  return new Promise(resolve => {
    const container = $('sake-return-modal-cards');
    container.innerHTML = '';

    hand.forEach((card, idx) => {
      const el = makeCardEl(card);
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        $('sake-return-modal-bg').hidden = true;
        resolve(idx);
      });
      container.appendChild(el);
    });

    $('sake-return-modal-bg').hidden = false;
  });
}

// ── Discard modal (PHASE_DISCARD for human player) ────────────────────────────
function showDiscardModal() {
  if (!env || env.state.phase !== Phase.PHASE_DISCARD || env.state.currentPlayer !== PLAYER_IDX) return;
  const player = env.state.players[PLAYER_IDX];
  const excess = player.hand.length - player.maxHandSize;

  $('discard-modal-instr').textContent =
    `Hand limit: ${player.maxHandSize}. You have ${player.hand.length}. Discard ${excess} card${excess !== 1 ? 's' : ''}.`;

  const cardsEl = $('discard-modal-cards');
  cardsEl.innerHTML = '';

  player.hand.forEach((card, idx) => {
    const el = makeCardEl(card);
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      env.step(idx);

      if (env.state.gameOver) { $('discard-modal-bg').hidden = true; endGame(); return; }

      if (env.state.phase === Phase.PHASE_DISCARD && env.state.currentPlayer === PLAYER_IDX) {
        // Need more discards — refresh modal
        $('discard-modal-bg').hidden = true;
        render();
        showDiscardModal();
      } else {
        $('discard-modal-bg').hidden = true;
        render();
        postRenderCheck();
        scheduleTurn();
      }
    });
    cardsEl.appendChild(el);
  });

  $('discard-modal-bg').hidden = false;
}

// ── Trash viewer modal ────────────────────────────────────────────────────────
function showTrashModal() {
  if (!env || !env.state) return;
  const trash = env.state.trash;
  $('trash-modal-count').textContent = `${trash.length} card${trash.length !== 1 ? 's' : ''}`;

  const container = $('trash-modal-cards');
  container.innerHTML = '';

  // Show most recent first
  [...trash].reverse().forEach(card => {
    const el = makeCardEl(card, {});
    el.style.pointerEvents = 'none';
    container.appendChild(el);
  });

  $('trash-modal-bg').hidden = false;
}

// ── Auto-advance through trivial phases ───────────────────────────────────────
function postRenderCheck() {
  if (!env || env.state.gameOver || aiThinking) return;
  const { state } = env;
  if (state.currentPlayer !== PLAYER_IDX) return;

  const { phase } = state;
  const legal = env.getLegalActions();

  if ((phase === Phase.PHASE_1 || phase === Phase.PHASE_3) && legal.length === 1 && legal[0] === 0) {
    env.step(0);
    if (env.state.gameOver) { endGame(); return; }
    if (env.state.phase === Phase.PHASE_DISCARD && env.state.currentPlayer === PLAYER_IDX) {
      render(); showDiscardModal(); return;
    }
    render();
    postRenderCheck();
    scheduleTurn();
    return;
  }

  if (phase === Phase.PHASE_2 && legal.length === 1 && legal[0] === 0) {
    toast('No valid swaps available');
    setTimeout(() => {
      if (!env || env.state.gameOver) return;
      env.step(0);
      if (env.state.gameOver) { endGame(); return; }
      render();
      postRenderCheck();
      scheduleTurn();
    }, 900);
    return;
  }

  if (phase === Phase.PHASE_4 && legal.length === 1 && legal[0] === 0) {
    setTimeout(() => {
      if (!env || env.state.gameOver || env.state.currentPlayer !== PLAYER_IDX) return;
      const prevBelt = capturePreStepBelt();
      env.step(0);
      checkAndSetBeltAnim(prevBelt);
      if (env.state.gameOver) { endGame(); return; }
      render();
      if (beltDealIn) {
        animateBeltDeal().then(() => { postRenderCheck(); scheduleTurn(); });
      } else {
        postRenderCheck();
        scheduleTurn();
      }
    }, 400);
    return;
  }
}

// ── Turn scheduling ───────────────────────────────────────────────────────────
function scheduleTurn() {
  if (!env || env.state.gameOver) return;
  const { state } = env;

  if (state.phase === Phase.PHASE_DISCARD) {
    if (state.currentPlayer === PLAYER_IDX) {
      showDiscardModal();
    } else {
      runAiDiscard();
    }
    return;
  }

  if (state.phase === Phase.CHEFS_CHOICE_SELECT_CARDS || state.phase === Phase.CHEFS_CHOICE_SELECT_POSITIONS) {
    if (state.currentPlayer !== PLAYER_IDX) {
      runAiChefsChoice();
      return;
    }
    return;
  }

  if (state.currentPlayer !== PLAYER_IDX) {
    runAiTurn();
  }
}

function runAiChefsChoice() {
  while (!env.state.gameOver &&
    (env.state.phase === Phase.CHEFS_CHOICE_SELECT_CARDS ||
     env.state.phase === Phase.CHEFS_CHOICE_SELECT_POSITIONS)) {
    env.step(agent.chooseAction(env, env.getLegalActions()));
  }
  if (env.state.gameOver) { endGame(); return; }
  render();
  scheduleTurn();
}

async function runAiDiscard() {
  if (!env || env.state.gameOver) return;
  await delay(400);
  while (!env.state.gameOver && env.state.phase === Phase.PHASE_DISCARD) {
    const aiPlayer = env.state.players[env.state.currentPlayer];
    env.step(agent.chooseAction(env, env.getLegalActions()));
    render();
  }
  if (env.state.gameOver) { endGame(); return; }
  postRenderCheck();
  scheduleTurn();
}

async function runAiTurn() {
  if (!env || env.state.gameOver) return;
  pendingActionCard = null; // can't be pending when it's the AI's turn
  (selectedAgent === 'mcts' || selectedAgent === 'mcts2') ? await runMctsAiTurn() : await runSyncAiTurn();
}

async function runSyncAiTurn() {
  aiThinking = true;
  render();
  await delay(800);

  while (!env.state.gameOver && env.state.currentPlayer === AI_IDX) {
    await drainWasabiEvents();
    const { phase } = env.state;
    const legal = env.getLegalActions();
    const action = agent.chooseAction(env, legal);

    if (phase === Phase.PHASE_DISCARD) {
      await delay(1200);
      env.step(action);
      render();
      continue;
    }

    if (phase === Phase.CHEFS_CHOICE_SELECT_CARDS || phase === Phase.CHEFS_CHOICE_SELECT_POSITIONS) {
      await delay(1000);
      env.step(action);
      render();
      continue;
    }

    if (phase === Phase.PHASE_1 || phase === Phase.PHASE_3) {
      if (action !== 0) {
        const aiPlayer = env.state.players[AI_IDX];
        const playable = aiPlayer.hand.filter(c => !c.isSushi && !PASSIVE_ACTION_CARDS.has(c.actionCard));
        const card = playable[action - 1];
        if (card) {
          const name = cardName(card);
          setPhaseMsg(`Chef plays ${CARD_DISPLAY_NAMES[name] ?? name}…`, true);
          await playActionCardAnimation(name, CARD_DISPLAY_NAMES[name] ?? name, 1400);
        }
      } else {
        setPhaseMsg('Chef skips action…');
        await delay(1500);
      }
      env.step(action);
      render();

    } else if (phase === Phase.PHASE_2) {
      const hIdx = Math.floor(action / MAX_BELT_SIZE);
      const bIdx = action % MAX_BELT_SIZE;

      // Step 1: lift and highlight the chosen hand card
      setPhaseMsg('Chef picks a card from hand…');
      const handCards = document.querySelectorAll('#opp-hand .card-back');
      const handEl = handCards[hIdx];
      if (handEl) handEl.classList.add('card-back--ai-pick');
      await delay(2500);

      // Step 2: highlight the belt target with a pulsing ring
      setPhaseMsg('Chef targets a belt card…');
      const beltCards = document.querySelectorAll('#belt-slots .card');
      const targetEl = beltCards[bIdx];
      if (targetEl) targetEl.classList.add('card--ai-target');
      await delay(2500);

      // Step 3: remove highlights and animate swap
      if (handEl) handEl.classList.remove('card-back--ai-pick');
      if (targetEl) targetEl.classList.remove('card--ai-target');

      const doStep = () => { env.step(action); render(); };
      if (handEl && targetEl) {
        await new Promise(resolve => animateSwap(handEl, targetEl, () => { doStep(); resolve(); }));
      } else {
        doStep();
        await delay(200);
      }

    } else if (phase === Phase.PHASE_4) {
      setPhaseMsg('Chef ends their turn…');
      await delay(1800);
      const prevBelt = capturePreStepBelt();
      env.step(action);
      checkAndSetBeltAnim(prevBelt);
      if (action === 1) toast('Opponent calls Check!');
      render();
      if (beltDealIn) await animateBeltDeal();
      await drainWasabiEvents();

    } else {
      env.step(action);
      render();
    }
  }

  aiThinking = false;
  if (env.state.gameOver) { endGame(); return; }
  await drainWasabiEvents();
  render();
  postRenderCheck();
}

async function runMctsAiTurn() {
  const greedy = new SimpleGreedyAgent();
  while (!env.state.gameOver && env.state.currentPlayer === AI_IDX) {
    await drainWasabiEvents();
    const { phase } = env.state;
    const legal = env.getLegalActions();

    if (phase === Phase.PHASE_DISCARD) {
      await delay(300);
      env.step(agent.chooseAction(env, legal));
      render();
      continue;
    }

    if (phase === Phase.CHEFS_CHOICE_SELECT_CARDS || phase === Phase.CHEFS_CHOICE_SELECT_POSITIONS) {
      await delay(600);
      env.step(greedy.chooseAction(env, legal));
      render();
      continue;
    }

    if (phase === Phase.PHASE_1 || phase === Phase.PHASE_3) {
      const action = greedy.chooseAction(env, legal);
      if (action !== 0) {
        const aiPlayer = env.state.players[AI_IDX];
        const playable = aiPlayer.hand.filter(c => !c.isSushi && !PASSIVE_ACTION_CARDS.has(c.actionCard));
        const card = playable[action - 1];
        if (card) {
          const name = cardName(card);
          setPhaseMsg(`Chef plays ${CARD_DISPLAY_NAMES[name] ?? name}…`, true);
          await playActionCardAnimation(name, CARD_DISPLAY_NAMES[name] ?? name, 1000);
        }
      } else {
        await delay(300);
      }
      env.step(action);
      render();

    } else if (phase === Phase.PHASE_2) {
      showThinking(true);
      const action = await getMctsAction(structuredClone(env.state), legal);
      showThinking(false);

      const hIdx = Math.floor(action / MAX_BELT_SIZE);
      const bIdx = action % MAX_BELT_SIZE;

      setPhaseMsg('Chef picks a card from hand…');
      const handCards = document.querySelectorAll('#opp-hand .card-back');
      const handEl = handCards[hIdx];
      if (handEl) handEl.classList.add('card-back--ai-pick');
      await delay(1200);

      setPhaseMsg('Chef targets a belt card…');
      const beltCards = document.querySelectorAll('#belt-slots .card');
      const targetEl = beltCards[bIdx];
      if (targetEl) targetEl.classList.add('card--ai-target');
      await delay(1200);

      if (handEl) handEl.classList.remove('card-back--ai-pick');
      if (targetEl) targetEl.classList.remove('card--ai-target');

      const doStep = () => { env.step(action); render(); };
      if (handEl && targetEl) {
        await new Promise(resolve => animateSwap(handEl, targetEl, () => { doStep(); resolve(); }));
      } else {
        doStep();
        await delay(200);
      }

    } else if (phase === Phase.PHASE_4) {
      await delay(600);
      const action = greedy.chooseAction(env, legal);
      const prevBelt = capturePreStepBelt();
      env.step(action);
      checkAndSetBeltAnim(prevBelt);
      if (action === 1) toast('Opponent calls Check!');
      render();
      if (beltDealIn) await animateBeltDeal();
      await drainWasabiEvents();

    } else {
      env.step(greedy.chooseAction(env, legal));
      render();
    }
  }
  if (env.state.gameOver) { endGame(); return; }
  render();
  postRenderCheck();
}

function getMctsAction(stateSnapshot, legalActions) {
  return new Promise(resolve => {
    mctsWorker.onmessage = e => {
      if (e.data.type === 'result') resolve(e.data.action);
    };
    mctsWorker.postMessage({
      type: 'choose',
      envState: stateSnapshot,
      turnCount: env.turnCount,
      numPlayers: env.numPlayers,
      legalActions,
      nSimulations: mctsNSims,
      timeBudgetMs: 0,
      agentType: selectedAgent,
    });
  });
}

function showThinking(show) {
  aiThinking = show;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Belt deal animation helpers ───────────────────────────────────────────────
function capturePreStepBelt() {
  return env?.state?.conveyorBelt.map(c => c.cardId) ?? [];
}

function checkAndSetBeltAnim(prevBeltIds) {
  if (!env?.state) return;
  const newBelt = env.state.conveyorBelt;
  if (newBelt.length === 0) return;
  const newFirstId = newBelt[0]?.cardId;
  const oldFirstId = prevBeltIds[0];
  if (newFirstId !== oldFirstId) beltDealIn = newBelt[0];
}

async function animateBeltDeal() {
  const newCard = beltDealIn;
  beltDealIn = null;
  beltDealAnimating = true;

  const deckEl  = $('deck-pile');
  const beltEl  = $('belt-slots');
  const firstSlot = beltEl?.querySelector('.belt-slot');
  if (!deckEl || !firstSlot) { beltDealAnimating = false; return; }

  const deckRect = deckEl.getBoundingClientRect();
  const slotRect = firstSlot.getBoundingClientRect();

  // Flying card-back clone starting at deck pile position
  const flying = document.createElement('div');
  flying.className = 'card';
  Object.assign(flying.style, {
    position: 'fixed', margin: '0', zIndex: '1000', pointerEvents: 'none',
    width:  deckRect.width  + 'px',
    height: deckRect.height + 'px',
    top:  deckRect.top  + 'px',
    left: deckRect.left + 'px',
    overflow: 'hidden', borderRadius: 'var(--card-r)', transition: 'none',
  });
  const flyImg = document.createElement('img');
  flyImg.src = BACK_IMG;
  flyImg.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
  flying.appendChild(flyImg);
  document.body.appendChild(flying);

  // Animate to belt slot 0
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  flying.style.transition =
    'top 370ms cubic-bezier(.2,.8,.4,1), left 370ms cubic-bezier(.2,.8,.4,1),' +
    'width 370ms cubic-bezier(.2,.8,.4,1), height 370ms cubic-bezier(.2,.8,.4,1)';
  flying.style.top    = slotRect.top  + 'px';
  flying.style.left   = slotRect.left + 'px';
  flying.style.width  = slotRect.width  + 'px';
  flying.style.height = slotRect.height + 'px';
  await delay(370);

  // Flip to reveal: scaleX 1 → 0 (half-turn)
  flying.style.transition = 'transform 110ms ease-in';
  flying.style.transform  = 'scaleX(0)';
  await delay(110);

  // Swap to front face during the "edge" moment
  flyImg.src = cardImg(cardName(newCard));
  flyImg.onerror = () => { flyImg.style.visibility = 'hidden'; };
  if (!newCard.isSushi) {
    flying.classList.add(PASSIVE_ACTION_CARDS.has(newCard.actionCard) ? 'card--passive' : 'card--action');
  }

  // Flip: scaleX 0 → 1 (second half)
  flying.style.transition = 'transform 110ms ease-out';
  flying.style.transform  = 'scaleX(1)';
  await delay(110);

  // Reveal the real belt slot 0 card and remove flying clone
  flying.remove();
  const targetCard = firstSlot.querySelector('[data-deal-target]');
  if (targetCard) {
    targetCard.style.opacity = '';
    delete targetCard.dataset.dealTarget;
  }

  beltDealAnimating = false;
}

// ── Action card play animation ────────────────────────────────────────────────
function playActionCardAnimation(name, displayName, holdMs = 820) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'action-play-overlay';

    const inner = document.createElement('div');
    inner.className = 'action-play-inner';

    const bigCard = document.createElement('div');
    bigCard.className = 'action-play-card';

    const cardImgEl = document.createElement('img');
    cardImgEl.src = cardImg(name);
    cardImgEl.className = 'action-play-img';
    cardImgEl.onerror = () => { cardImgEl.style.visibility = 'hidden'; };
    bigCard.appendChild(cardImgEl);

    const cardNameEl = document.createElement('div');
    cardNameEl.className = 'action-play-card-name';
    cardNameEl.textContent = displayName;

    const desc = document.createElement('div');
    desc.className = 'action-play-desc';
    desc.textContent = ACTION_EFFECTS[name] ?? 'Action card played';

    inner.appendChild(bigCard);
    inner.appendChild(cardNameEl);
    inner.appendChild(desc);
    overlay.appendChild(inner);
    document.body.appendChild(overlay);

    setTimeout(() => {
      overlay.classList.add('action-play-overlay--out');
      setTimeout(() => { overlay.remove(); resolve(); }, 310);
    }, holdMs);
  });
}

// ── Card reveal — single card, starts face-down then flips ───────────────────
function revealCardAnimation(card, header = 'You received') {
  const name = cardName(card);
  const displayName = CARD_DISPLAY_NAMES[name] ?? name;

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'action-play-overlay';

    const inner = document.createElement('div');
    inner.className = 'action-play-inner';

    const headerEl = document.createElement('div');
    headerEl.className = 'action-play-desc';
    headerEl.textContent = header;

    const cardEl = document.createElement('div');
    cardEl.className = 'action-play-card';
    cardEl.style.transformOrigin = 'center';

    const img = document.createElement('img');
    img.src = BACK_IMG;
    img.className = 'action-play-img';
    cardEl.appendChild(img);

    const nameEl = document.createElement('div');
    nameEl.className = 'action-play-card-name';
    nameEl.textContent = '?';

    inner.append(headerEl, cardEl, nameEl);
    overlay.appendChild(inner);
    document.body.appendChild(overlay);

    // Flip to face-up after 650ms
    setTimeout(() => {
      cardEl.style.transition = 'transform 130ms ease-in';
      cardEl.style.transform = 'scaleX(0)';
      setTimeout(() => {
        img.src = cardImg(name);
        img.onerror = () => { img.style.visibility = 'hidden'; };
        if (!card.isSushi)
          cardEl.classList.add(PASSIVE_ACTION_CARDS.has(card.actionCard) ? 'card--passive' : 'card--action');
        nameEl.textContent = displayName;
        cardEl.style.transition = 'transform 130ms ease-out';
        cardEl.style.transform = 'scaleX(1)';
        // Fade out after showing face
        setTimeout(() => {
          overlay.classList.add('action-play-overlay--out');
          setTimeout(() => { overlay.remove(); resolve(); }, 310);
        }, 1100);
      }, 130);
    }, 650);
  });
}

// ── Card reveal — multiple cards, staggered flip (for Chef's Choice) ──────────
function revealCardsAnimation(cards, header = "You drew:") {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'action-play-overlay';

    const inner = document.createElement('div');
    inner.className = 'action-play-inner';

    const headerEl = document.createElement('div');
    headerEl.className = 'action-play-card-name';
    headerEl.textContent = header;

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:12px;align-items:center;margin-top:4px;';

    const entries = cards.map(c => {
      const wrap = document.createElement('div');
      wrap.className = 'action-play-card';
      wrap.style.cssText = 'width:100px;height:140px;transform-origin:center;flex-shrink:0;';
      const img = document.createElement('img');
      img.src = BACK_IMG;
      img.className = 'action-play-img';
      wrap.appendChild(img);
      row.appendChild(wrap);
      return { wrap, img, card: c };
    });

    inner.append(headerEl, row);
    overlay.appendChild(inner);
    document.body.appendChild(overlay);

    // Stagger the flip of each card by 280ms
    entries.forEach(({ wrap, img, card: c }, i) => {
      const name = cardName(c);
      setTimeout(() => {
        wrap.style.transition = 'transform 120ms ease-in';
        wrap.style.transform = 'scaleX(0)';
        setTimeout(() => {
          img.src = cardImg(name);
          img.onerror = () => { img.style.visibility = 'hidden'; };
          if (!c.isSushi)
            wrap.classList.add(PASSIVE_ACTION_CARDS.has(c.actionCard) ? 'card--passive' : 'card--action');
          wrap.style.transition = 'transform 120ms ease-out';
          wrap.style.transform = 'scaleX(1)';
        }, 120);
      }, 300 + i * 300);
    });

    const totalMs = 300 + (cards.length - 1) * 300 + 240 + 1200;
    setTimeout(() => {
      overlay.classList.add('action-play-overlay--out');
      setTimeout(() => { overlay.remove(); resolve(); }, 310);
    }, totalMs);
  });
}

// ── Wasabi events — drain and show notifications ──────────────────────────────
async function drainWasabiEvents() {
  if (!env?.state?.wasabiEvents?.length) return;
  const events = env.state.wasabiEvents.splice(0);
  for (const ev of events) {
    if (ev.type === 'draw') {
      const isPlayer = ev.playerIdx === PLAYER_IDX;
      const drawn = env.state.players[ev.playerIdx].hand.find(c => !c.isSushi && c.actionCard === 'wasabi');
      if (drawn) {
        const header = isPlayer ? 'You drew Wasabi!' : 'Opponent drew Wasabi!';
        await revealCardAnimation(drawn, header);
      }
      const skipWho = isPlayer ? 'your' : "opponent's";
      toast(`Wasabi! ${isPlayer ? 'Your' : "Opponent's"} next turn will be skipped.`, 3000);
    } else if (ev.type === 'skip') {
      const isPlayer = ev.playerIdx === PLAYER_IDX;
      toast(`${isPlayer ? 'Your' : "Opponent's"} turn is skipped by Wasabi!`, 2800);
      await delay(1000);
    }
  }
}

// ── Swap animation ────────────────────────────────────────────────────────────
function animateSwap(handEl, beltEl, onComplete) {
  const hRect = handEl.getBoundingClientRect();
  const bRect = beltEl.getBoundingClientRect();

  const base = 'position:fixed;margin:0;z-index:999;pointer-events:none;transition:none;';
  const hClone = handEl.cloneNode(true);
  const bClone = beltEl.cloneNode(true);
  document.body.append(hClone, bClone);

  [hClone, bClone].forEach(el => {
    el.style.cssText = base;
    el.classList.remove('card--valid-target', 'card--selected', 'card--entering');
    el.style.transform = '';
  });

  hClone.style.top = hRect.top + 'px'; hClone.style.left = hRect.left + 'px';
  hClone.style.width = hRect.width + 'px'; hClone.style.height = hRect.height + 'px';
  bClone.style.top = bRect.top + 'px'; bClone.style.left = bRect.left + 'px';
  bClone.style.width = bRect.width + 'px'; bClone.style.height = bRect.height + 'px';

  handEl.style.opacity = '0';
  beltEl.style.opacity = '0';

  requestAnimationFrame(() => requestAnimationFrame(() => {
    const t = 'top 340ms cubic-bezier(.4,0,.2,1), left 340ms cubic-bezier(.4,0,.2,1)';
    hClone.style.transition = t; bClone.style.transition = t;
    hClone.style.top = bRect.top + 'px'; hClone.style.left = bRect.left + 'px';
    bClone.style.top = hRect.top + 'px'; bClone.style.left = hRect.left + 'px';
  }));

  setTimeout(() => {
    hClone.remove(); bClone.remove();
    handEl.style.opacity = ''; beltEl.style.opacity = '';
    onComplete();
  }, 360);
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, duration = 2500) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  $('toast-container').appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 400ms ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 400);
  }, duration);
}

// ── Game start / end ──────────────────────────────────────────────────────────
function startGame() {
  if (mctsWorker) { mctsWorker.terminate(); mctsWorker = null; }

  if (selectedAgent === 'greedy') {
    agent = new SimpleGreedyAgent();
  } else if (selectedAgent === 'random') {
    agent = new RandomAgent();
  } else {
    agent = new SimpleGreedyAgent();
    mctsWorker = new Worker(new URL('./workers/mcts_worker.js', import.meta.url), { type: 'module' });
  }

  env = new OmakaseEnv(2);
  env.reset();

  p2 = { step: 'SELECT_HAND', handIdx: null, legalBeltIdxs: new Set() };
  chefsSelectedIndices = [];
  aiThinking = false;
  pendingActionCard = null;
  beltDealIn = null;
  beltDealAnimating = false;
  lastScores[PLAYER_IDX] = -1;
  lastScores[AI_IDX] = -1;
  _lastPhaseMsg = '';
  _lastPhase = -1;

  document.querySelector('.game-ending-banner')?.remove();
  $('chefs-modal-bg').hidden    = true;
  $('chefs-pos-modal-bg').hidden = true;
  $('pick-opp-modal-bg').hidden  = true;
  $('sake-return-modal-bg').hidden = true;
  $('discard-modal-bg').hidden   = true;
  $('trash-modal-bg').hidden     = true;
  $('menu-bg').hidden            = true;
  $('thinking-overlay').hidden   = true;

  const aiName = agentDisplayName(selectedAgent);
  $('opp-label').textContent = aiName;
  $('go-opp-label').textContent = aiName;

  showScreen('screen-game');
  render();
  postRenderCheck();
  scheduleTurn();
}

function agentDisplayName(a) {
  return { greedy: 'Greedy', random: 'Random', mcts: 'IS-MCTS', mcts2: 'IS-MCTS+' }[a] ?? 'AI';
}

function endGame() {
  aiThinking = false;
  $('thinking-overlay').hidden = true;

  const results = env.getGameResults();
  const pScore = results[PLAYER_IDX] ?? 0;
  const aScore = results[AI_IDX]     ?? 0;
  const won    = pScore > aScore;
  const tied   = pScore === aScore;

  $('gameover-verdict').textContent = won ? 'OMAKASE!' : tied ? "It's a Tie!" : 'Better Luck Next Time';
  $('go-player-score').textContent  = `¥${pScore.toLocaleString()}`;
  $('go-opp-score').textContent     = `¥${aScore.toLocaleString()}`;
  $('go-player-card').classList.toggle('winner', won);
  $('go-opp-card').classList.toggle('winner', !won && !tied);

  renderMiniHand('go-player-hand', env.state.players[PLAYER_IDX].hand);
  renderMiniHand('go-opp-hand',    env.state.players[AI_IDX].hand);
  renderBreakdown(pScore, aScore);

  setTimeout(() => showScreen('screen-gameover'), 300);
}

function renderMiniHand(elId, hand) {
  const el = $(elId);
  el.innerHTML = '';
  hand.forEach(card => {
    const mini = document.createElement('div');
    mini.className = 'card-mini';
    const img = document.createElement('img');
    img.src = cardImg(cardName(card));
    img.alt = CARD_DISPLAY_NAMES[cardName(card)] ?? '';
    img.loading = 'lazy';
    mini.appendChild(img);
    el.appendChild(mini);
  });
}

function renderBreakdown() {
  const container = $('go-breakdown');
  container.innerHTML = '';
  container.style.cssText = 'display:flex;flex-direction:row;gap:20px;align-items:flex-start;';

  const makeCol = (hand, header) => {
    const col = document.createElement('div');
    col.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:5px;min-width:0';

    const h = document.createElement('div');
    h.style.cssText = 'font-size:11px;text-transform:uppercase;letter-spacing:.1em;font-weight:600;color:var(--muted);margin-bottom:6px;font-family:var(--font-b)';
    h.textContent = header;
    col.appendChild(h);

    scoreBreakdown(hand).forEach(line => {
      const row = document.createElement('div');
      row.className = 'gameover__breakdown-line';
      if (line.label.includes('Set')) row.classList.add('set-line');
      const lbl = document.createElement('span');
      lbl.textContent = line.label;
      lbl.style.overflow = 'hidden';
      lbl.style.textOverflow = 'ellipsis';
      const pts = document.createElement('span');
      pts.style.cssText = 'font-family:var(--font-d);color:var(--salmon);white-space:nowrap;margin-left:8px;flex-shrink:0;font-variant-numeric:tabular-nums';
      pts.textContent = `+¥${line.points.toLocaleString()}`;
      row.appendChild(lbl);
      row.appendChild(pts);
      col.appendChild(row);
    });

    return col;
  };

  container.appendChild(makeCol(env.state.players[PLAYER_IDX].hand, 'Your cards'));
  container.appendChild(makeCol(env.state.players[AI_IDX].hand, `${agentDisplayName(selectedAgent)}'s cards`));
}

// ── Setup ─────────────────────────────────────────────────────────────────────
function setupNewGameScreen() {
  document.querySelectorAll('.agent-card').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.agent-card').forEach(b => {
        b.classList.remove('agent-card--active');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('agent-card--active');
      btn.setAttribute('aria-checked', 'true');
      selectedAgent = btn.dataset.agent;
      $('mcts-options').style.display = (selectedAgent === 'mcts' || selectedAgent === 'mcts2') ? 'block' : 'none';
    });
  });

  $('mcts-sims').addEventListener('input', e => {
    mctsNSims = parseInt(e.target.value, 10);
    $('mcts-sims-val').textContent = mctsNSims;
  });

  $('btn-start').addEventListener('click', startGame);

  $('btn-rules-toggle').addEventListener('click', () => {
    const panel = $('rules-panel');
    panel.hidden = !panel.hidden;
    $('btn-rules-toggle').textContent = panel.hidden ? 'Rules & Sets ▾' : 'Rules & Sets ▴';
  });
}

function setupGameScreen() {
  $('btn-pass').addEventListener('click',  () => onPassOrCheck(0));
  $('btn-check').addEventListener('click', () => onPassOrCheck(1));

  $('btn-menu').addEventListener('click',       () => { $('menu-bg').hidden = false; });
  $('btn-close-menu').addEventListener('click', () => { $('menu-bg').hidden = true; });
  $('menu-bg').addEventListener('click', e => {
    if (e.target === $('menu-bg')) $('menu-bg').hidden = true;
  });
  $('btn-new-game-menu').addEventListener('click', () => {
    $('menu-bg').hidden = true;
    showScreen('screen-newgame');
  });

  // Trash pile click → open viewer
  $('trash-pile').addEventListener('click', showTrashModal);
  $('trash-pile').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showTrashModal(); }
  });

  // Close trash modal
  $('btn-close-trash-modal').addEventListener('click', () => {
    $('trash-modal-bg').hidden = true;
  });
  $('trash-modal-bg').addEventListener('click', e => {
    if (e.target === $('trash-modal-bg')) $('trash-modal-bg').hidden = true;
  });
}

function setupGameOverScreen() {
  $('btn-rematch').addEventListener('click',     startGame);
  $('btn-change-opp').addEventListener('click', () => showScreen('screen-newgame'));
}

setupNewGameScreen();
setupGameScreen();
setupGameOverScreen();

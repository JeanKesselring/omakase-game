export const Phase = Object.freeze({
  PHASE_1:                    0,
  PHASE_2:                    1,
  PHASE_3:                    2,
  PHASE_4:                    3,
  CHEFS_CHOICE_SELECT_CARDS:  4,
  CHEFS_CHOICE_SELECT_POSITIONS: 5,
  PHASE_DISCARD:              6,
});

export const PHASE_NAMES = {
  0: "PHASE_1",
  1: "PHASE_2",
  2: "PHASE_3",
  3: "PHASE_4",
  4: "CHEFS_CHOICE_SELECT_CARDS",
  5: "CHEFS_CHOICE_SELECT_POSITIONS",
  6: "PHASE_DISCARD",
};

export function makePlayerState() {
  return {
    hand:           [],
    maxHandSize:    8,
    matchaCount:    0,
    wasabiSkipFlag: 0,
    checkProtected: false,
    hasCalledCheck: false,
  };
}

export function makeGameState(numPlayers) {
  return {
    numPlayers,
    currentPlayer: 0,
    phase: Phase.PHASE_1,
    players: Array.from({ length: numPlayers }, makePlayerState),
    conveyorBelt: [],
    deck: [],
    trash: [],
    actionPlayedThisTurn: false,
    gameEnding: false,
    gameOver: false,
    chefChoiceDrawnCards: [],
    chefChoiceSelectedCards: [],
    chefChoiceSelectedPositions: [],
    chefChoiceReturnPhase: Phase.PHASE_2,
    wasabiEvents: [],  // {type:'draw'|'skip', playerIdx:number}
  };
}

// Deep clone — used by MCTS for determinizations
export function copyState(state) {
  return structuredClone(state);
}

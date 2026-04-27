// Card type constants matching Python enum .value strings (also PNG filename stems)
export const SushiCard = Object.freeze({
  ASSORTED_SASHIMI: "assorted_sashimi",
  PREMIUM_EEL:      "premium_eel",
  OCTOPUS:          "octopus",
  FATTY_TUNA:       "fatty_tuna",
  CONGER_EEL:       "conger_eel",
  CRAB:             "crab",
  KARAAGE:          "karaage",
  SALMON_ROE:       "salmon_roe",
  TUNA:             "tuna",
  SALMON:           "salmon",
  SHRIMP:           "shrimp",
  CUCUMBER_ROLL:    "cucumber_roll",
  SALMON_ROLL:      "salmon_roll",
  TUNA_ROLL:        "tuna_roll",
  OMELETTE:         "omelette",
  TOFU:             "tofu",
});

export const ActionCard = Object.freeze({
  CHOPSTICKS:   "chopsticks",
  SAKE:         "sake",
  UMESHU:       "umeshu",
  CHEFS_CHOICE: "chefs_choice",
  WASABI:       "wasabi",
  MATCHA:       "matcha",
  SHOYU:        "shoyu",
  FORK:         "fork",
  GINGER:       "ginger",
});

export const PASSIVE_ACTION_CARDS = new Set(["wasabi", "shoyu", "ginger"]);

export const CARD_VALUES = {
  assorted_sashimi: 1500,
  premium_eel:      1200,
  octopus:          1100,
  fatty_tuna:       1000,
  conger_eel:        700,
  crab:              600,
  karaage:           500,
  salmon_roe:        500,
  tuna:              400,
  salmon:            400,
  shrimp:            400,
  cucumber_roll:     300,
  salmon_roll:       300,
  tuna_roll:         300,
  omelette:          200,
  tofu:              200,
};

export const CARD_DISPLAY_NAMES = {
  assorted_sashimi: "Assorted Sashimi",
  premium_eel:      "Premium Eel",
  octopus:          "Octopus",
  fatty_tuna:       "Fatty Tuna",
  conger_eel:       "Conger Eel",
  crab:             "Crab",
  karaage:          "Karaage",
  salmon_roe:       "Salmon Roe",
  tuna:             "Tuna",
  salmon:           "Salmon",
  shrimp:           "Shrimp",
  cucumber_roll:    "Cucumber Roll",
  salmon_roll:      "Salmon Roll",
  tuna_roll:        "Tuna Roll",
  omelette:         "Omelette",
  tofu:             "Tofu",
  chopsticks:       "Chopsticks",
  sake:             "Sake",
  umeshu:           "Umeshu",
  chefs_choice:     "Chef's Choice",
  wasabi:           "Wasabi",
  matcha:           "Matcha",
  shoyu:            "Shoyu",
  fork:             "Fork",
  ginger:           "Ginger",
};

// Deck composition mirrors Python CARD_COUNTS
const SUSHI_COUNTS = [
  [SushiCard.ASSORTED_SASHIMI, 1],
  [SushiCard.PREMIUM_EEL,      1],
  [SushiCard.OCTOPUS,          1],
  [SushiCard.FATTY_TUNA,       1],
  [SushiCard.CONGER_EEL,       2],
  [SushiCard.CRAB,             2],
  [SushiCard.KARAAGE,          3],
  [SushiCard.SALMON_ROE,       3],
  [SushiCard.TUNA,             3],
  [SushiCard.SALMON,           3],
  [SushiCard.SHRIMP,           3],
  [SushiCard.CUCUMBER_ROLL,    4],
  [SushiCard.SALMON_ROLL,      4],
  [SushiCard.TUNA_ROLL,        4],
  [SushiCard.OMELETTE,         5],
  [SushiCard.TOFU,             5],
];

const ACTION_COUNTS = [
  [ActionCard.CHOPSTICKS,   3],
  [ActionCard.SAKE,         2],
  [ActionCard.UMESHU,       2],
  [ActionCard.CHEFS_CHOICE, 2],
  [ActionCard.WASABI,       2],
  [ActionCard.MATCHA,       2],
  [ActionCard.SHOYU,        2],
  [ActionCard.FORK,         1],
  [ActionCard.GINGER,       1],
];

export function createDeck() {
  const cards = [];
  let cardId = 0;
  for (const [name, count] of SUSHI_COUNTS) {
    for (let i = 0; i < count; i++) {
      cards.push({ cardId, isSushi: true, sushiCard: name, actionCard: null });
      cardId++;
    }
  }
  for (const [name, count] of ACTION_COUNTS) {
    for (let i = 0; i < count; i++) {
      cards.push({ cardId, isSushi: false, sushiCard: null, actionCard: name });
      cardId++;
    }
  }
  return cards; // 63 cards total
}

export function cardName(card) {
  return card.isSushi ? card.sushiCard : card.actionCard;
}

export function cardValue(card) {
  return card.isSushi ? (CARD_VALUES[card.sushiCard] ?? 0) : 0;
}

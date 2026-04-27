import { CARD_VALUES, ActionCard } from './cards.js';

export const OMAKASE_SET = new Set(["fatty_tuna", "conger_eel", "crab", "tuna", "salmon", "salmon_roe"]);
export const SAKURA_SET  = new Set(["conger_eel", "crab", "tuna", "shrimp", "tuna_roll", "salmon_roll"]);
export const UME_SET     = new Set(["salmon_roe", "salmon", "shrimp", "tuna_roll", "salmon_roll", "omelette"]);
export const KIDS_SET    = new Set(["omelette", "cucumber_roll", "tofu", "karaage"]);

const ALL_SETS = [
  [OMAKASE_SET, 6000],
  [SAKURA_SET,  4500],
  [UME_SET,     3500],
  [KIDS_SET,    2000],
];

// Mirrors Python calculate_score(hand)
export function calculateScore(hand) {
  const sushiCards  = hand.filter(c => c.isSushi);
  const actionCards = hand.filter(c => !c.isSushi);
  const shoyuCount  = actionCards.filter(c => c.actionCard === ActionCard.SHOYU).length;

  // Build a Counter of sushi types
  const typeCounts = {};
  for (const c of sushiCards) {
    typeCounts[c.sushiCard] = (typeCounts[c.sushiCard] ?? 0) + 1;
  }

  const { usedCounter, setsScore } = findOptimalSets(typeCounts);

  // Build remaining counts after set usage
  const remaining = { ...typeCounts };
  for (const [t, used] of Object.entries(usedCounter)) {
    remaining[t] -= used;
  }

  // Collect unused sushi cards in original order, one-for-one
  const unusedSushi = [];
  const rem2 = { ...remaining };
  for (const c of sushiCards) {
    if ((rem2[c.sushiCard] ?? 0) > 0) {
      unusedSushi.push(c);
      rem2[c.sushiCard]--;
    }
  }

  unusedSushi.sort((a, b) => (CARD_VALUES[b.sushiCard] ?? 0) - (CARD_VALUES[a.sushiCard] ?? 0));

  const standaloneScore = calculateStandaloneScore(unusedSushi, shoyuCount);
  return setsScore + standaloneScore;
}

// Mirrors Python _find_optimal_sets using backtracking
function findOptimalSets(counts) {
  let bestScore = 0;
  let bestUsed  = {};

  function tryRecursive(remaining, used, score) {
    if (score > bestScore) {
      bestScore = score;
      bestUsed  = { ...used };
    }
    for (const [setCards, setValue] of ALL_SETS) {
      // Check if all cards in this set are available
      let canForm = true;
      for (const t of setCards) {
        if ((remaining[t] ?? 0) <= 0) { canForm = false; break; }
      }
      if (!canForm) continue;

      const newRemaining = { ...remaining };
      const newUsed = { ...used };
      for (const t of setCards) {
        newRemaining[t]--;
        newUsed[t] = (newUsed[t] ?? 0) + 1;
      }
      tryRecursive(newRemaining, newUsed, score + setValue);
    }
  }

  tryRecursive({ ...counts }, {}, 0);
  return { usedCounter: bestUsed, setsScore: bestScore };
}

function calculateStandaloneScore(sushiCards, shoyuCount) {
  if (sushiCards.length === 0) return 0;
  const baseValues = sushiCards.map(c => CARD_VALUES[c.sushiCard] ?? 0);
  let total = baseValues.reduce((a, b) => a + b, 0);
  if (shoyuCount > 0) {
    const applications = Math.min(shoyuCount, sushiCards.length);
    for (let i = 0; i < applications; i++) total += baseValues[i];
  }
  return total;
}

// Check if hand contains any complete set
export function hasValidSet(hand) {
  const sushiTypes = new Set(hand.filter(c => c.isSushi).map(c => c.sushiCard));
  return (
    isSuperset(sushiTypes, OMAKASE_SET) ||
    isSuperset(sushiTypes, SAKURA_SET)  ||
    isSuperset(sushiTypes, UME_SET)     ||
    isSuperset(sushiTypes, KIDS_SET)
  );
}

function isSuperset(set, subset) {
  for (const item of subset) if (!set.has(item)) return false;
  return true;
}

// Return a breakdown of sets completed and standalone cards in a hand
export function scoreBreakdown(hand) {
  const sushiCards  = hand.filter(c => c.isSushi);
  const actionCards = hand.filter(c => !c.isSushi);
  const shoyuCount  = actionCards.filter(c => c.actionCard === ActionCard.SHOYU).length;

  const typeCounts = {};
  for (const c of sushiCards) {
    typeCounts[c.sushiCard] = (typeCounts[c.sushiCard] ?? 0) + 1;
  }

  const { usedCounter, setsScore } = findOptimalSets(typeCounts);

  // Figure out which sets were formed
  const lines = [];
  const remaining = { ...typeCounts };
  for (const [t, used] of Object.entries(usedCounter)) remaining[t] -= used;

  // Identify set names (approximate — we know what types were used)
  for (const [setCards, setValue] of ALL_SETS) {
    let usedForThisSet = true;
    for (const t of setCards) {
      if ((usedCounter[t] ?? 0) <= 0) { usedForThisSet = false; break; }
    }
    if (usedForThisSet) {
      lines.push({ label: setName(setCards, setValue), points: setValue });
    }
  }

  // Standalone
  const unusedSushi = [];
  const rem2 = { ...remaining };
  for (const c of sushiCards) {
    if ((rem2[c.sushiCard] ?? 0) > 0) { unusedSushi.push(c); rem2[c.sushiCard]--; }
  }
  unusedSushi.sort((a, b) => (CARD_VALUES[b.sushiCard] ?? 0) - (CARD_VALUES[a.sushiCard] ?? 0));

  const applications = Math.min(shoyuCount, unusedSushi.length);
  for (let i = 0; i < unusedSushi.length; i++) {
    const val = CARD_VALUES[unusedSushi[i].sushiCard] ?? 0;
    const doubled = i < applications;
    lines.push({ label: displayName(unusedSushi[i].sushiCard) + (doubled ? " (Shoyu ×2)" : ""), points: doubled ? val * 2 : val });
  }

  return lines;
}

function setName(setCards, setValue) {
  if (isSuperset(setCards, OMAKASE_SET) && setValue === 6000) return "Omakase Set";
  if (isSuperset(setCards, SAKURA_SET)  && setValue === 4500) return "Sakura Set";
  if (isSuperset(setCards, UME_SET)     && setValue === 3500) return "Ume Set";
  if (isSuperset(setCards, KIDS_SET)    && setValue === 2000) return "Kids Set";
  return "Set";
}

function displayName(name) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

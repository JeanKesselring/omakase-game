from collections import Counter
from typing import List, Tuple

from .cards import Card, SushiCard, ActionCard, CARD_VALUES


OMAKASE_SET = {
    SushiCard.FATTY_TUNA,
    SushiCard.CONGER_EEL,
    SushiCard.CRAB,
    SushiCard.TUNA,
    SushiCard.SALMON,
    SushiCard.SALMON_ROE,
}
OMAKASE_VALUE = 6000

SAKURA_SET = {
    SushiCard.CONGER_EEL,
    SushiCard.CRAB,
    SushiCard.TUNA,
    SushiCard.SHRIMP,
    SushiCard.TUNA_ROLL,
    SushiCard.SALMON_ROLL,
}
SAKURA_VALUE = 4500

UME_SET = {
    SushiCard.SALMON_ROE,
    SushiCard.SALMON,
    SushiCard.SHRIMP,
    SushiCard.TUNA_ROLL,
    SushiCard.SALMON_ROLL,
    SushiCard.OMELETTE,
}
UME_VALUE = 3500

KIDS_SET = {SushiCard.OMELETTE, SushiCard.CUCUMBER_ROLL, SushiCard.TOFU, SushiCard.KARAAGE}
KIDS_VALUE = 2000

_ALL_SETS = [
    (OMAKASE_SET, OMAKASE_VALUE),
    (SAKURA_SET, SAKURA_VALUE),
    (UME_SET, UME_VALUE),
    (KIDS_SET, KIDS_VALUE),
]


def calculate_score(hand: List[Card]) -> int:
    sushi_cards = [c for c in hand if c.is_sushi]
    action_cards = [c for c in hand if not c.is_sushi]
    shoyu_count = sum(1 for c in action_cards if c.action_card == ActionCard.SHOYU)

    sushi_types = [c.sushi_card for c in sushi_cards]

    used_counter, sets_score = _find_optimal_sets(Counter(sushi_types))

    # Build unused_sushi respecting how many of each type were consumed by sets.
    # Cards of a type used in sets are excluded one-for-one; extras score standalone.
    remaining = Counter(sushi_types)
    for card_type, used_count in used_counter.items():
        remaining[card_type] -= used_count

    unused_sushi = []
    for card in sushi_cards:
        if remaining[card.sushi_card] > 0:
            unused_sushi.append(card)
            remaining[card.sushi_card] -= 1

    unused_sushi.sort(key=lambda c: CARD_VALUES.get(c.sushi_card, 0), reverse=True)

    standalone_score = _calculate_standalone_score(unused_sushi, shoyu_count)

    return sets_score + standalone_score


def _find_optimal_sets(counts: Counter) -> Tuple[Counter, int]:
    """Return (used_counter, score) using multiset counts for correct duplicate handling."""
    best_score = 0
    best_used: Counter = Counter()

    def _try(remaining: Counter, used: Counter, score: int):
        nonlocal best_score, best_used

        if score > best_score:
            best_score = score
            best_used = used.copy()

        for set_cards, set_value in _ALL_SETS:
            if all(remaining[t] > 0 for t in set_cards):
                new_remaining = remaining.copy()
                new_used = used.copy()
                for t in set_cards:
                    new_remaining[t] -= 1
                    new_used[t] += 1
                _try(new_remaining, new_used, score + set_value)

    _try(counts, Counter(), 0)
    return best_used, best_score


def _calculate_standalone_score(sushi_cards: List[Card], shoyu_count: int) -> int:
    if not sushi_cards:
        return 0

    base_values = [CARD_VALUES.get(c.sushi_card, 0) for c in sushi_cards]
    total = sum(base_values)

    # Each Shoyu doubles one standalone card, applied to highest-value cards first
    if shoyu_count > 0:
        shoyu_applications = min(shoyu_count, len(sushi_cards))
        for i in range(shoyu_applications):
            total += base_values[i]

    return total

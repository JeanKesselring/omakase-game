from typing import List, Set, Tuple, Dict
from .cards import Card, SushiCard, ActionCard, CARD_VALUES


OMAKASE_SET = {
    SushiCard.FATTY_TUNA,
    SushiCard.CONGER_EEL,
    SushiCard.CRAB,
    SushiCard.TUNA,
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


def calculate_score(hand: List[Card]) -> int:
    sushi_cards = [c for c in hand if c.is_sushi]
    action_cards = [c for c in hand if not c.is_sushi]
    shoyu_count = sum(1 for c in action_cards if c.action_card == ActionCard.SHOYU)

    sushi_types = [c.sushi_card for c in sushi_cards]
    sushi_type_set = set(sushi_types)

    used_in_sets, sets_score = _find_optimal_sets(sushi_type_set)

    unused_sushi = [c for c in sushi_cards if c.sushi_card not in used_in_sets]
    unused_sushi.sort(key=lambda c: CARD_VALUES.get(c.sushi_card, 0), reverse=True)

    standalone_score = _calculate_standalone_score(unused_sushi, shoyu_count)

    return sets_score + standalone_score


def _find_optimal_sets(sushi_types: Set[SushiCard]) -> Tuple[Set[SushiCard], int]:
    best_score = 0
    best_used = set()

    def _try_combination(remaining_types: Set[SushiCard], used: Set[SushiCard], score: int):
        nonlocal best_score, best_used

        if score > best_score:
            best_score = score
            best_used = used.copy()

        if OMAKASE_SET.issubset(remaining_types):
            new_remaining = remaining_types - OMAKASE_SET
            new_used = used | OMAKASE_SET
            _try_combination(new_remaining, new_used, score + OMAKASE_VALUE)

        if SAKURA_SET.issubset(remaining_types):
            new_remaining = remaining_types - SAKURA_SET
            new_used = used | SAKURA_SET
            _try_combination(new_remaining, new_used, score + SAKURA_VALUE)

        if UME_SET.issubset(remaining_types):
            new_remaining = remaining_types - UME_SET
            new_used = used | UME_SET
            _try_combination(new_remaining, new_used, score + UME_VALUE)

        if KIDS_SET.issubset(remaining_types):
            new_remaining = remaining_types - KIDS_SET
            new_used = used | KIDS_SET
            _try_combination(new_remaining, new_used, score + KIDS_VALUE)

    _try_combination(sushi_types, set(), 0)
    return best_used, best_score


def _calculate_standalone_score(sushi_cards: List[Card], shoyu_count: int) -> int:
    if not sushi_cards:
        return 0

    base_values = [CARD_VALUES.get(c.sushi_card, 0) for c in sushi_cards]
    total = sum(base_values)

    if shoyu_count > 0 and len(sushi_cards) > 0:
        shoyu_applications = min(shoyu_count, len(sushi_cards))
        for i in range(shoyu_applications):
            total += base_values[i]

    return total

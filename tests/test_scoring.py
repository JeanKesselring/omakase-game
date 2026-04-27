import pytest
from omakase.scoring import calculate_score
from omakase.cards import Card, SushiCard, ActionCard


def test_score_omakase_set():
    hand = [
        Card(1, is_sushi=True, sushi_card=SushiCard.FATTY_TUNA),
        Card(2, is_sushi=True, sushi_card=SushiCard.CONGER_EEL),
        Card(3, is_sushi=True, sushi_card=SushiCard.CRAB),
        Card(4, is_sushi=True, sushi_card=SushiCard.TUNA),
        Card(5, is_sushi=True, sushi_card=SushiCard.SALMON),
        Card(6, is_sushi=True, sushi_card=SushiCard.SALMON_ROE),
    ]

    score = calculate_score(hand)
    assert score == 6000


def test_score_sakura_set():
    hand = [
        Card(1, is_sushi=True, sushi_card=SushiCard.CONGER_EEL),
        Card(2, is_sushi=True, sushi_card=SushiCard.CRAB),
        Card(3, is_sushi=True, sushi_card=SushiCard.TUNA),
        Card(4, is_sushi=True, sushi_card=SushiCard.SHRIMP),
        Card(5, is_sushi=True, sushi_card=SushiCard.TUNA_ROLL),
        Card(6, is_sushi=True, sushi_card=SushiCard.SALMON_ROLL),
    ]

    score = calculate_score(hand)
    assert score == 4500


def test_score_ume_set():
    hand = [
        Card(1, is_sushi=True, sushi_card=SushiCard.SALMON_ROE),
        Card(2, is_sushi=True, sushi_card=SushiCard.SALMON),
        Card(3, is_sushi=True, sushi_card=SushiCard.SHRIMP),
        Card(4, is_sushi=True, sushi_card=SushiCard.TUNA_ROLL),
        Card(5, is_sushi=True, sushi_card=SushiCard.SALMON_ROLL),
        Card(6, is_sushi=True, sushi_card=SushiCard.OMELETTE),
    ]

    score = calculate_score(hand)
    assert score == 3500


def test_score_kids_set():
    hand = [
        Card(1, is_sushi=True, sushi_card=SushiCard.OMELETTE),
        Card(2, is_sushi=True, sushi_card=SushiCard.CUCUMBER_ROLL),
        Card(3, is_sushi=True, sushi_card=SushiCard.TOFU),
        Card(4, is_sushi=True, sushi_card=SushiCard.KARAAGE),
    ]

    score = calculate_score(hand)
    assert score == 2000


def test_score_standalone_cards():
    hand = [
        Card(1, is_sushi=True, sushi_card=SushiCard.FATTY_TUNA),
        Card(2, is_sushi=True, sushi_card=SushiCard.PREMIUM_EEL),
        Card(3, is_sushi=True, sushi_card=SushiCard.TUNA),
    ]

    score = calculate_score(hand)
    assert score == 1000 + 1200 + 400


def test_score_with_shoyu():
    hand = [
        Card(1, is_sushi=True, sushi_card=SushiCard.FATTY_TUNA),
        Card(2, is_sushi=True, sushi_card=SushiCard.PREMIUM_EEL),
        Card(3, is_sushi=False, action_card=ActionCard.SHOYU),
    ]

    score = calculate_score(hand)
    assert score == 1000 + 1200 + 1200


def test_score_with_multiple_shoyu():
    hand = [
        Card(1, is_sushi=True, sushi_card=SushiCard.FATTY_TUNA),
        Card(2, is_sushi=True, sushi_card=SushiCard.PREMIUM_EEL),
        Card(3, is_sushi=True, sushi_card=SushiCard.OCTOPUS),
        Card(4, is_sushi=False, action_card=ActionCard.SHOYU),
        Card(5, is_sushi=False, action_card=ActionCard.SHOYU),
    ]

    score = calculate_score(hand)
    assert score == 1000 + 1200 + 1100 + 1200 + 1100


def test_score_action_cards_worth_zero():
    hand = [
        Card(1, is_sushi=False, action_card=ActionCard.CHOPSTICKS),
        Card(2, is_sushi=False, action_card=ActionCard.SAKE),
        Card(3, is_sushi=False, action_card=ActionCard.GINGER),
    ]

    score = calculate_score(hand)
    assert score == 0


def test_score_mixed_hand():
    hand = [
        Card(1, is_sushi=True, sushi_card=SushiCard.FATTY_TUNA),
        Card(2, is_sushi=True, sushi_card=SushiCard.CONGER_EEL),
        Card(3, is_sushi=True, sushi_card=SushiCard.CRAB),
        Card(4, is_sushi=True, sushi_card=SushiCard.TUNA),
        Card(5, is_sushi=True, sushi_card=SushiCard.SALMON),
        Card(6, is_sushi=True, sushi_card=SushiCard.SALMON_ROE),
        Card(7, is_sushi=True, sushi_card=SushiCard.OMELETTE),
        Card(8, is_sushi=False, action_card=ActionCard.CHOPSTICKS),
    ]

    score = calculate_score(hand)
    assert score == 6000 + 200


def test_score_overlapping_sets():
    hand = [
        Card(1, is_sushi=True, sushi_card=SushiCard.FATTY_TUNA),
        Card(2, is_sushi=True, sushi_card=SushiCard.CONGER_EEL),
        Card(3, is_sushi=True, sushi_card=SushiCard.CRAB),
        Card(4, is_sushi=True, sushi_card=SushiCard.TUNA),
        Card(5, is_sushi=True, sushi_card=SushiCard.SALMON),
        Card(6, is_sushi=True, sushi_card=SushiCard.SALMON_ROE),
        Card(7, is_sushi=True, sushi_card=SushiCard.SHRIMP),
        Card(8, is_sushi=True, sushi_card=SushiCard.TUNA_ROLL),
        Card(9, is_sushi=True, sushi_card=SushiCard.SALMON_ROLL),
    ]

    score = calculate_score(hand)

    omakase_score = 6000
    remaining_from_sakura = {
        SushiCard.SHRIMP,
        SushiCard.TUNA_ROLL,
        SushiCard.SALMON_ROLL,
    }
    standalone = 400 + 300 + 300

    expected = omakase_score + standalone
    assert score == expected

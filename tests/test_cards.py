import pytest
from omakase.cards import (
    Card,
    SushiCard,
    ActionCard,
    create_deck,
    CARD_VALUES,
    CARD_COUNTS,
)


def test_card_creation():
    card = Card(0, is_sushi=True, sushi_card=SushiCard.FATTY_TUNA)
    assert card.card_id == 0
    assert card.is_sushi is True
    assert card.sushi_card == SushiCard.FATTY_TUNA
    assert card.get_value() == 1000
    assert card.name() == "fatty_tuna"


def test_action_card_creation():
    card = Card(1, is_sushi=False, action_card=ActionCard.CHOPSTICKS)
    assert card.card_id == 1
    assert card.is_sushi is False
    assert card.action_card == ActionCard.CHOPSTICKS
    assert card.get_value() == 0
    assert card.name() == "chopsticks"


def test_card_equality():
    card1 = Card(0, is_sushi=True, sushi_card=SushiCard.FATTY_TUNA)
    card2 = Card(0, is_sushi=True, sushi_card=SushiCard.FATTY_TUNA)
    card3 = Card(1, is_sushi=True, sushi_card=SushiCard.FATTY_TUNA)

    assert card1 == card2
    assert card1 != card3


def test_deck_creation():
    deck = create_deck()

    assert len(deck) == 62
    sushi_count = sum(1 for card in deck if card.is_sushi)
    action_count = sum(1 for card in deck if not card.is_sushi)

    assert sushi_count == 45
    assert action_count == 17


def test_deck_composition():
    deck = create_deck()

    fatty_tuna_cards = [c for c in deck if c.sushi_card == SushiCard.FATTY_TUNA]
    assert len(fatty_tuna_cards) == 1

    omelette_cards = [c for c in deck if c.sushi_card == SushiCard.OMELETTE]
    assert len(omelette_cards) == 5

    chopsticks_cards = [c for c in deck if c.action_card == ActionCard.CHOPSTICKS]
    assert len(chopsticks_cards) == 3

    ginger_cards = [c for c in deck if c.action_card == ActionCard.GINGER]
    assert len(ginger_cards) == 1

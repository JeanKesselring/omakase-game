from enum import Enum, auto
from dataclasses import dataclass
from typing import List


class CardType(Enum):
    SUSHI = auto()
    ACTION = auto()


class SushiCard(Enum):
    ASSORTED_SASHIMI = "assorted_sashimi"
    PREMIUM_EEL = "premium_eel"
    OCTOPUS = "octopus"
    FATTY_TUNA = "fatty_tuna"
    CONGER_EEL = "conger_eel"
    CRAB = "crab"
    KARAAGE = "karaage"
    SALMON_ROE = "salmon_roe"
    TUNA = "tuna"
    SALMON = "salmon"
    SHRIMP = "shrimp"
    CUCUMBER_ROLL = "cucumber_roll"
    SALMON_ROLL = "salmon_roll"
    TUNA_ROLL = "tuna_roll"
    OMELETTE = "omelette"
    TOFU = "tofu"


class ActionCard(Enum):
    CHOPSTICKS = "chopsticks"
    SAKE = "sake"
    UMESHU = "umeshu"
    CHEFS_CHOICE = "chefs_choice"
    WASABI = "wasabi"
    MATCHA = "matcha"
    SHOYU = "shoyu"
    FORK = "fork"
    GINGER = "ginger"


CARD_VALUES = {
    SushiCard.ASSORTED_SASHIMI: 1500,
    SushiCard.PREMIUM_EEL: 1200,
    SushiCard.OCTOPUS: 1100,
    SushiCard.FATTY_TUNA: 1000,
    SushiCard.CONGER_EEL: 700,
    SushiCard.CRAB: 600,
    SushiCard.KARAAGE: 500,
    SushiCard.SALMON_ROE: 500,
    SushiCard.TUNA: 400,
    SushiCard.SALMON: 400,
    SushiCard.SHRIMP: 400,
    SushiCard.CUCUMBER_ROLL: 300,
    SushiCard.SALMON_ROLL: 300,
    SushiCard.TUNA_ROLL: 300,
    SushiCard.OMELETTE: 200,
    SushiCard.TOFU: 200,
}

CARD_COUNTS = {
    SushiCard.ASSORTED_SASHIMI: 1,
    SushiCard.PREMIUM_EEL: 1,
    SushiCard.OCTOPUS: 1,
    SushiCard.FATTY_TUNA: 1,
    SushiCard.CONGER_EEL: 2,
    SushiCard.CRAB: 2,
    SushiCard.KARAAGE: 3,
    SushiCard.SALMON_ROE: 3,
    SushiCard.TUNA: 3,
    SushiCard.SALMON: 3,
    SushiCard.SHRIMP: 3,
    SushiCard.CUCUMBER_ROLL: 4,
    SushiCard.SALMON_ROLL: 4,
    SushiCard.TUNA_ROLL: 4,
    SushiCard.OMELETTE: 5,
    SushiCard.TOFU: 5,
    ActionCard.CHOPSTICKS: 3,
    ActionCard.SAKE: 2,
    ActionCard.UMESHU: 2,
    ActionCard.CHEFS_CHOICE: 2,
    ActionCard.WASABI: 2,
    ActionCard.MATCHA: 2,
    ActionCard.SHOYU: 2,
    ActionCard.FORK: 1,
    ActionCard.GINGER: 1,
}


@dataclass(frozen=True)
class Card:
    card_id: int
    is_sushi: bool
    sushi_card: SushiCard | None = None
    action_card: ActionCard | None = None

    def __hash__(self):
        return hash(self.card_id)

    def __eq__(self, other):
        if not isinstance(other, Card):
            return False
        return self.card_id == other.card_id

    def get_value(self) -> int:
        if self.is_sushi and self.sushi_card:
            return CARD_VALUES.get(self.sushi_card, 0)
        return 0

    def name(self) -> str:
        if self.is_sushi and self.sushi_card:
            return self.sushi_card.value
        elif not self.is_sushi and self.action_card:
            return self.action_card.value
        return "unknown"


def create_deck() -> List[Card]:
    cards = []
    card_id = 0

    for sushi_card, count in CARD_COUNTS.items():
        if isinstance(sushi_card, SushiCard):
            for _ in range(count):
                cards.append(Card(card_id, is_sushi=True, sushi_card=sushi_card))
                card_id += 1

    for action_card, count in CARD_COUNTS.items():
        if isinstance(action_card, ActionCard):
            for _ in range(count):
                cards.append(Card(card_id, is_sushi=False, action_card=action_card))
                card_id += 1

    return cards

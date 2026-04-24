import numpy as np
from typing import List, Tuple, Optional, Set
from dataclasses import dataclass, field
from copy import deepcopy
import random

from .cards import Card, SushiCard, ActionCard, create_deck, CARD_VALUES


class Phase(int):
    PHASE_1 = 0
    PHASE_2 = 1
    PHASE_3 = 2
    PHASE_4 = 3


@dataclass
class PlayerState:
    hand: List[Card] = field(default_factory=list)
    max_hand_size: int = 8
    matcha_count: int = 0
    wasabi_skip_flag: int = 0
    check_protected: bool = False
    has_called_check: bool = False


@dataclass
class GameState:
    num_players: int
    current_player: int
    phase: int
    players: List[PlayerState] = field(default_factory=list)
    conveyor_belt: List[Card] = field(default_factory=list)
    deck: List[Card] = field(default_factory=list)
    trash: List[Card] = field(default_factory=list)
    action_played_this_turn: bool = False
    game_ending: bool = False
    game_over: bool = False
    reshuffles_used: int = 0

    def __post_init__(self):
        if not self.players:
            self.players = [PlayerState() for _ in range(self.num_players)]

    def get_opponent_indices(self, player_idx: int) -> List[int]:
        return [i for i in range(self.num_players) if i != player_idx]

    def get_active_player(self) -> PlayerState:
        return self.players[self.current_player]

    def copy(self):
        return deepcopy(self)


def initialize_game(num_players: int = 2, seed: Optional[int] = None) -> GameState:
    if seed is not None:
        random.seed(seed)
        np.random.seed(seed)

    deck = create_deck()
    random.shuffle(deck)

    state = GameState(num_players=num_players, current_player=0, phase=Phase.PHASE_1)
    state.players = [PlayerState() for _ in range(num_players)]

    for i in range(num_players):
        state.players[i].hand.append(deck.pop())

    for _ in range(6):
        state.conveyor_belt.append(deck.pop())

    state.deck = deck
    return state


def draw_from_deck(state: GameState) -> Card:
    if not state.deck:
        if state.reshuffles_used >= (state.num_players - 1):
            state.game_over = True
            return None
        state.deck = state.trash[:]
        random.shuffle(state.deck)
        state.trash = []
        state.reshuffles_used += 1

    return state.deck.pop(0)


def play_action_card(
    state: GameState, player_idx: int, action_card: ActionCard
) -> bool:
    player = state.players[player_idx]

    card_in_hand = None
    for card in player.hand:
        if not card.is_sushi and card.action_card == action_card:
            card_in_hand = card
            break

    if card_in_hand is None:
        return False

    if action_card == ActionCard.GINGER:
        return False

    if action_card == ActionCard.MATCHA:
        player.hand.remove(card_in_hand)
        player.matcha_count += 1
        player.max_hand_size += 1
        new_card = draw_from_deck(state)
        if new_card:
            player.hand.append(new_card)
        return True

    if action_card == ActionCard.CHOPSTICKS:
        player.hand.remove(card_in_hand)
        state.trash.append(card_in_hand)
        opponents = state.get_opponent_indices(player_idx)
        if opponents:
            victim = random.choice(opponents)
            if state.players[victim].hand:
                stolen_card = random.choice(state.players[victim].hand)
                state.players[victim].hand.remove(stolen_card)
                player.hand.append(stolen_card)
        return True

    if action_card == ActionCard.SAKE:
        player.hand.remove(card_in_hand)
        state.trash.append(card_in_hand)
        opponents = state.get_opponent_indices(player_idx)
        if opponents:
            victim = random.choice(opponents)
            if state.players[victim].hand:
                stolen_card = random.choice(state.players[victim].hand)
                state.players[victim].hand.remove(stolen_card)
                player.hand.append(stolen_card)
                if player.hand:
                    returned_card = random.choice(player.hand)
                    player.hand.remove(returned_card)
                    state.players[victim].hand.append(returned_card)
        return True

    if action_card == ActionCard.UMESHU:
        player.hand.remove(card_in_hand)
        state.trash.append(card_in_hand)
        opponents = state.get_opponent_indices(player_idx)
        if opponents:
            victim = random.choice(opponents)
            combined_hand = player.hand + state.players[victim].hand
            random.shuffle(combined_hand)
            player.hand = []
            victim_hand = []
            for i, card in enumerate(combined_hand):
                if (i % 2) == 0:
                    player.hand.append(card)
                else:
                    victim_hand.append(card)
            state.players[victim].hand = victim_hand
        return True

    if action_card == ActionCard.CHEFS_CHOICE:
        player.hand.remove(card_in_hand)
        state.trash.append(card_in_hand)
        drawn_cards = []
        for _ in range(3):
            new_card = draw_from_deck(state)
            if new_card:
                drawn_cards.append(new_card)
        for card in drawn_cards:
            player.hand.append(card)
        return True

    if action_card == ActionCard.FORK:
        player.hand.remove(card_in_hand)
        state.trash.append(card_in_hand)
        opponents = state.get_opponent_indices(player_idx)
        for victim in opponents:
            if state.players[victim].check_protected:
                continue
            if state.players[victim].hand:
                most_expensive = max(
                    state.players[victim].hand,
                    key=lambda c: c.get_value() if c.is_sushi else 0,
                )
                state.players[victim].hand.remove(most_expensive)
                state.trash.append(most_expensive)
        return True

    if action_card == ActionCard.WASABI:
        return False

    if action_card == ActionCard.SHOYU:
        return False

    return False


def exchange_card(
    state: GameState, player_idx: int, hand_card_idx: int, belt_card_idx: int
) -> bool:
    player = state.players[player_idx]

    if hand_card_idx < 0 or hand_card_idx >= len(player.hand):
        return False
    if belt_card_idx < 0 or belt_card_idx >= len(state.conveyor_belt):
        return False

    hand_card = player.hand[hand_card_idx]
    belt_card = state.conveyor_belt[belt_card_idx]

    if hand_card.card_id == belt_card.card_id:
        return False

    if hand_card.is_sushi and belt_card.is_sushi:
        if hand_card.sushi_card == belt_card.sushi_card:
            return False

    if not hand_card.is_sushi and not belt_card.is_sushi:
        if hand_card.action_card == belt_card.action_card:
            return False

    player.hand[hand_card_idx] = belt_card
    state.conveyor_belt[belt_card_idx] = hand_card

    return True


def move_conveyor(state: GameState):
    if state.conveyor_belt:
        rightmost = state.conveyor_belt.pop()
        state.trash.append(rightmost)

    new_card = draw_from_deck(state)
    if new_card:
        state.conveyor_belt.insert(0, new_card)


def enforce_hand_limit(state: GameState, player_idx: int):
    player = state.players[player_idx]
    current_max = player.max_hand_size

    while len(player.hand) > current_max:
        sushi_cards = [c for c in player.hand if c.is_sushi]
        if sushi_cards:
            card_to_discard = random.choice(sushi_cards)
        else:
            action_cards = [c for c in player.hand if not c.is_sushi]
            if action_cards:
                card_to_discard = random.choice(action_cards)
            else:
                break

        player.hand.remove(card_to_discard)
        state.trash.append(card_to_discard)


def can_call_check(state: GameState, player_idx: int) -> bool:
    if state.players[player_idx].has_called_check:
        return False
    player_hand = state.players[player_idx].hand
    return has_valid_set(player_hand)


def has_valid_set(hand: List[Card]) -> bool:
    sushi_cards = [c for c in hand if c.is_sushi]
    sushi_types = set(c.sushi_card for c in sushi_cards)

    if _check_omakase_set(sushi_types):
        return True
    if _check_sakura_set(sushi_types):
        return True
    if _check_ume_set(sushi_types):
        return True
    if _check_kids_set(sushi_types):
        return True

    return False


def _check_omakase_set(sushi_types: Set[SushiCard]) -> bool:
    required = {
        SushiCard.FATTY_TUNA,
        SushiCard.CONGER_EEL,
        SushiCard.CRAB,
        SushiCard.TUNA,
        SushiCard.SALMON_ROE,
    }
    return required.issubset(sushi_types)


def _check_sakura_set(sushi_types: Set[SushiCard]) -> bool:
    required = {
        SushiCard.CONGER_EEL,
        SushiCard.CRAB,
        SushiCard.TUNA,
        SushiCard.SHRIMP,
        SushiCard.TUNA_ROLL,
        SushiCard.SALMON_ROLL,
    }
    return required.issubset(sushi_types)


def _check_ume_set(sushi_types: Set[SushiCard]) -> bool:
    required = {
        SushiCard.SALMON_ROE,
        SushiCard.SALMON,
        SushiCard.SHRIMP,
        SushiCard.TUNA_ROLL,
        SushiCard.SALMON_ROLL,
        SushiCard.OMELETTE,
    }
    return required.issubset(sushi_types)


def _check_kids_set(sushi_types: Set[SushiCard]) -> bool:
    required = {SushiCard.OMELETTE, SushiCard.CUCUMBER_ROLL, SushiCard.TOFU, SushiCard.KARAAGE}
    return required.issubset(sushi_types)

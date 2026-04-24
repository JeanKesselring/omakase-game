import pytest
from omakase.game_state import (
    GameState,
    PlayerState,
    initialize_game,
    exchange_card,
    play_action_card,
    can_call_check,
    has_valid_set,
)
from omakase.cards import SushiCard, ActionCard, Card


def test_initialize_game_2_players():
    state = initialize_game(num_players=2, seed=42)

    assert state.num_players == 2
    assert len(state.players) == 2
    assert len(state.conveyor_belt) == 6
    assert all(len(p.hand) == 1 for p in state.players)
    assert len(state.deck) == 62 - 2 - 6
    assert state.current_player == 0
    assert state.phase == 0


def test_initialize_game_3_players():
    state = initialize_game(num_players=3, seed=42)

    assert state.num_players == 3
    assert len(state.players) == 3
    assert len(state.conveyor_belt) == 6
    assert all(len(p.hand) == 1 for p in state.players)
    assert len(state.deck) == 62 - 3 - 6


def test_exchange_card_valid():
    state = initialize_game(num_players=2, seed=42)

    player = state.players[0]
    hand_card = player.hand[0]
    belt_card = state.conveyor_belt[0]

    initial_hand_card_id = hand_card.card_id
    initial_belt_card_id = belt_card.card_id

    result = exchange_card(state, 0, 0, 0)

    assert result is True
    assert player.hand[0].card_id == initial_belt_card_id
    assert state.conveyor_belt[0].card_id == initial_hand_card_id


def test_exchange_card_identical_sushi():
    state = initialize_game(num_players=2, seed=123)

    player = state.players[0]
    card1 = Card(100, is_sushi=True, sushi_card=SushiCard.FATTY_TUNA)
    card2 = Card(101, is_sushi=True, sushi_card=SushiCard.FATTY_TUNA)

    player.hand = [card1]
    state.conveyor_belt[0] = card2

    result = exchange_card(state, 0, 0, 0)
    assert result is False


def test_exchange_card_identical_action():
    state = initialize_game(num_players=2, seed=123)

    player = state.players[0]
    card1 = Card(100, is_sushi=False, action_card=ActionCard.CHOPSTICKS)
    card2 = Card(101, is_sushi=False, action_card=ActionCard.CHOPSTICKS)

    player.hand = [card1]
    state.conveyor_belt[0] = card2

    result = exchange_card(state, 0, 0, 0)
    assert result is False


def test_exchange_card_same_card_id():
    state = initialize_game(num_players=2, seed=42)

    player = state.players[0]
    hand_card = player.hand[0]

    state.conveyor_belt[0] = hand_card

    result = exchange_card(state, 0, 0, 0)
    assert result is False


def test_play_action_card_matcha():
    state = initialize_game(num_players=2, seed=42)

    player = state.players[0]
    card = Card(100, is_sushi=False, action_card=ActionCard.MATCHA)
    player.hand.append(card)

    initial_max = player.max_hand_size
    initial_matcha_count = player.matcha_count

    result = play_action_card(state, 0, ActionCard.MATCHA)

    assert result is True
    assert card not in player.hand
    assert player.matcha_count == initial_matcha_count + 1
    assert player.max_hand_size == initial_max + 1


def test_play_action_card_chopsticks():
    state = initialize_game(num_players=2, seed=42)

    player0 = state.players[0]
    player1 = state.players[1]

    chop_card = Card(100, is_sushi=False, action_card=ActionCard.CHOPSTICKS)
    target_card = player1.hand[0]

    player0.hand = [chop_card, Card(101, is_sushi=True, sushi_card=SushiCard.FATTY_TUNA)]
    player1.hand = [target_card]

    result = play_action_card(state, 0, ActionCard.CHOPSTICKS)

    assert result is True
    assert chop_card not in player0.hand
    assert chop_card in state.trash
    assert target_card in player0.hand
    assert target_card not in player1.hand


def test_can_call_check_with_omakase():
    state = initialize_game(num_players=2, seed=42)

    player = state.players[0]
    player.hand = [
        Card(1, is_sushi=True, sushi_card=SushiCard.FATTY_TUNA),
        Card(2, is_sushi=True, sushi_card=SushiCard.CONGER_EEL),
        Card(3, is_sushi=True, sushi_card=SushiCard.CRAB),
        Card(4, is_sushi=True, sushi_card=SushiCard.TUNA),
        Card(5, is_sushi=True, sushi_card=SushiCard.SALMON_ROE),
    ]

    result = can_call_check(state, 0)
    assert result is True


def test_can_call_check_without_set():
    state = initialize_game(num_players=2, seed=42)

    player = state.players[0]
    player.hand = [
        Card(1, is_sushi=True, sushi_card=SushiCard.FATTY_TUNA),
        Card(2, is_sushi=True, sushi_card=SushiCard.OMELETTE),
    ]

    result = can_call_check(state, 0)
    assert result is False


def test_has_valid_set_kids():
    hand = [
        Card(1, is_sushi=True, sushi_card=SushiCard.OMELETTE),
        Card(2, is_sushi=True, sushi_card=SushiCard.CUCUMBER_ROLL),
        Card(3, is_sushi=True, sushi_card=SushiCard.TOFU),
        Card(4, is_sushi=True, sushi_card=SushiCard.KARAAGE),
    ]

    result = has_valid_set(hand)
    assert result is True


def test_player_state_defaults():
    player = PlayerState()

    assert len(player.hand) == 0
    assert player.max_hand_size == 8
    assert player.matcha_count == 0
    assert player.wasabi_skip_flag == 0
    assert player.check_protected is False
    assert player.has_called_check is False

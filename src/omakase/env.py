import gymnasium as gym
import numpy as np
from typing import Any, Dict, Tuple, Optional
import random

from .game_state import (
    GameState,
    Phase,
    initialize_game,
    draw_from_deck,
    play_action_card,
    exchange_card,
    move_conveyor,
    enforce_hand_limit,
    can_call_check,
)
from .cards import Card, SushiCard, ActionCard
from .scoring import calculate_score


class OmakaseEnv(gym.Env):
    metadata = {"render_modes": ["human"]}

    def __init__(self, num_players: int = 2, seed: Optional[int] = None, render_mode: str = None):
        self.num_players = num_players
        self.seed_value = seed
        self.render_mode = render_mode

        self.state: Optional[GameState] = None
        self.action_history: list = []

        max_hand_size = 8 + 2
        max_belt_size = 6
        max_deck_size = 62

        self.observation_space = gym.spaces.Dict(
            {
                "hand": gym.spaces.Box(0, 62, shape=(max_hand_size,), dtype=np.int32),
                "hand_size": gym.spaces.Box(0, max_hand_size, shape=(1,), dtype=np.int32),
                "conveyor_belt": gym.spaces.Box(
                    0, 62, shape=(max_belt_size,), dtype=np.int32
                ),
                "opponent_hand_size": gym.spaces.Box(0, max_hand_size, shape=(1,), dtype=np.int32),
                "deck_size": gym.spaces.Box(0, max_deck_size, shape=(1,), dtype=np.int32),
                "matcha_count": gym.spaces.Box(0, 2, shape=(1,), dtype=np.int32),
                "wasabi_skip_flag": gym.spaces.Box(0, 10, shape=(1,), dtype=np.int32),
                "check_protected": gym.spaces.Box(0, 1, shape=(1,), dtype=np.int32),
                "current_phase": gym.spaces.Box(0, 3, shape=(1,), dtype=np.int32),
                "turn_number": gym.spaces.Box(0, 1000, shape=(1,), dtype=np.int32),
            }
        )

        self.action_space = gym.spaces.Discrete(1)

        self.turn_count = 0

    def reset(
        self, *, seed: Optional[int] = None, options: Optional[Dict[str, Any]] = None
    ) -> Tuple[Dict[str, np.ndarray], Dict[str, Any]]:
        if seed is not None:
            self.seed_value = seed

        self.state = initialize_game(self.num_players, self.seed_value)
        self.action_history = []
        self.turn_count = 0
        self._handle_turn_start()

        return self._get_observation(), {}

    def step(self, action: int) -> Tuple[Dict[str, np.ndarray], float, bool, bool, Dict[str, Any]]:
        if self.state.game_over:
            return self._get_observation(), 0.0, True, False, {}

        player_idx = self.state.current_player

        if self.state.phase == Phase.PHASE_1:
            self._handle_phase_1(action)
        elif self.state.phase == Phase.PHASE_2:
            self._handle_phase_2(action)
        elif self.state.phase == Phase.PHASE_3:
            self._handle_phase_3(action)
        elif self.state.phase == Phase.PHASE_4:
            self._handle_phase_4(action)

        obs = self._get_observation()
        reward = 0.0
        terminated = self.state.game_over
        truncated = False
        info = {
            "current_player": self.state.current_player,
            "phase": self.state.phase,
        }

        return obs, reward, terminated, truncated, info

    def _handle_phase_1(self, action: int):
        player = self.state.get_active_player()
        action_cards = [c for c in player.hand if not c.is_sushi]

        if action == 0:
            self.state.phase = Phase.PHASE_2
        else:
            action_idx = action - 1
            if action_idx < len(action_cards):
                card = action_cards[action_idx]
                if play_action_card(self.state, self.state.current_player, card.action_card):
                    self.state.action_played_this_turn = True
                    self.state.phase = Phase.PHASE_2

    def _handle_phase_2(self, action: int):
        player = self.state.get_active_player()

        valid_exchanges = []
        for h_idx in range(len(player.hand)):
            for b_idx in range(len(self.state.conveyor_belt)):
                hand_card = player.hand[h_idx]
                belt_card = self.state.conveyor_belt[b_idx]

                if hand_card.card_id == belt_card.card_id:
                    continue

                if hand_card.is_sushi and belt_card.is_sushi:
                    if hand_card.sushi_card == belt_card.sushi_card:
                        continue

                if not hand_card.is_sushi and not belt_card.is_sushi:
                    if hand_card.action_card == belt_card.action_card:
                        continue

                valid_exchanges.append((h_idx, b_idx))

        if action < len(valid_exchanges):
            hand_idx, belt_idx = valid_exchanges[action]
            if exchange_card(self.state, self.state.current_player, hand_idx, belt_idx):
                self.state.phase = Phase.PHASE_3

    def _handle_phase_3(self, action: int):
        if self.state.action_played_this_turn:
            self.state.phase = Phase.PHASE_4
            return

        player = self.state.get_active_player()
        action_cards = [c for c in player.hand if not c.is_sushi]

        if action == 0:
            self.state.phase = Phase.PHASE_4
        else:
            action_idx = action - 1
            if action_idx < len(action_cards):
                card = action_cards[action_idx]
                if play_action_card(self.state, self.state.current_player, card.action_card):
                    self.state.phase = Phase.PHASE_4

    def _handle_phase_4(self, action: int):
        player = self.state.get_active_player()

        if action == 1 and can_call_check(self.state, self.state.current_player):
            player.has_called_check = True
            player.check_protected = True
            self.state.game_ending = True

        self._end_turn()

    def _end_turn(self):
        move_conveyor(self.state)
        enforce_hand_limit(self.state, self.state.current_player)

        if self.state.game_over:
            return

        self.turn_count += 1
        next_player_idx = (self.state.current_player + 1) % self.state.num_players
        self.state.current_player = next_player_idx
        self.state.phase = Phase.PHASE_1
        self.state.action_played_this_turn = False

        self._handle_turn_start()

    def _handle_turn_start(self):
        player = self.state.get_active_player()

        if player.wasabi_skip_flag > 0:
            player.wasabi_skip_flag -= 1
            self._end_turn()
            return

        card = draw_from_deck(self.state)
        if card:
            if card.action_card == ActionCard.WASABI and not card.is_sushi:
                player.wasabi_skip_flag += 1
            player.hand.append(card)

        if self.state.game_over:
            return

    def _get_observation(self) -> Dict[str, np.ndarray]:
        player = self.state.get_active_player()
        opponent_indices = self.state.get_opponent_indices(self.state.current_player)

        hand_size = len(player.hand)
        hand_ids = np.zeros(10, dtype=np.int32)
        for i, card in enumerate(player.hand[:10]):
            hand_ids[i] = card.card_id

        belt_ids = np.zeros(6, dtype=np.int32)
        for i, card in enumerate(self.state.conveyor_belt[:6]):
            belt_ids[i] = card.card_id

        opponent_hand_size = (
            len(self.state.players[opponent_indices[0]].hand) if opponent_indices else 0
        )

        return {
            "hand": hand_ids,
            "hand_size": np.array([hand_size], dtype=np.int32),
            "conveyor_belt": belt_ids,
            "opponent_hand_size": np.array([opponent_hand_size], dtype=np.int32),
            "deck_size": np.array([len(self.state.deck)], dtype=np.int32),
            "matcha_count": np.array([player.matcha_count], dtype=np.int32),
            "wasabi_skip_flag": np.array([player.wasabi_skip_flag], dtype=np.int32),
            "check_protected": np.array([int(player.check_protected)], dtype=np.int32),
            "current_phase": np.array([self.state.phase], dtype=np.int32),
            "turn_number": np.array([self.turn_count], dtype=np.int32),
        }

    def render(self):
        if self.render_mode == "human":
            self._render_human()

    def _render_human(self):
        if not self.state:
            return

        print(f"\n{'='*80}")
        print(f"Turn {self.turn_count} | Player {self.state.current_player} | Phase {self.state.phase}")
        print(f"{'='*80}")

        player = self.state.get_active_player()
        print(f"Current Player Hand ({len(player.hand)} cards):")
        for i, card in enumerate(player.hand):
            value_str = f"¥{card.get_value()}" if card.is_sushi else card.name()
            print(f"  {i}: {card.name()} ({value_str})")

        print(f"\nConveyor Belt ({len(self.state.conveyor_belt)} cards):")
        for i, card in enumerate(self.state.conveyor_belt):
            value_str = f"¥{card.get_value()}" if card.is_sushi else card.name()
            print(f"  {i}: {card.name()} ({value_str})")

        print(f"\nDeck Size: {len(self.state.deck)}")
        print(f"Trash Size: {len(self.state.trash)}")

        for i, opponent_idx in enumerate(self.state.get_opponent_indices(self.state.current_player)):
            opponent = self.state.players[opponent_idx]
            print(
                f"Player {opponent_idx} Hand Size: {len(opponent.hand)} "
                f"(Protected: {opponent.check_protected})"
            )

    def get_legal_actions(self) -> list:
        player = self.state.get_active_player()

        if self.state.phase == Phase.PHASE_1:
            actions = [0]
            action_cards = [c for c in player.hand if not c.is_sushi]
            for _ in action_cards:
                actions.append(len(actions))
            return actions

        elif self.state.phase == Phase.PHASE_2:
            actions = []
            for h_idx in range(len(player.hand)):
                for b_idx in range(len(self.state.conveyor_belt)):
                    hand_card = player.hand[h_idx]
                    belt_card = self.state.conveyor_belt[b_idx]

                    if hand_card.card_id == belt_card.card_id:
                        continue

                    if hand_card.is_sushi and belt_card.is_sushi:
                        if hand_card.sushi_card == belt_card.sushi_card:
                            continue

                    actions.append(len(actions))
            return actions if actions else [0]

        elif self.state.phase == Phase.PHASE_3:
            if self.state.action_played_this_turn:
                return [0]

            actions = [0]
            action_cards = [c for c in player.hand if not c.is_sushi]
            for _ in action_cards:
                actions.append(len(actions))
            return actions

        elif self.state.phase == Phase.PHASE_4:
            actions = [0]
            if can_call_check(self.state, self.state.current_player):
                actions.append(1)
            return actions

        return [0]

    def get_game_results(self) -> Dict[int, int]:
        scores = {}
        for i in range(self.num_players):
            scores[i] = calculate_score(self.state.players[i].hand)
        return scores

import random as _random

import gymnasium as gym
import numpy as np
from typing import Dict, List, Optional, Tuple

from .env import OmakaseEnv, MAX_BELT_SIZE
from .agent import RandomAgent
from .cards import ActionCard, Card
from .scoring import calculate_score, OMAKASE_SET, SAKURA_SET, UME_SET, KIDS_SET

_ACTION_TYPE_IDX = {
    ActionCard.CHOPSTICKS: 1,
    ActionCard.SAKE: 2,
    ActionCard.UMESHU: 3,
    ActionCard.CHEFS_CHOICE: 4,
    ActionCard.WASABI: 5,
    ActionCard.MATCHA: 6,
    ActionCard.SHOYU: 7,
    ActionCard.FORK: 8,
    ActionCard.GINGER: 9,
}
_NUM_ACTION_TYPES = 9
_SET_VALUES = (6000.0, 4500.0, 3500.0, 2000.0)
_MAX_SCORE = 12000.0

# Observation layout (95 total):
#   Hand            : 10 slots × 4 features = 40
#   Belt            :  6 slots × 4 features = 24
#   Scalars         :  8 game scalars       =  8
#   Set progress    :  4 set fractions      =  4
#   Score context   :  4 features           =  4
#   Belt deltas     :  6 score-delta feat.  =  6
#   Opp set progress:  4 set fractions      =  4
#   Action context  :  5 card-value feat.   =  5
OBS_SIZE = 95


def _card_features(card, max_card_value: float):
    is_sushi = float(card.is_sushi)
    value_norm = (card.get_value() / max_card_value) if card.is_sushi else 0.0
    action_type_norm = (
        0.0 if card.is_sushi
        else _ACTION_TYPE_IDX.get(card.action_card, 0) / _NUM_ACTION_TYPES
    )
    return 1.0, is_sushi, value_norm, action_type_norm


def _set_progress(hand_sushi_types: set) -> Tuple[float, float, float, float]:
    return (
        len(OMAKASE_SET & hand_sushi_types) / len(OMAKASE_SET),
        len(SAKURA_SET & hand_sushi_types) / len(SAKURA_SET),
        len(UME_SET & hand_sushi_types) / len(UME_SET),
        len(KIDS_SET & hand_sushi_types) / len(KIDS_SET),
    )


def _valid_swap(hand_card: Card, belt_card: Card) -> bool:
    """Return True if this hand↔belt exchange is valid per Phase 2 rules."""
    if not hand_card.is_sushi and hand_card.action_card == ActionCard.GINGER:
        return False
    if hand_card.card_id == belt_card.card_id:
        return False
    if hand_card.is_sushi and belt_card.is_sushi and hand_card.sushi_card == belt_card.sushi_card:
        return False
    if (not hand_card.is_sushi and not belt_card.is_sushi
            and hand_card.action_card == belt_card.action_card):
        return False
    return True


def _belt_score_deltas(hand: List[Card], belt: List[Card], current_score: int) -> List[float]:
    """For each belt slot (up to 6), best normalised score delta from any valid swap."""
    deltas = []
    for b_idx in range(min(len(belt), 6)):
        belt_card = belt[b_idx]
        best = 0.0
        for h_idx, hand_card in enumerate(hand):
            if not _valid_swap(hand_card, belt_card):
                continue
            new_hand = hand[:h_idx] + [belt_card] + hand[h_idx + 1:]
            delta = float(calculate_score(new_hand) - current_score)
            if delta > best:
                best = delta
        deltas.append(min(best / 8000.0, 1.0))
    while len(deltas) < 6:
        deltas.append(0.0)
    return deltas


class SelfPlayEnv(gym.Env):
    """Single-agent wrapper for multi-player Omakase game with self-play support."""

    metadata = {"render_modes": []}

    def __init__(self, num_players: int = 2, seed: Optional[int] = None):
        super().__init__()
        self.env = OmakaseEnv(num_players=num_players, seed=seed)
        self.num_players = num_players
        self.seed_value = seed
        self.default_opponent = RandomAgent()
        self.opponent_model = None
        self.max_card_value = 1500.0

        self.observation_space = gym.spaces.Box(
            low=0.0, high=1.0, shape=(OBS_SIZE,), dtype=np.float32
        )
        self.action_space = gym.spaces.Discrete(64)

    def action_masks(self) -> np.ndarray:
        legal_actions = self.env.get_legal_actions()
        mask = np.zeros(64, dtype=bool)
        for action in legal_actions:
            if action < 64:
                mask[action] = True
        return mask

    def reset(
        self, *, seed: Optional[int] = None, options: Optional[Dict] = None
    ) -> Tuple[np.ndarray, Dict]:
        if seed is not None:
            self.seed_value = seed
        self.env.reset(seed=seed)
        return self._encode_obs(), {}

    def step(self, action: int) -> Tuple[np.ndarray, float, bool, bool, Dict]:
        p0 = self.env.state.players[0]
        score_before = calculate_score(p0.hand)
        sushi_before = {c.sushi_card for c in p0.hand if c.is_sushi}

        # Opponent score snapshot — used for competitive reward.
        opp_score_before = sum(
            calculate_score(self.env.state.players[p].hand)
            for p in range(1, self.num_players)
        ) if self.num_players > 1 else 0

        legal_actions = self.env.get_legal_actions()
        if action not in legal_actions:
            action = _random.choice(legal_actions)
        self.env.step(action)

        while (
            not self.env.state.game_over
            and self.env.state.current_player != 0
        ):
            self.env.step(self._get_opponent_action())

        obs = self._encode_obs()
        terminated = self.env.state.game_over

        p0 = self.env.state.players[0]
        score_after = calculate_score(p0.hand)

        # Competitive score delta: reward own improvement, penalise opponent improvement.
        opp_score_after = sum(
            calculate_score(self.env.state.players[p].hand)
            for p in range(1, self.num_players)
        ) if self.num_players > 1 else 0

        my_delta = score_after - score_before
        opp_delta = opp_score_after - opp_score_before
        reward = (my_delta - 0.5 * opp_delta) / 50000.0

        # Set-completion bonus: extra reward for each step toward any set.
        sushi_after = {c.sushi_card for c in p0.hand if c.is_sushi}
        p_before = _set_progress(sushi_before)
        p_after = _set_progress(sushi_after)
        for pb, pa, sv in zip(p_before, p_after, _SET_VALUES):
            if pa > pb:
                reward += (pa - pb) * sv / 25000.0

        if terminated:
            scores = self.env.get_game_results()
            p0_score = scores.get(0, 0)
            total = sum(scores.values()) or 1
            # Score-margin terminal reward in [-1, +1]: more informative than binary win/loss.
            reward += (p0_score / total) * 2.0 - 1.0
            # Bonus for each completed set at game end.
            final_sushi = {c.sushi_card for c in p0.hand if c.is_sushi}
            for progress, sv in zip(_set_progress(final_sushi), _SET_VALUES):
                if progress == 1.0:
                    reward += sv / 25000.0

        return obs, reward, terminated, False, {}

    def _get_opponent_action(self) -> int:
        legal_actions = self.env.get_legal_actions()
        if self.opponent_model is not None:
            # _encode_obs() uses get_active_player(), so it correctly encodes from
            # the current (opponent) player's perspective during their turn.
            obs = self._encode_obs()
            mask = np.zeros(64, dtype=bool)
            for a in legal_actions:
                if a < 64:
                    mask[a] = True
            action, _ = self.opponent_model.predict(obs, action_masks=mask, deterministic=False)
            if int(action) in legal_actions:
                return int(action)
            return _random.choice(legal_actions)
        return self.default_opponent.choose_action(self.env, legal_actions)

    def load_opponent_from_path(self, path: str) -> None:
        """Load a checkpoint as the opponent. Safe to call from a subprocess."""
        from sb3_contrib import MaskablePPO
        self.opponent_model = MaskablePPO.load(path, device="cpu")

    def set_opponent_model(self, model) -> None:
        self.opponent_model = model

    def _encode_obs(self) -> np.ndarray:
        # Always encode from the active player's perspective so the same model
        # can be used as both training agent (player 0) and self-play opponent.
        active_idx = self.env.state.current_player
        opp_idx = 1 - active_idx  # works for 2-player; good enough for self-play curriculum

        player = self.env.state.get_active_player()
        features = []

        for i in range(10):
            if i < len(player.hand):
                features.extend(_card_features(player.hand[i], self.max_card_value))
            else:
                features.extend([0.0, 0.0, 0.0, 0.0])

        for i in range(6):
            if i < len(self.env.state.conveyor_belt):
                features.extend(_card_features(self.env.state.conveyor_belt[i], self.max_card_value))
            else:
                features.extend([0.0, 0.0, 0.0, 0.0])

        opp_hand = (
            self.env.state.players[opp_idx].hand
            if self.num_players > 1 and len(self.env.state.players) > opp_idx
            else []
        )
        hand_size_norm = len(player.hand) / 10.0
        deck_size_norm = len(self.env.state.deck) / 62.0
        opp_hand_size_norm = len(opp_hand) / 10.0
        matcha_norm = player.matcha_count / 2.0
        wasabi_norm = min(player.wasabi_skip_flag / 4.0, 1.0)
        check_protected = float(player.check_protected)
        phase_norm = self.env.state.phase / 5.0
        turn_norm = min(self.env.turn_count / 200.0, 1.0)
        features.extend([
            hand_size_norm, deck_size_norm, opp_hand_size_norm,
            matcha_norm, wasabi_norm, check_protected, phase_norm, turn_norm,
        ])

        hand_sushi_types = {c.sushi_card for c in player.hand if c.is_sushi}
        features.extend(_set_progress(hand_sushi_types))

        my_score = calculate_score(player.hand)
        opp_score = calculate_score(opp_hand) if opp_hand else 0
        total = my_score + opp_score + 1
        belt_sushi_values = [c.get_value() for c in self.env.state.conveyor_belt if c.is_sushi]
        belt_best_norm = max(belt_sushi_values) / self.max_card_value if belt_sushi_values else 0.0
        features.extend([
            min(my_score / _MAX_SCORE, 1.0),
            min(opp_score / _MAX_SCORE, 1.0),
            my_score / total,
            belt_best_norm,
        ])

        features.extend(_belt_score_deltas(player.hand, self.env.state.conveyor_belt, my_score))

        opp_sushi_types = {c.sushi_card for c in opp_hand if c.is_sushi}
        features.extend(_set_progress(opp_sushi_types))

        hand_action_types = {c.action_card for c in player.hand if not c.is_sushi}
        opp_best_sushi = max((c.get_value() for c in opp_hand if c.is_sushi), default=0) / 1500.0
        score_gap_norm = min(max((opp_score - my_score) / _MAX_SCORE, 0.0), 1.0)
        hand_fullness = len(player.hand) / player.max_hand_size
        features.extend([
            opp_best_sushi if ActionCard.FORK        in hand_action_types else 0.0,
            opp_best_sushi if ActionCard.CHOPSTICKS  in hand_action_types else 0.0,
            opp_best_sushi if ActionCard.SAKE        in hand_action_types else 0.0,
            score_gap_norm if ActionCard.UMESHU      in hand_action_types else 0.0,
            (1.0 - hand_fullness) if ActionCard.MATCHA in hand_action_types else 0.0,
        ])

        assert len(features) == OBS_SIZE, f"Expected {OBS_SIZE} features, got {len(features)}"
        return np.array(features, dtype=np.float32)

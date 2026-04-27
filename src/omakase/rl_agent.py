"""RL agent wrapper for inference."""

import numpy as np


class RLAgent:
    """Wrapper to use trained PPO model as an agent."""

    def __init__(self, model):
        self.model = model

    def choose_action(self, env, legal_actions):
        from omakase.training_env import SelfPlayEnv

        if isinstance(env, SelfPlayEnv):
            obs = env._encode_obs()
            action_mask = env.action_masks()
        else:
            obs = self._encode_obs_from_env(env)
            action_mask = np.zeros(64, dtype=bool)
            for action in legal_actions:
                if action < 64:
                    action_mask[action] = True

        action, _ = self.model.predict(obs, action_masks=action_mask)
        return int(action)

    def _encode_obs_from_env(self, env) -> np.ndarray:
        """Encode plain OmakaseEnv state to the same 95-feature vector as SelfPlayEnv."""
        from omakase.training_env import (
            _card_features, _set_progress, _belt_score_deltas, OBS_SIZE, _MAX_SCORE
        )
        from omakase.scoring import calculate_score
        from omakase.cards import ActionCard

        max_card_value = 1500.0
        player = env.state.get_active_player()
        features = []

        for i in range(10):
            if i < len(player.hand):
                features.extend(_card_features(player.hand[i], max_card_value))
            else:
                features.extend([0.0, 0.0, 0.0, 0.0])

        for i in range(6):
            if i < len(env.state.conveyor_belt):
                features.extend(_card_features(env.state.conveyor_belt[i], max_card_value))
            else:
                features.extend([0.0, 0.0, 0.0, 0.0])

        num_players = len(env.state.players)
        features.extend([
            len(player.hand) / 10.0,
            len(env.state.deck) / 62.0,
            len(env.state.players[1].hand) / 10.0 if num_players > 1 else 0.0,
            player.matcha_count / 2.0,
            min(player.wasabi_skip_flag / 4.0, 1.0),
            float(player.check_protected),
            env.state.phase / 5.0,
            min(env.turn_count / 200.0, 1.0),
        ])

        hand_sushi_types = {c.sushi_card for c in player.hand if c.is_sushi}
        features.extend(_set_progress(hand_sushi_types))

        my_score = calculate_score(player.hand)
        opp_hand = env.state.players[1].hand if num_players > 1 else []
        opp_score = calculate_score(opp_hand) if opp_hand else 0
        total = my_score + opp_score + 1
        belt_sushi_values = [c.get_value() for c in env.state.conveyor_belt if c.is_sushi]
        belt_best_norm = max(belt_sushi_values) / max_card_value if belt_sushi_values else 0.0
        features.extend([
            min(my_score / _MAX_SCORE, 1.0),
            min(opp_score / _MAX_SCORE, 1.0),
            my_score / total,
            belt_best_norm,
        ])

        features.extend(_belt_score_deltas(player.hand, env.state.conveyor_belt, my_score))

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

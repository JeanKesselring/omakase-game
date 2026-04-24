import random
from abc import ABC, abstractmethod
from typing import List, Optional

from .env import OmakaseEnv
from .game_state import Phase


class Agent(ABC):
    @abstractmethod
    def choose_action(self, env: OmakaseEnv, legal_actions: List[int]) -> int:
        pass


class RandomAgent(Agent):
    def choose_action(self, env: OmakaseEnv, legal_actions: List[int]) -> int:
        return random.choice(legal_actions)


class GreedyAgent(Agent):
    def choose_action(self, env: OmakaseEnv, legal_actions: List[int]) -> int:
        if env.state.phase == Phase.PHASE_1 or env.state.phase == Phase.PHASE_3:
            return self._choose_action_phase_1_3(env, legal_actions)
        elif env.state.phase == Phase.PHASE_2:
            return self._choose_action_phase_2(env, legal_actions)
        elif env.state.phase == Phase.PHASE_4:
            return self._choose_action_phase_4(env, legal_actions)
        return random.choice(legal_actions)

    def _choose_action_phase_1_3(
        self, env: OmakaseEnv, legal_actions: List[int]
    ) -> int:
        player = env.state.get_active_player()
        action_cards = [c for c in player.hand if not c.is_sushi]

        if not action_cards:
            return 0

        playable_action_idx = random.randint(0, len(action_cards) - 1)
        return playable_action_idx + 1 if (playable_action_idx + 1) in legal_actions else 0

    def _choose_action_phase_2(self, env: OmakaseEnv, legal_actions: List[int]) -> int:
        player = env.state.get_active_player()

        best_action = 0
        best_belt_value = -1

        for h_idx in range(len(player.hand)):
            for b_idx in range(len(env.state.conveyor_belt)):
                hand_card = player.hand[h_idx]
                belt_card = env.state.conveyor_belt[b_idx]

                if hand_card.card_id == belt_card.card_id:
                    continue

                if hand_card.is_sushi and belt_card.is_sushi:
                    if hand_card.sushi_card == belt_card.sushi_card:
                        continue

                action_idx = 1 + (h_idx * len(env.state.conveyor_belt) + b_idx)

                if action_idx in legal_actions:
                    belt_card_value = belt_card.get_value()
                    if belt_card_value > best_belt_value:
                        best_belt_value = belt_card_value
                        best_action = action_idx

        return best_action if best_action in legal_actions else random.choice(legal_actions)

    def _choose_action_phase_4(self, env: OmakaseEnv, legal_actions: List[int]) -> int:
        from .game_state import can_call_check

        if can_call_check(env.state, env.state.current_player) and 1 in legal_actions:
            hand_size = len(env.state.get_active_player().hand)
            if hand_size >= 6:
                return 1

        return 0


class GameSimulator:
    def __init__(self, num_players: int = 2):
        self.num_players = num_players

    def play_game(
        self,
        agents: List[Agent],
        seed: Optional[int] = None,
        verbose: bool = False,
    ) -> dict:
        if len(agents) != self.num_players:
            raise ValueError(f"Expected {self.num_players} agents, got {len(agents)}")

        env = OmakaseEnv(num_players=self.num_players, seed=seed, render_mode="human" if verbose else None)
        obs, _ = env.reset(seed=seed)

        step_count = 0
        max_steps = 10000

        while not env.state.game_over and step_count < max_steps:
            legal_actions = env.get_legal_actions()
            agent = agents[env.state.current_player]
            action = agent.choose_action(env, legal_actions)

            if action not in legal_actions:
                action = random.choice(legal_actions)

            obs, reward, terminated, truncated, info = env.step(action)

            if verbose:
                env.render()

            step_count += 1

        if verbose:
            print(f"\nGame ended after {step_count} steps")

        results = env.get_game_results()
        winner = max(range(self.num_players), key=lambda i: results[i])

        return {
            "winner": winner,
            "scores": results,
            "steps": step_count,
        }

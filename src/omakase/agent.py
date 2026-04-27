import random
from abc import ABC, abstractmethod
from typing import List, Optional, Tuple

from .env import OmakaseEnv, MAX_BELT_SIZE, PASSIVE_ACTION_CARDS
from .game_state import Phase, can_call_check
from .cards import ActionCard
from .scoring import calculate_score


class Agent(ABC):
    @abstractmethod
    def choose_action(self, env: OmakaseEnv, legal_actions: List[int]) -> int:
        pass


class RandomAgent(Agent):
    def choose_action(self, env: OmakaseEnv, legal_actions: List[int]) -> int:
        return random.choice(legal_actions)


# ---------------------------------------------------------------------------
# Shared heuristic helpers
# ---------------------------------------------------------------------------

def _best_swap(hand: list, belt: list, legal_actions: List[int]) -> Tuple[Optional[int], float]:
    """Return (best_action, best_delta) for Phase 2 using set-aware score delta."""
    current_score = calculate_score(hand)
    best_action = None
    best_delta = -float("inf")
    for action in legal_actions:
        h_idx = action // MAX_BELT_SIZE
        b_idx = action % MAX_BELT_SIZE
        if h_idx >= len(hand) or b_idx >= len(belt):
            continue
        new_hand = hand[:h_idx] + [belt[b_idx]] + hand[h_idx + 1:]
        delta = calculate_score(new_hand) - current_score
        if delta > best_delta:
            best_delta = delta
            best_action = action
    return best_action, best_delta


def _score_action_card(ac: ActionCard, player, opp_hands: list) -> float:
    """Heuristic value for actively playing action card of type ac."""
    opp_best_sushi = max(
        (c.get_value() for h in opp_hands for c in h if c.is_sushi), default=0
    )
    my_score = calculate_score(player.hand)
    max_opp_score = max((calculate_score(h) for h in opp_hands), default=0)
    hand_fullness = len(player.hand) / max(player.max_hand_size, 1)
    my_sushi = [c for c in player.hand if c.is_sushi]
    worst_sushi_val = min((c.get_value() for c in my_sushi), default=9999)

    if ac == ActionCard.CHOPSTICKS:
        return float(opp_best_sushi) if opp_best_sushi > 500 else 0.0
    if ac == ActionCard.FORK:
        return opp_best_sushi * 0.7 if opp_best_sushi > 500 else 0.0
    if ac == ActionCard.SAKE:
        return max(0.0, 400.0 - worst_sushi_val) if my_sushi and worst_sushi_val < 400 else 0.0
    if ac == ActionCard.UMESHU:
        return max(0.0, (max_opp_score - my_score) * 0.3) if max_opp_score > my_score + 800 else 0.0
    if ac == ActionCard.CHEFS_CHOICE:
        return 500.0 * (1.0 - hand_fullness) if hand_fullness < 0.75 else 0.0
    if ac == ActionCard.MATCHA:
        return 400.0 * (1.0 - hand_fullness) if hand_fullness < 0.75 else 0.0
    return 0.0


def _choose_action_card(env: OmakaseEnv, legal_actions: List[int]) -> int:
    """Return best action card action index for Phase 1/3, or 0 to pass."""
    state = env.state
    player = state.get_active_player()
    playable = [
        c for c in player.hand
        if not c.is_sushi and c.action_card not in PASSIVE_ACTION_CARDS
    ]
    if not playable:
        return 0
    opp_hands = [
        state.players[p].hand
        for p in range(state.num_players) if p != state.current_player
    ]
    best_idx = None
    best_val = 0.0
    for i, card in enumerate(playable):
        val = _score_action_card(card.action_card, player, opp_hands)
        candidate = i + 1
        if val > best_val and candidate in legal_actions:
            best_val = val
            best_idx = i
    return 0 if best_idx is None else best_idx + 1


# ---------------------------------------------------------------------------
# Agents
# ---------------------------------------------------------------------------

class GreedyAgent(Agent):
    """Set-aware greedy with strategic action card use."""

    def choose_action(self, env: OmakaseEnv, legal_actions: List[int]) -> int:
        phase = env.state.phase
        if phase in (Phase.PHASE_1, Phase.PHASE_3):
            return _choose_action_card(env, legal_actions)
        elif phase == Phase.PHASE_2:
            return self._phase2(env, legal_actions)
        elif phase == Phase.PHASE_4:
            return self._phase4(env, legal_actions)
        return random.choice(legal_actions)

    def _phase2(self, env: OmakaseEnv, legal_actions: List[int]) -> int:
        player = env.state.get_active_player()
        belt = env.state.conveyor_belt
        action, _ = _best_swap(player.hand, belt, legal_actions)
        return action if action is not None else random.choice(legal_actions)

    def _phase4(self, env: OmakaseEnv, legal_actions: List[int]) -> int:
        if can_call_check(env.state, env.state.current_player) and 1 in legal_actions:
            if len(env.state.get_active_player().hand) >= 6:
                return 1
        return 0


class SimpleGreedyAgent(Agent):
    """Set-aware greedy with strategic action card use and check calling."""

    def choose_action(self, env: OmakaseEnv, legal_actions: List[int]) -> int:
        phase = env.state.phase
        if phase == Phase.PHASE_2:
            return self._phase2(env, legal_actions)
        elif phase in (Phase.PHASE_1, Phase.PHASE_3):
            return _choose_action_card(env, legal_actions)
        elif phase == Phase.PHASE_4:
            return self._phase4(env, legal_actions)
        return 0

    def _phase2(self, env: OmakaseEnv, legal_actions: List[int]) -> int:
        player = env.state.get_active_player()
        belt = env.state.conveyor_belt
        if not player.hand or not belt:
            return random.choice(legal_actions)
        action, _ = _best_swap(player.hand, belt, legal_actions)
        return action if action is not None else random.choice(legal_actions)

    def _phase4(self, env: OmakaseEnv, legal_actions: List[int]) -> int:
        if 1 not in legal_actions or not can_call_check(env.state, env.state.current_player):
            return 0
        player = env.state.get_active_player()
        my_score = calculate_score(player.hand)
        opp_scores = [
            calculate_score(env.state.players[p].hand)
            for p in range(env.state.num_players) if p != env.state.current_player
        ]
        if opp_scores and my_score > max(opp_scores) + 300 and len(player.hand) >= 5:
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
        env.reset(seed=seed)

        step_count = 0
        max_steps = 10000

        while not env.state.game_over and step_count < max_steps:
            legal_actions = env.get_legal_actions()
            agent = agents[env.state.current_player]
            action = agent.choose_action(env, legal_actions)

            if action not in legal_actions:
                action = random.choice(legal_actions)

            env.step(action)

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

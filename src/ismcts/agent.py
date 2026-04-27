"""IS-MCTS (Information Set Monte Carlo Tree Search) agent for Omakase."""

import math
import random
from concurrent.futures import ProcessPoolExecutor
from typing import Dict, List, Optional, Tuple

from omakase.agent import Agent, GreedyAgent, _score_action_card
from omakase.cards import create_deck
from omakase.env import OmakaseEnv, MAX_BELT_SIZE, PASSIVE_ACTION_CARDS
from omakase.game_state import Phase
from omakase.scoring import (
    calculate_score,
    OMAKASE_SET, SAKURA_SET, UME_SET, KIDS_SET,
)

_SETS_WITH_VALUES = [
    (OMAKASE_SET, 6000),
    (SAKURA_SET, 4500),
    (UME_SET, 3500),
    (KIDS_SET, 2000),
]


class ISMCTSNode:
    """Tree node tracking visit statistics and PUCT prior across determinizations."""

    __slots__ = ["action", "parent", "children", "visits", "total_reward", "prior"]

    def __init__(self, action: Optional[int], parent: Optional["ISMCTSNode"], prior: float = 1.0):
        self.action = action
        self.parent = parent
        self.children: Dict[int, "ISMCTSNode"] = {}
        self.visits: int = 0
        self.total_reward: float = 0.0
        self.prior: float = prior

    def ucb(self, c: float) -> float:
        """PUCT formula: Q + C * P(a) * sqrt(N_parent) / (1 + n)"""
        if self.visits == 0:
            return math.inf
        return (
            self.total_reward / self.visits
            + c * self.prior * math.sqrt(self.parent.visits) / (1 + self.visits)
        )


class ISMCTSAgent(Agent):
    """
    IS-MCTS agent with PUCT selection, biased expansion, set-aware reward, and tree reuse.

    Each simulation samples a determinization, then runs UCT with domain
    priors guiding expansion and selection. Opponent turns are resolved by
    GreedyAgent rather than explored in the tree.

    The search tree is carried over between moves: after choosing action A,
    the subtree rooted at A becomes the warm-start root for the next call.
    """

    _ALL_CARDS = create_deck()

    def __init__(
        self,
        n_simulations: int = 100,
        c: float = 1.5,
        rollout_agent: Optional[Agent] = None,
        player_idx: int = 0,
        n_workers: int = 1,
        rollout_depth: int = 0,
    ):
        self.n_simulations = n_simulations
        self.c = c
        self.rollout_agent = rollout_agent or GreedyAgent()
        self.player_idx = player_idx
        self.n_workers = max(1, n_workers)
        self.rollout_depth = max(0, rollout_depth)  # 0 = full game
        self._executor = ProcessPoolExecutor(max_workers=self.n_workers) if self.n_workers > 1 else None
        self._root: Optional[ISMCTSNode] = None
        self._last_action: Optional[int] = None

    def __del__(self) -> None:
        if getattr(self, "_executor", None) is not None:
            self._executor.shutdown(wait=False)

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def choose_action(self, env: OmakaseEnv, legal_actions: List[int]) -> int:
        self.player_idx = env.state.current_player

        if len(legal_actions) == 1:
            action = legal_actions[0]
            self._advance_root(action)
            return action

        if self._executor is not None:
            return self._choose_action_parallel(env, legal_actions)

        # Sequential with tree reuse: carry the subtree from the previous move.
        root = self._get_warm_root()
        for _ in range(self.n_simulations):
            det_env = self._determinize(env)
            self._simulate(root, det_env)

        if not root.children:
            self._root = None
            self._last_action = None
            return random.choice(legal_actions)

        action = max(root.children, key=lambda a: root.children[a].visits)
        self._root = root
        self._last_action = action
        return action

    def _get_warm_root(self) -> ISMCTSNode:
        """Return the subtree from the last chosen action, or a fresh root."""
        if (
            self._root is not None
            and self._last_action is not None
            and self._last_action in self._root.children
        ):
            child = self._root.children[self._last_action]
            child.parent = None  # detach so backprop stops here
            return child
        root = ISMCTSNode(action=None, parent=None)
        root.visits = 1
        return root

    def _advance_root(self, action: int) -> None:
        """Slide the tree root forward when a move is forced (one legal action)."""
        if self._root is not None and action in self._root.children:
            child = self._root.children[action]
            child.parent = None
            self._root = child
        else:
            self._root = None
        self._last_action = None

    def _choose_action_parallel(self, env: OmakaseEnv, legal_actions: List[int]) -> int:
        seeds = [random.randint(0, 2**31) for _ in range(self.n_workers)]

        # Build a renderer-free env that is safe to pickle across processes.
        clean_env = OmakaseEnv(num_players=env.num_players)
        clean_env.state = env.state.copy()
        clean_env.turn_count = env.turn_count

        # Each worker runs the full n_simulations independently; aggregating
        # visit counts gives n_workers × n_simulations effective quality at
        # roughly 1× wall-clock time.
        args = [
            (clean_env, self.n_simulations, self.c, self.player_idx, self.rollout_depth, s)
            for s in seeds
        ]
        results = list(self._executor.map(_simulate_batch, args))

        # Aggregate visits, rewards, and priors across workers.
        # Each worker returns {action: (visits, total_reward, prior)}.
        agg: Dict[int, List] = {}
        for r in results:
            for action, (visits, total_reward, prior) in r.items():
                if action not in agg:
                    agg[action] = [0, 0.0, prior]
                agg[action][0] += visits
                agg[action][1] += total_reward

        if not agg:
            self._root = None
            self._last_action = None
            return random.choice(legal_actions)

        # Rebuild root node from aggregated statistics for next-round tree reuse.
        new_root = ISMCTSNode(action=None, parent=None)
        new_root.visits = sum(v for v, _, _ in agg.values()) + 1
        for action, (visits, total_reward, prior) in agg.items():
            child = ISMCTSNode(action=action, parent=new_root, prior=prior)
            child.visits = visits
            child.total_reward = total_reward
            new_root.children[action] = child

        best_action = max(agg, key=lambda a: agg[a][0])
        self._root = new_root
        self._last_action = best_action
        return best_action

    # ------------------------------------------------------------------
    # Determinization
    # ------------------------------------------------------------------

    def _determinize(self, env: OmakaseEnv) -> OmakaseEnv:
        """Return a new OmakaseEnv whose hidden cards are randomly sampled."""
        state = env.state
        known = (
            {c.card_id for c in state.players[self.player_idx].hand}
            | {c.card_id for c in state.conveyor_belt}
            | {c.card_id for c in state.trash}
            | {c.card_id for c in state.chefs_choice_drawn_cards}
        )
        pool = [c for c in self._ALL_CARDS if c.card_id not in known]
        random.shuffle(pool)

        det = state.copy()
        idx = 0
        for p in range(state.num_players):
            if p == self.player_idx:
                continue
            size = len(state.players[p].hand)
            det.players[p].hand = list(pool[idx: idx + size])
            idx += size
        det.deck = list(pool[idx:])

        new_env = OmakaseEnv(num_players=env.num_players)
        new_env.state = det
        new_env.turn_count = env.turn_count
        return new_env

    # ------------------------------------------------------------------
    # MCTS simulation
    # ------------------------------------------------------------------

    def _simulate(self, root: ISMCTSNode, env: OmakaseEnv) -> None:
        node = root

        # ---- SELECTION + EXPANSION ----
        while not env.state.game_over:
            # Advance opponent turns without adding tree nodes.
            while (
                not env.state.game_over
                and env.state.current_player != self.player_idx
            ):
                legal = env.get_legal_actions()
                env.step(self.rollout_agent.choose_action(env, legal))

            if env.state.game_over:
                break

            legal = env.get_legal_actions()
            untried = [a for a in legal if a not in node.children]

            if untried:
                # EXPANSION: biased — pick the highest-prior untried action.
                priors = self._compute_action_priors(env, legal)
                action = max(untried, key=lambda a: priors.get(a, 0.0))
                child = ISMCTSNode(
                    action=action,
                    parent=node,
                    prior=priors.get(action, 1.0 / len(legal)),
                )
                node.children[action] = child
                node = child
                env.step(action)
                break
            # SELECTION: PUCT over children that are legal in this determinization.
            valid = {a: node.children[a] for a in legal if a in node.children}
            if not valid:
                break
            action = max(valid, key=lambda a: valid[a].ucb(self.c))
            node = node.children[action]
            env.step(action)

        # ---- ROLLOUT ----
        reward = self._rollout(env)

        # ---- BACKPROPAGATION ----
        while node is not None:
            node.visits += 1
            node.total_reward += reward
            node = node.parent

    # ------------------------------------------------------------------
    # Action priors
    # ------------------------------------------------------------------

    def _compute_action_priors(
        self, env: OmakaseEnv, legal_actions: List[int]
    ) -> Dict[int, float]:
        """Normalized prior probability for each legal action."""
        state = env.state
        player = state.get_active_player()
        phase = state.phase
        raw: Dict[int, float] = {}

        if phase == Phase.PHASE_2:
            belt = state.conveyor_belt
            current_score = calculate_score(player.hand)
            for action in legal_actions:
                h_idx = action // MAX_BELT_SIZE
                b_idx = action % MAX_BELT_SIZE
                if h_idx >= len(player.hand) or b_idx >= len(belt):
                    raw[action] = 50.0
                    continue
                new_hand = player.hand[:h_idx] + [belt[b_idx]] + player.hand[h_idx + 1:]
                delta = calculate_score(new_hand) - current_score
                raw[action] = max(0.0, float(delta)) + 50.0

        elif phase in (Phase.PHASE_1, Phase.PHASE_3):
            for action in legal_actions:
                raw[action] = self._action_card_prior(env, action)
        else:
            for action in legal_actions:
                raw[action] = 1.0

        total = sum(raw.values()) or 1.0
        return {a: v / total for a, v in raw.items()}

    def _action_card_prior(self, env: OmakaseEnv, action: int) -> float:
        if action == 0:
            return 100.0  # pass always has baseline mass
        state = env.state
        player = state.get_active_player()
        playable = [
            c for c in player.hand
            if not c.is_sushi and c.action_card not in PASSIVE_ACTION_CARDS
        ]
        idx = action - 1
        if idx >= len(playable):
            return 0.0
        opp_hands = [
            state.players[p].hand
            for p in range(state.num_players) if p != state.current_player
        ]
        val = _score_action_card(playable[idx].action_card, player, opp_hands)
        return max(50.0, val)

    # ------------------------------------------------------------------
    # Rollout
    # ------------------------------------------------------------------

    def _rollout(self, env: OmakaseEnv) -> float:
        """Greedy playout; truncates after rollout_depth turns (0 = full game)."""
        start_turn = env.turn_count
        steps = 0
        while not env.state.game_over and steps < 500:
            if self.rollout_depth > 0 and env.turn_count - start_turn >= self.rollout_depth:
                return self._value_estimate(env)
            legal = env.get_legal_actions()
            action = self.rollout_agent.choose_action(env, legal)
            if action not in legal:
                action = random.choice(legal)
            env.step(action)
            steps += 1

        # Terminal path: use exact final scores (which already include all set bonuses).
        results = env.get_game_results()
        total_score = sum(results.values()) or 1
        return results.get(self.player_idx, 0) / total_score

    def _value_estimate(self, env: OmakaseEnv) -> float:
        """Value function for rollout truncation (used only when rollout_depth > 0).

        calculate_score gives zero partial credit for incomplete sets, so mid-game
        score_ratio alone misses hands that are one card away from a 6000-pt bonus.
        We add a net set-advantage term (our value-weighted set progress minus the
        best opponent's), which is blind to that structural gap.
        """
        our_score = calculate_score(env.state.players[self.player_idx].hand)
        total_score = sum(calculate_score(p.hand) for p in env.state.players) or 1
        score_ratio = our_score / total_score

        total_set_value = sum(v for _, v in _SETS_WITH_VALUES)
        sushi_types = {c.sushi_card for c in env.state.players[self.player_idx].hand if c.is_sushi}
        my_set_progress = sum(
            (len(s & sushi_types) / len(s)) * v for s, v in _SETS_WITH_VALUES
        ) / total_set_value

        # Worst-case opponent threat: best set progress among all opponents.
        opp_set_progress = 0.0
        for p in range(env.state.num_players):
            if p == self.player_idx:
                continue
            opp_sushi = {c.sushi_card for c in env.state.players[p].hand if c.is_sushi}
            opp_set_progress = max(
                opp_set_progress,
                sum((len(s & opp_sushi) / len(s)) * v for s, v in _SETS_WITH_VALUES) / total_set_value,
            )

        # Net set advantage normalized to [0, 1] (0.5 = parity).
        net_set = (my_set_progress - opp_set_progress + 1.0) / 2.0
        return 0.6 * score_ratio + 0.4 * net_set


# ---------------------------------------------------------------------------
# Parallel worker (module-level so multiprocessing can pickle it)
# ---------------------------------------------------------------------------

def _simulate_batch(args) -> Dict[int, Tuple[int, float, float]]:
    """Run n_sims MCTS simulations and return {action: (visits, total_reward, prior)}."""
    env, n_sims, c, player_idx, rollout_depth, seed = args
    random.seed(seed)
    agent = ISMCTSAgent(
        n_simulations=n_sims, c=c, player_idx=player_idx,
        n_workers=1, rollout_depth=rollout_depth,
    )
    root = ISMCTSNode(action=None, parent=None)
    root.visits = 1
    for _ in range(n_sims):
        det_env = agent._determinize(env)
        agent._simulate(root, det_env)
    return {a: (child.visits, child.total_reward, child.prior) for a, child in root.children.items()}

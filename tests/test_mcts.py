"""Tests for IS-MCTS agent."""

import random

import pytest

from ismcts import ISMCTSAgent, ISMCTSNode
from omakase.agent import RandomAgent
from omakase.cards import create_deck
from omakase.env import OmakaseEnv


# ---------------------------------------------------------------------------
# ISMCTSNode
# ---------------------------------------------------------------------------

def test_node_ucb_unvisited_is_inf():
    parent = ISMCTSNode(action=None, parent=None)
    parent.visits = 1
    child = ISMCTSNode(action=0, parent=parent)
    assert child.ucb(1.41) == float("inf")


def test_node_ucb_visited():
    parent = ISMCTSNode(action=None, parent=None)
    parent.visits = 10
    child = ISMCTSNode(action=0, parent=parent)
    child.visits = 5
    child.total_reward = 3.0
    val = child.ucb(1.41)
    assert 0.0 < val < 5.0  # sanity bounds


# ---------------------------------------------------------------------------
# Determinization
# ---------------------------------------------------------------------------

def _fresh_env():
    env = OmakaseEnv(num_players=2, seed=42)
    env.reset(seed=42)
    return env


def test_determinization_card_count():
    """All 62 cards must appear exactly once across known + det pools."""
    agent = ISMCTSAgent(n_simulations=1)
    env = _fresh_env()
    det_env = agent._determinize(env)

    all_ids = {c.card_id for c in create_deck()}
    state = det_env.state

    seen = set()
    for c in state.players[0].hand:
        seen.add(c.card_id)
    for c in state.conveyor_belt:
        seen.add(c.card_id)
    for c in state.trash:
        seen.add(c.card_id)
    for p in range(1, state.num_players):
        for c in state.players[p].hand:
            seen.add(c.card_id)
    for c in state.deck:
        seen.add(c.card_id)

    assert seen == all_ids, f"Card mismatch: {all_ids - seen} missing, {seen - all_ids} extra"


def test_determinization_hand_sizes_preserved():
    """Opponent hand size must not change after determinization."""
    agent = ISMCTSAgent(n_simulations=1)
    env = _fresh_env()
    orig_opp_size = len(env.state.players[1].hand)
    det_env = agent._determinize(env)
    assert len(det_env.state.players[1].hand) == orig_opp_size


def test_determinization_player0_hand_unchanged():
    """Player 0's hand must be exactly the same cards."""
    agent = ISMCTSAgent(n_simulations=1)
    env = _fresh_env()
    orig_ids = {c.card_id for c in env.state.players[0].hand}
    det_env = agent._determinize(env)
    det_ids = {c.card_id for c in det_env.state.players[0].hand}
    assert orig_ids == det_ids


def test_determinization_no_duplicates():
    """No card_id should appear twice in the determinized state."""
    agent = ISMCTSAgent(n_simulations=1)
    env = _fresh_env()
    det_env = agent._determinize(env)
    state = det_env.state

    all_seen = []
    all_seen.extend(c.card_id for c in state.players[0].hand)
    all_seen.extend(c.card_id for c in state.players[1].hand)
    all_seen.extend(c.card_id for c in state.conveyor_belt)
    all_seen.extend(c.card_id for c in state.trash)
    all_seen.extend(c.card_id for c in state.deck)

    assert len(all_seen) == len(set(all_seen)), "Duplicate card_ids in determinized state"


# ---------------------------------------------------------------------------
# ISMCTSAgent.choose_action
# ---------------------------------------------------------------------------

def test_ismcts_returns_legal_action():
    """choose_action must return a legal action."""
    agent = ISMCTSAgent(n_simulations=5)
    env = _fresh_env()
    legal = env.get_legal_actions()
    action = agent.choose_action(env, legal)
    assert action in legal


def test_ismcts_single_legal_action():
    """With only one legal action, it must be returned immediately."""
    agent = ISMCTSAgent(n_simulations=10)
    env = _fresh_env()
    action = agent.choose_action(env, [3])
    assert action == 3


def test_ismcts_runs_full_game():
    """ISMCTSAgent vs RandomAgent should complete without error."""
    random.seed(0)
    agent = ISMCTSAgent(n_simulations=5)
    opponent = RandomAgent()
    agents = [agent, opponent]

    env = OmakaseEnv(num_players=2, seed=0)
    env.reset(seed=0)

    steps = 0
    while not env.state.game_over and steps < 2000:
        legal = env.get_legal_actions()
        action = agents[env.state.current_player].choose_action(env, legal)
        if action not in legal:
            action = random.choice(legal)
        env.step(action)
        steps += 1

    assert env.state.game_over, "Game did not terminate"


# ---------------------------------------------------------------------------
# Win-rate sanity check (fast: 10 games, n_simulations=20)
# ---------------------------------------------------------------------------

def test_ismcts_beats_random():
    """ISMCTSAgent(20 sims) should win >50% against pure random over 10 games."""
    agent = ISMCTSAgent(n_simulations=20)
    opponent = RandomAgent()
    wins = 0
    n = 10

    for seed in range(n):
        env = OmakaseEnv(num_players=2, seed=seed)
        env.reset(seed=seed)
        agents = [agent, opponent]
        steps = 0
        while not env.state.game_over and steps < 2000:
            legal = env.get_legal_actions()
            action = agents[env.state.current_player].choose_action(env, legal)
            if action not in legal:
                action = random.choice(legal)
            env.step(action)
            steps += 1
        results = env.get_game_results()
        if results.get(0, 0) == max(results.values()):
            wins += 1

    assert wins >= 5, f"ISMCTSAgent won only {wins}/10 games vs RandomAgent"


# ---------------------------------------------------------------------------
# Truncated rollout / value function
# ---------------------------------------------------------------------------

def test_value_estimate_in_range():
    """_value_estimate must return a value in [0, 1]."""
    agent = ISMCTSAgent(n_simulations=1, rollout_depth=5)
    env = _fresh_env()
    v = agent._value_estimate(env)
    assert 0.0 <= v <= 1.0, f"_value_estimate returned {v} outside [0, 1]"


def test_truncated_rollout_faster():
    """Truncated rollout (depth=5) should take less time than full rollout (depth=0)."""
    import time

    random.seed(7)
    env_full = _fresh_env()
    env_trunc = _fresh_env()

    agent_full = ISMCTSAgent(n_simulations=10, rollout_depth=0)
    agent_trunc = ISMCTSAgent(n_simulations=10, rollout_depth=5)

    t0 = time.perf_counter()
    legal = env_full.get_legal_actions()
    agent_full.choose_action(env_full, legal)
    t_full = time.perf_counter() - t0

    t0 = time.perf_counter()
    legal = env_trunc.get_legal_actions()
    agent_trunc.choose_action(env_trunc, legal)
    t_trunc = time.perf_counter() - t0

    assert t_trunc < t_full, (
        f"Truncated rollout ({t_trunc:.3f}s) was not faster than full ({t_full:.3f}s)"
    )

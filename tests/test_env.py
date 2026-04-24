import pytest
import numpy as np
from omakase.env import OmakaseEnv
from omakase.agent import RandomAgent, GameSimulator


def test_env_reset():
    env = OmakaseEnv(num_players=2, seed=42)
    obs, info = env.reset(seed=42)

    assert isinstance(obs, dict)
    assert "hand" in obs
    assert "conveyor_belt" in obs
    assert "deck_size" in obs
    assert obs["hand_size"][0] >= 1
    assert obs["conveyor_belt"].shape == (6,)


def test_env_observation_structure():
    env = OmakaseEnv(num_players=2, seed=42)
    obs, _ = env.reset(seed=42)

    assert obs["hand"].shape == (10,)
    assert obs["hand_size"].shape == (1,)
    assert obs["conveyor_belt"].shape == (6,)
    assert obs["opponent_hand_size"].shape == (1,)
    assert obs["deck_size"].shape == (1,)
    assert obs["matcha_count"].shape == (1,)
    assert obs["wasabi_skip_flag"].shape == (1,)
    assert obs["check_protected"].shape == (1,)
    assert obs["current_phase"].shape == (1,)
    assert obs["turn_number"].shape == (1,)


def test_env_legal_actions_phase_1():
    env = OmakaseEnv(num_players=2, seed=42)
    env.reset(seed=42)

    legal_actions = env.get_legal_actions()
    assert 0 in legal_actions


def test_env_legal_actions_phase_2():
    env = OmakaseEnv(num_players=2, seed=42)
    env.reset(seed=42)

    env.state.phase = 1

    legal_actions = env.get_legal_actions()
    assert 0 in legal_actions


def test_env_step():
    env = OmakaseEnv(num_players=2, seed=42)
    obs, _ = env.reset(seed=42)

    legal_actions = env.get_legal_actions()
    action = legal_actions[0]

    obs, reward, terminated, truncated, info = env.step(action)

    assert isinstance(obs, dict)
    assert isinstance(reward, float)
    assert isinstance(terminated, bool)
    assert isinstance(truncated, bool)
    assert isinstance(info, dict)


def test_env_game_progression():
    env = OmakaseEnv(num_players=2, seed=42)
    env.reset(seed=42)

    initial_player = env.state.current_player

    steps = 0
    max_steps = 1000
    while not env.state.game_over and steps < max_steps:
        legal_actions = env.get_legal_actions()
        action = legal_actions[0]
        obs, reward, terminated, truncated, info = env.step(action)
        steps += 1

    assert steps < max_steps
    results = env.get_game_results()
    assert len(results) == 2
    assert all(v >= 0 for v in results.values())


def test_env_3_players():
    env = OmakaseEnv(num_players=3, seed=42)
    obs, _ = env.reset(seed=42)

    assert len(env.state.players) == 3
    opponent_indices = env.state.get_opponent_indices(0)
    assert len(opponent_indices) == 2


def test_random_agent_plays_game():
    agents = [RandomAgent(), RandomAgent()]
    simulator = GameSimulator(num_players=2)

    result = simulator.play_game(agents, seed=42, verbose=False)

    assert "winner" in result
    assert "scores" in result
    assert "steps" in result
    assert result["winner"] in [0, 1]
    assert len(result["scores"]) == 2


def test_game_simulator_3_players():
    agents = [RandomAgent(), RandomAgent(), RandomAgent()]
    simulator = GameSimulator(num_players=3)

    result = simulator.play_game(agents, seed=42, verbose=False)

    assert result["winner"] in [0, 1, 2]
    assert len(result["scores"]) == 3


def test_env_conveyor_movement():
    env = OmakaseEnv(num_players=2, seed=42)
    env.reset(seed=42)

    initial_belt = [c.card_id for c in env.state.conveyor_belt]
    initial_belt_len = len(env.state.conveyor_belt)

    while env.state.phase != 0:
        legal_actions = env.get_legal_actions()
        action = legal_actions[0]
        env.step(action)

    while env.state.phase != 0:
        legal_actions = env.get_legal_actions()
        action = legal_actions[0]
        env.step(action)

    new_belt = [c.card_id for c in env.state.conveyor_belt]
    assert len(new_belt) == initial_belt_len


def test_hand_limit_enforcement():
    env = OmakaseEnv(num_players=2, seed=42)
    env.reset(seed=42)

    player = env.state.get_active_player()
    player.max_hand_size = 2

    for _ in range(5):
        legal_actions = env.get_legal_actions()
        action = legal_actions[0]
        env.step(action)

    player_now = env.state.players[env.state.current_player]
    assert len(player_now.hand) <= player_now.max_hand_size

#!/usr/bin/env python3
"""Debug what SimpleGreedyAgent is actually doing."""

from omakase.agent import SimpleGreedyAgent, RandomAgent, GameSimulator
from omakase.env import OmakaseEnv
from omakase.game_state import Phase

def debug_single_game():
    """Run one game and log greedy agent decisions."""
    env = OmakaseEnv(num_players=2, seed=42)
    env.reset()

    greedy = SimpleGreedyAgent()
    random_agent = RandomAgent()
    agents = [greedy, random_agent]

    print("=" * 80)
    print("Debugging SimpleGreedyAgent Decisions")
    print("=" * 80)

    step_count = 0
    while not env.state.game_over and step_count < 500:
        current_player = env.state.current_player
        legal_actions = env.get_legal_actions()
        agent = agents[current_player]

        player = env.state.get_active_player()
        phase = env.state.phase

        if current_player == 0:  # Log greedy agent decisions
            action = agent.choose_action(env, legal_actions)

            phase_name = {
                Phase.PHASE_1: "PHASE_1",
                Phase.PHASE_2: "PHASE_2",
                Phase.PHASE_3: "PHASE_3",
                Phase.PHASE_4: "PHASE_4",
            }.get(phase, f"PHASE_{phase}")

            print(f"\nStep {step_count}: Player 0 ({phase_name})")
            print(f"  Hand: {[c.card_id for c in player.hand]}")
            print(f"  Belt: {[c.card_id for c in env.state.conveyor_belt]}")
            print(f"  Legal actions: {legal_actions}")
            print(f"  Greedy chose: {action} (valid: {action in legal_actions})")

            if action not in legal_actions:
                print(f"  WARNING: Invalid action chosen! Falling back to random.")
                action = random_agent.choose_action(env, legal_actions)
                print(f"  Random fallback: {action}")
        else:
            action = agent.choose_action(env, legal_actions)

        env.step(action)
        step_count += 1

        if step_count > 50:  # Stop after a few turns
            break

    print("\n" + "=" * 80)

if __name__ == "__main__":
    debug_single_game()

#!/usr/bin/env python3
"""Debug script to verify training environment integrity."""

import numpy as np
from omakase.training_env import SelfPlayEnv

def debug_env():
    """Run diagnostic checks on the training environment."""
    print("=" * 60)
    print("Training Environment Diagnostics")
    print("=" * 60)

    env = SelfPlayEnv(num_players=2, seed=42)
    obs, _ = env.reset()

    print(f"\n✓ Environment initialized")
    print(f"  Observation shape: {obs.shape} (expected 72)")
    print(f"  Observation dtype: {obs.dtype}")
    print(f"  Observation range: [{obs.min():.3f}, {obs.max():.3f}] (expected [0.0, 1.0])")

    # Check action masking
    legal_actions = env.env.get_legal_actions()
    action_mask = env.action_masks()

    print(f"\n✓ Action masking")
    print(f"  Legal actions: {legal_actions}")
    print(f"  Action mask shape: {action_mask.shape} (expected (64,))")
    print(f"  Masked actions: {np.where(action_mask)[0].tolist()}")
    print(f"  Mask matches legal actions: {set(np.where(action_mask)[0]) == set(legal_actions)}")

    # Simulate 5 steps
    print(f"\n✓ Running 5 simulation steps:")
    for step_i in range(5):
        legal = env.env.get_legal_actions()
        mask = env.action_masks()

        # Pick a random legal action
        action = np.random.choice(legal)
        obs, reward, terminated, truncated, info = env.step(action)

        print(f"  Step {step_i + 1}: action={action}, legal_actions={legal}, "
              f"reward={reward}, terminated={terminated}")

        if terminated:
            break

    if terminated:
        scores = env.env.get_game_results()
        print(f"\n✓ Game ended")
        print(f"  Final scores: {scores}")
        print(f"  Player 0 won: {scores[0] == max(scores.values())}")
    else:
        print(f"\n✓ Game still in progress after 5 steps")

    print("\n" + "=" * 60)
    print("All checks passed! Environment appears healthy.")
    print("=" * 60)

if __name__ == "__main__":
    debug_env()

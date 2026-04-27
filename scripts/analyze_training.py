#!/usr/bin/env python3
"""Analyze training progress by evaluating checkpoints over time."""

import argparse
from pathlib import Path
from collections import defaultdict
import numpy as np

from sb3_contrib import MaskablePPO
from omakase.agent import GameSimulator, RandomAgent
from omakase.rl_agent import RLAgent


def evaluate_checkpoint(model_path: Path, num_games: int = 10) -> dict:
    """Evaluate a single checkpoint against random."""
    if not model_path.exists():
        return None

    try:
        model = MaskablePPO.load(str(model_path))
    except Exception as e:
        print(f"  Failed to load {model_path.name}: {e}")
        return None

    agents = [RLAgent(model), RandomAgent()]
    simulator = GameSimulator(num_players=2)

    wins = 0
    scores_rl = []
    scores_random = []

    for _ in range(num_games):
        result = simulator.play_game(agents, seed=None)
        if result["winner"] == 0:
            wins += 1
        scores_rl.append(result["scores"][0])
        scores_random.append(result["scores"][1])

    return {
        "win_rate": 100.0 * wins / num_games,
        "avg_score_rl": np.mean(scores_rl),
        "avg_score_random": np.mean(scores_random),
        "score_diff": np.mean(scores_rl) - np.mean(scores_random),
    }


def main():
    parser = argparse.ArgumentParser(
        description="Analyze training progress across checkpoints"
    )
    parser.add_argument(
        "--run-dir",
        type=str,
        required=True,
        help="Training run directory (e.g., ./training_runs/v3_fixed)",
    )
    parser.add_argument(
        "--games-per-checkpoint",
        type=int,
        default=10,
        help="Games to play against each checkpoint",
    )

    args = parser.parse_args()
    run_dir = Path(args.run_dir)
    models_dir = run_dir / "models"

    if not models_dir.exists():
        print(f"Error: Models directory not found: {models_dir}")
        return

    # Find all checkpoint files
    checkpoints = sorted(models_dir.glob("ppo_*_steps.zip"))
    checkpoints.append(models_dir / "ppo_2p_final.zip")

    if not checkpoints:
        print(f"No checkpoints found in {models_dir}")
        return

    print("=" * 80)
    print("Training Progress Analysis")
    print("=" * 80)
    print(f"Evaluating {len(checkpoints)} checkpoints ({args.games_per_checkpoint} games each)\n")

    results = []

    for checkpoint in checkpoints:
        # Extract step count from filename
        if "final" in checkpoint.name:
            step_str = "FINAL"
        else:
            parts = checkpoint.name.split("_")
            step_str = parts[-2] + " steps"

        print(f"Evaluating {checkpoint.name:40} ({step_str:15})...", end=" ", flush=True)

        eval_result = evaluate_checkpoint(checkpoint, args.games_per_checkpoint)

        if eval_result is None:
            print("FAILED")
            continue

        results.append(
            {
                "checkpoint": checkpoint.name,
                "steps": step_str,
                **eval_result,
            }
        )

        print(
            f"Win Rate: {eval_result['win_rate']:5.1f}% | "
            f"Avg Score: {eval_result['avg_score_rl']:7.1f} vs {eval_result['avg_score_random']:7.1f} | "
            f"Diff: {eval_result['score_diff']:+7.1f}"
        )

    if not results:
        print("No results to display.")
        return

    print("\n" + "=" * 80)
    print("Summary Table")
    print("=" * 80)
    print(f"{'Steps':<15} {'Win Rate':<12} {'RL Avg':<12} {'Random Avg':<12} {'Score Diff':<12}")
    print("-" * 80)

    for r in results:
        print(
            f"{r['steps']:<15} {r['win_rate']:>6.1f}%      "
            f"{r['avg_score_rl']:>10.1f}  {r['avg_score_random']:>10.1f}  "
            f"{r['score_diff']:>+10.1f}"
        )

    print("\n" + "=" * 80)

    # Calculate improvement
    if len(results) > 1:
        first_wr = results[0]["win_rate"]
        last_wr = results[-1]["win_rate"]
        improvement = last_wr - first_wr
        print(f"Improvement: {improvement:+.1f}% (from {first_wr:.1f}% to {last_wr:.1f}%)")
    print("=" * 80)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Evaluation script for trained RL agent."""

import argparse
from collections import defaultdict
from pathlib import Path
from typing import Dict, List

from sb3_contrib import MaskablePPO

from omakase.agent import GameSimulator, GreedyAgent, RandomAgent
from omakase.rl_agent import RLAgent


def mask_fn(env):
    return env.action_masks()


def run_games(agents: List, num_players: int, num_games: int) -> Dict:
    """Run games and collect statistics."""
    results = {
        "win_counts": defaultdict(int),
        "total_games": num_games,
        "player_count": num_players,
        "scores": defaultdict(list),
        "winners": [],
    }

    for game_num in range(num_games):
        game_agents = agents[:num_players]
        simulator = GameSimulator(num_players=num_players)

        game_result = simulator.play_game(game_agents)
        winner_idx = max(
            range(num_players), key=lambda i: game_result["scores"][i]
        )
        results["winners"].append(winner_idx)
        results["win_counts"][winner_idx] += 1

        for i in range(num_players):
            results["scores"][i].append(game_result["scores"][i])

    return results


def print_results(results: Dict, agent_names: List[str]):
    """Print tournament results."""
    num_players = results["player_count"]
    print(f"\n{'='*60}")
    print(f"{num_players}-Player Tournament Results")
    print(f"{'='*60}")
    print(f"Total games: {results['total_games']}")

    for i in range(num_players):
        win_rate = (
            100.0 * results["win_counts"][i] / results["total_games"]
        )
        avg_score = (
            sum(results["scores"][i]) / len(results["scores"][i])
            if results["scores"][i]
            else 0
        )
        print(
            f"Agent {i} ({agent_names[i]:15}): {win_rate:5.1f}% wins, "
            f"avg score: {avg_score:7.1f}"
        )

    print()


def main():
    parser = argparse.ArgumentParser(description="Evaluate trained PPO agent")
    parser.add_argument(
        "--model", type=str, required=True, help="Path to trained model"
    )
    parser.add_argument(
        "--num-players",
        type=int,
        default=2,
        choices=[2, 3, 4],
        help="Number of players for evaluation",
    )
    parser.add_argument(
        "--games", type=int, default=200, help="Number of games to play"
    )
    parser.add_argument(
        "--compare",
        action="store_true",
        help="Compare across 2, 3, 4 player scenarios",
    )

    args = parser.parse_args()

    model_path = Path(args.model)
    if not model_path.exists():
        print(f"Error: Model file not found: {model_path}")
        return

    print(f"Loading model from {model_path}...")
    model = MaskablePPO.load(str(model_path))

    if args.compare:
        for num_players in [2, 3, 4]:
            print(f"\n{'#'*60}")
            print(f"Evaluating {num_players}-player configuration")
            print(f"{'#'*60}")

            agents = [
                RLAgent(model),
                RandomAgent(),
            ]
            if num_players >= 3:
                agents.append(GreedyAgent())
            if num_players >= 4:
                agents.append(RandomAgent())

            results = run_games(agents, num_players, args.games // (5 - num_players))
            agent_names = [
                "RL Agent",
                "Random",
                "Greedy" if num_players >= 3 else "",
                "Random" if num_players >= 4 else "",
            ]
            print_results(results, agent_names)
    else:
        agents = [
            RLAgent(model),
            RandomAgent(),
        ]
        if args.num_players >= 3:
            agents.append(GreedyAgent())
        if args.num_players >= 4:
            agents.append(RandomAgent())

        print(f"\nRunning {args.games} games with {args.num_players} players...")
        results = run_games(agents, args.num_players, args.games)

        agent_names = [
            "RL Agent",
            "Random",
            "Greedy" if args.num_players >= 3 else "",
            "Random" if args.num_players >= 4 else "",
        ]
        print_results(results, agent_names)

        # Print score distributions
        print(f"{'='*60}")
        print("Score Distributions")
        print(f"{'='*60}")
        for i, name in enumerate(agent_names[:args.num_players]):
            if name:
                scores = results["scores"][i]
                min_score = min(scores) if scores else 0
                max_score = max(scores) if scores else 0
                avg_score = sum(scores) / len(scores) if scores else 0
                print(
                    f"{name:15}: min={min_score:6.0f}, "
                    f"max={max_score:6.0f}, avg={avg_score:6.1f}"
                )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Compute mean calculate_score per player per turn across N self-play games.

Run once, paste the printed _BASELINE_SCORES dict into src/ismcts/agent.py.

Usage:
    python scripts/compute_baseline.py [--games N]
"""
import argparse
import random
import sys
from collections import defaultdict

sys.path.insert(0, "src")

from omakase.agent import GreedyAgent
from omakase.env import OmakaseEnv
from omakase.scoring import calculate_score


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--games", type=int, default=1000)
    args = parser.parse_args()

    score_sums: dict[int, float] = defaultdict(float)
    score_counts: dict[int, int] = defaultdict(int)

    agents = [GreedyAgent(), GreedyAgent()]

    for seed in range(args.games):
        env = OmakaseEnv(num_players=2)
        env.reset(seed=seed)

        while not env.state.game_over:
            turn = env.turn_count
            for p in range(env.state.num_players):
                s = calculate_score(env.state.players[p].hand)
                score_sums[turn] += s
                score_counts[turn] += 1

            legal = env.get_legal_actions()
            action = agents[env.state.current_player].choose_action(env, legal)
            if action not in legal:
                action = random.choice(legal)
            env.step(action)

        # Record terminal state too
        turn = env.turn_count
        for p in range(env.state.num_players):
            s = calculate_score(env.state.players[p].hand)
            score_sums[turn] += s
            score_counts[turn] += 1

    means = {t: round(score_sums[t] / score_counts[t]) for t in sorted(score_sums)}

    print("# Mean calculate_score per player per turn across "
          f"{args.games} GreedyAgent vs GreedyAgent games.")
    print("# Paste into src/ismcts/agent.py as _BASELINE_SCORES.")
    print("_BASELINE_SCORES: dict[int, float] = {")
    for t, v in means.items():
        print(f"    {t}: {v},")
    print("}")


if __name__ == "__main__":
    main()

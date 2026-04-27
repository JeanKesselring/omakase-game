#!/usr/bin/env python3
"""Test agents against each other with game statistics."""

import argparse
import random
from collections import defaultdict

from sb3_contrib import MaskablePPO

from ismcts import ISMCTSAgent
from omakase.agent import SimpleGreedyAgent, RandomAgent
from omakase.env import OmakaseEnv, PASSIVE_ACTION_CARDS
from omakase.game_state import Phase, can_call_check
from omakase.rl_agent import RLAgent
from omakase.scoring import OMAKASE_SET, SAKURA_SET, UME_SET, KIDS_SET

SETS = [
    ("Omakase (6k) ", OMAKASE_SET),
    ("Sakura  (4.5k)", SAKURA_SET),
    ("Ume     (3.5k)", UME_SET),
    ("Kids    (2k) ", KIDS_SET),
]


def get_agent(agent_type: str, model_path: str = None, mcts_sims: int = 100, n_workers: int = 1, rollout_depth: int = 0):
    if agent_type == "greedy":
        return SimpleGreedyAgent()
    elif agent_type == "greedy_orig":
        from omakase.agent import GreedyAgent
        return GreedyAgent()
    elif agent_type == "random":
        return RandomAgent()
    elif agent_type == "rl":
        if not model_path:
            raise ValueError("RL agent requires --model argument")
        model = MaskablePPO.load(model_path)
        return RLAgent(model)
    elif agent_type == "mcts":
        return ISMCTSAgent(n_simulations=mcts_sims, n_workers=n_workers, rollout_depth=rollout_depth)
    else:
        raise ValueError(f"Unknown agent type: {agent_type}")


def play_game_with_stats(agents):
    env = OmakaseEnv(num_players=2)
    env.reset()

    checks = [0, 0]
    action_cards_played = [defaultdict(int), defaultdict(int)]

    step_count = 0
    max_steps = 10000

    while not env.state.game_over and step_count < max_steps:
        phase = env.state.phase
        player_idx = env.state.current_player
        player = env.state.get_active_player()

        legal_actions = env.get_legal_actions()
        action = agents[player_idx].choose_action(env, legal_actions)
        if action not in legal_actions:
            action = random.choice(legal_actions)

        if phase in (Phase.PHASE_1, Phase.PHASE_3) and action != 0:
            playable = [c for c in player.hand if not c.is_sushi and c.action_card not in PASSIVE_ACTION_CARDS]
            idx = action - 1
            if idx < len(playable):
                action_cards_played[player_idx][playable[idx].action_card.value] += 1

        if phase == Phase.PHASE_4 and action == 1 and can_call_check(env.state, player_idx):
            checks[player_idx] += 1

        env.step(action)
        step_count += 1

    sets_held = [set(), set()]
    for i in range(2):
        sushi_types = {c.sushi_card for c in env.state.players[i].hand if c.is_sushi}
        for name, required in SETS:
            if required.issubset(sushi_types):
                sets_held[i].add(name)

    results = env.get_game_results()
    winner = max(range(2), key=lambda i: results[i])

    return {
        "winner": winner,
        "scores": results,
        "checks": checks,
        "action_cards_played": action_cards_played,
        "sets_held": sets_held,
    }


def print_stats(agent_names, total_checks, total_action_cards, sets_completed, n):
    print(f"\n{'='*52}")
    print(f"  STATISTICS ({n} games)")
    print(f"{'='*52}")

    print("\nCHECK CALLS")
    for i, name in enumerate(agent_names):
        total = total_checks[i]
        print(f"  {name:<18} {total:>4} total  ({total/n:.2f}/game)")

    for i, name in enumerate(agent_names):
        print(f"\nACTION CARDS PLAYED — {name}")
        cards = total_action_cards[i]
        if not cards:
            print("  (none)")
        else:
            for card in sorted(cards, key=lambda c: -cards[c]):
                count = cards[card]
                print(f"  {card:<16} {count:>4}  ({count/n:.2f}/game)")

    print("\nSETS COMPLETED AT GAME END (% of games)")
    header = f"  {'Set':<17}" + "".join(f"  {name:<12}" for name in agent_names)
    print(header)
    print(f"  {'-'*17}" + "".join(f"  {'-'*12}" for _ in agent_names))
    for set_name, _ in SETS:
        row = f"  {set_name:<17}"
        for i in range(len(agent_names)):
            pct = 100 * sets_completed[i][set_name] / n
            row += f"  {pct:>5.1f}%      "
        print(row)
    any_set = [sum(sets_completed[i][s] for s, _ in SETS) for i in range(len(agent_names))]
    row = f"  {'Any set':<17}"
    for i in range(len(agent_names)):
        pct = 100 * any_set[i] / n
        row += f"  {pct:>5.1f}%      "
    print(row)


def main():
    parser = argparse.ArgumentParser(description="Test agents against each other")
    parser.add_argument("--agent0", type=str, default="greedy", choices=["greedy", "greedy_orig", "random", "rl", "mcts"])
    parser.add_argument("--agent1", type=str, default="random", choices=["greedy", "greedy_orig", "random", "rl", "mcts"])
    parser.add_argument("--model0", type=str, default=None)
    parser.add_argument("--model1", type=str, default=None)
    parser.add_argument("--games", type=int, default=10)
    parser.add_argument("--mcts-sims", type=int, default=100, help="IS-MCTS simulations per move (default: 100)")
    parser.add_argument("--workers", type=int, default=1, help="parallel worker processes for IS-MCTS; each runs full --mcts-sims independently (default: 1)")
    parser.add_argument("--rollout-depth", type=int, default=0, help="MCTS rollout depth in turns; 0 = full game (default: 0)")
    args = parser.parse_args()

    agent0 = get_agent(args.agent0, args.model0, args.mcts_sims, args.workers, args.rollout_depth)
    agent1 = get_agent(args.agent1, args.model1, args.mcts_sims, args.workers, args.rollout_depth)
    agents = [agent0, agent1]
    agent_names = [args.agent0.upper(), args.agent1.upper()]
    n = args.games

    print(f"Testing {agent_names[0]} vs {agent_names[1]} ({n} games)\n")
    col0 = f"Score {agent_names[0]}"
    col1 = f"Score {agent_names[1]}"
    print(f"{'Game':<6} {'Winner':<8} {col0:<16} {col1:<16}")
    print("-" * 48)

    wins = [0, 0]
    scores = [[], []]
    total_checks = [0, 0]
    total_action_cards = [defaultdict(int), defaultdict(int)]
    sets_completed = [{name: 0 for name, _ in SETS} for _ in range(2)]

    for i in range(n):
        result = play_game_with_stats(agents)
        winner = result["winner"]
        game_scores = result["scores"]

        wins[winner] += 1
        scores[0].append(game_scores[0])
        scores[1].append(game_scores[1])

        for p in range(2):
            total_checks[p] += result["checks"][p]
            for card, count in result["action_cards_played"][p].items():
                total_action_cards[p][card] += count
            for set_name in result["sets_held"][p]:
                sets_completed[p][set_name] += 1

        print(f"{i + 1:<6} {winner:<8} {game_scores[0]:<16} {game_scores[1]:<16}")

    print("-" * 48)
    avg0 = sum(scores[0]) / n
    avg1 = sum(scores[1]) / n
    print(f"{agent_names[0]} wins: {wins[0]}/{n} ({100*wins[0]/n:.0f}%) | Avg score: {avg0:.1f}")
    print(f"{agent_names[1]} wins: {wins[1]}/{n} ({100*wins[1]/n:.0f}%) | Avg score: {avg1:.1f}")

    print_stats(agent_names, total_checks, total_action_cards, sets_completed, n)


if __name__ == "__main__":
    main()

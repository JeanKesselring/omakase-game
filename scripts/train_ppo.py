#!/usr/bin/env python3
"""Training script for RL agent on Omakase game."""

import argparse
import random
from pathlib import Path

import torch
from sb3_contrib import MaskablePPO
from sb3_contrib.common.wrappers import ActionMasker
from stable_baselines3.common.callbacks import BaseCallback, CheckpointCallback
from stable_baselines3.common.vec_env import SubprocVecEnv, DummyVecEnv

from omakase.training_env import SelfPlayEnv


def mask_fn(env):
    return env.action_masks()


def make_env(num_players, seed, opponent):
    def _init():
        env = SelfPlayEnv(num_players=num_players, seed=seed)
        if opponent == "greedy":
            from omakase.agent import SimpleGreedyAgent
            env.default_opponent = SimpleGreedyAgent()
        return ActionMasker(env, mask_fn)
    return _init


class SelfPlayCallback(BaseCallback):
    """
    Every `snapshot_freq` steps, save a model snapshot and add it to an
    opponent pool. A random snapshot from the pool is then loaded into every
    parallel env so the agent trains against a mixture of past versions of
    itself rather than a fixed policy.

    Before the first snapshot the envs keep their default opponent (greedy or
    random), so the agent builds basic competence first.
    """

    def __init__(self, snapshot_freq: int, models_dir: Path, verbose: int = 1):
        super().__init__(verbose)
        self.snapshot_freq = snapshot_freq
        self.models_dir = models_dir
        self._pool: list[str] = []
        self._last_snap = 0

    def _on_step(self) -> bool:
        if self.num_timesteps - self._last_snap < self.snapshot_freq:
            return True

        path = str(self.models_dir / f"selfplay_{self.num_timesteps}")
        self.model.save(path)
        snap_path = path + ".zip"
        self._pool.append(snap_path)
        self._last_snap = self.num_timesteps

        chosen = random.choice(self._pool)
        # env_method runs inside each subprocess, so each env loads independently.
        self.training_env.env_method("load_opponent_from_path", chosen)

        if self.verbose >= 1:
            print(
                f"\n[SelfPlay] step={self.num_timesteps}  "
                f"pool={len(self._pool)}  using={Path(chosen).stem}"
            )
        return True


def main():
    parser = argparse.ArgumentParser(description="Train PPO agent on Omakase game")
    parser.add_argument("--num-players", type=int, default=2, choices=[2, 3, 4])
    parser.add_argument("--timesteps", type=int, default=2000000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out-dir", type=str, default="./")
    parser.add_argument("--opponent", type=str, default="greedy", choices=["random", "greedy"])
    parser.add_argument(
        "--n-envs",
        type=int,
        default=8,
        help="Number of parallel environments (default: 8)",
    )
    parser.add_argument(
        "--self-play",
        action="store_true",
        default=True,
        help="Enable self-play curriculum (default: on)",
    )
    parser.add_argument(
        "--no-self-play",
        dest="self_play",
        action="store_false",
        help="Disable self-play curriculum",
    )
    parser.add_argument(
        "--snapshot-freq",
        type=int,
        default=100000,
        help="Steps between self-play snapshots (default: 100k)",
    )

    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    models_dir = out_dir / "models"
    logs_dir = out_dir / "logs"
    models_dir.mkdir(exist_ok=True)
    logs_dir.mkdir(exist_ok=True)

    print(f"Training {args.num_players}-player Omakase agent for {args.timesteps} steps")
    print(f"Opponent: {args.opponent} | Self-play: {args.self_play} | Parallel envs: {args.n_envs}")
    print(f"Output directory: {out_dir}")

    env_fns = [make_env(args.num_players, args.seed + i, args.opponent) for i in range(args.n_envs)]
    # SubprocVecEnv requires a __main__ guard on Windows; on Mac/Linux it's fine.
    vec_env = SubprocVecEnv(env_fns) if args.n_envs > 1 else DummyVecEnv(env_fns)

    device = "mps" if torch.backends.mps.is_available() else "auto"
    print(f"Using device: {device}")

    # Scale n_steps down so total buffer = n_steps * n_envs ≈ 4096
    n_steps = max(64, 4096 // args.n_envs)
    batch_size = min(256, n_steps * args.n_envs // 16)
    print(f"n_steps={n_steps}  batch_size={batch_size}  buffer={n_steps * args.n_envs}")

    model = MaskablePPO(
        "MlpPolicy",
        vec_env,
        policy_kwargs=dict(net_arch=[256, 256]),
        learning_rate=1e-4,
        n_steps=n_steps,
        batch_size=batch_size,
        n_epochs=10,
        gamma=0.99,
        gae_lambda=0.95,
        clip_range=0.2,
        ent_coef=0.02,  # slightly higher than before for better exploration
        tensorboard_log=str(logs_dir),
        device=device,
        verbose=1,
    )

    callbacks = [
        CheckpointCallback(
            save_freq=max(1, 50000 // args.n_envs),
            save_path=str(models_dir),
            name_prefix=f"ppo_{args.num_players}p",
        )
    ]
    if args.self_play:
        callbacks.append(
            SelfPlayCallback(
                snapshot_freq=max(1, args.snapshot_freq // args.n_envs),
                models_dir=models_dir,
                verbose=1,
            )
        )

    print("Starting training...")
    model.learn(
        total_timesteps=args.timesteps,
        callback=callbacks,
        progress_bar=True,
    )

    final_model_path = models_dir / f"ppo_{args.num_players}p_final"
    model.save(str(final_model_path))
    print(f"\nTraining complete! Final model saved to {final_model_path}")

    vec_env.close()


if __name__ == "__main__":
    main()

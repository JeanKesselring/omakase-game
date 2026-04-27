# RL Training Guide for Omakase Game

## Setup

### 1. Install ML Dependencies

```bash
cd /Users/jean/Desktop/omakase_game
pip install -e ".[dev]"
```

This installs:
- `stable-baselines3` - PPO and other RL algorithms
- `sb3-contrib` - Additional algorithms including MaskablePPO
- `torch` - PyTorch (will auto-detect Apple Silicon MPS)
- `tensorboard` - Training visualization

### 2. Verify Installation

```bash
python -c "from src.omakase.training_env import SelfPlayEnv; print('✓ Ready to train!')"
```

---

## Training a New Agent

### Basic Training (2-player)

```bash
python scripts/train_ppo.py --num-players 2 --timesteps 300000
```

Expected runtime: **2-3 minutes** on Apple Silicon (M1/M2) with MPS

### Custom Configuration

```bash
python scripts/train_ppo.py \
    --num-players 3 \
    --timesteps 500000 \
    --seed 42 \
    --out-dir ./training_runs/exp1
```

**Arguments:**
- `--num-players` (2, 3, or 4): Player count for the game
- `--timesteps` (default 300000): Total training steps
- `--seed` (default 42): Random seed for reproducibility
- `--out-dir` (default ./): Output directory for models and logs

### Output

Training creates:
- `models/ppo_2p_final.zip` - Final trained model
- `models/ppo_2p_<N>_steps.zip` - Checkpoints every 50k steps
- `logs/` - TensorBoard logs

### View Training Progress

```bash
tensorboard --logdir ./logs
```

Then open http://localhost:6006 in your browser.

---

## Evaluating a Trained Agent

### Evaluate Against Various Opponents (2-player)

```bash
python scripts/evaluate.py --model models/ppo_2p_final.zip --games 200
```

Output shows:
- Win rate vs Random Agent
- Win rate vs Greedy Agent  
- Average and distribution of scores

### Compare Across Player Counts

```bash
python scripts/evaluate.py \
    --model models/ppo_2p_final.zip \
    --compare
```

This runs tournaments with 2, 3, and 4 players to understand how the agent adapts.

**Note:** For 3 and 4 player evaluation, train separate models:
```bash
python scripts/train_ppo.py --num-players 3 --timesteps 300000
python scripts/train_ppo.py --num-players 4 --timesteps 300000
python scripts/evaluate.py --model models/ppo_3p_final.zip --games 100
python scripts/evaluate.py --model models/ppo_4p_final.zip --games 100
```

---

## Understanding Self-Play Training

The training uses **snapshot self-play**:

1. **Steps 0-50k**: Agent trains against random opponents
2. **Every 50k steps**: 
   - Save a checkpoint of the current model
   - Reload that checkpoint as the opponent policy
   - Continue training against the updated opponent

This progressively increases opponent difficulty without complex async infrastructure.

---

## Key Implementation Details

### Observation Space (72 features)

- **Hand cards (40 features)**: 10 slots × [is_present, is_sushi, value_norm, is_action]
- **Belt cards (24 features)**: 6 slots × [is_present, is_sushi, value_norm, is_action]
- **State (8 features)**: hand_size, deck_size, opp_hand_size, matcha_count, wasabi_skip, check_protected, phase, turn_number

### Action Space

- **Discrete(64)** - Covers max 64 legal actions
- **Action Masking** - Only valid actions get non-zero probability
- Automatically maps to actual game moves

### Reward Signal

- **+1.0** if player 0 wins (highest score)
- **-1.0** if player 0 loses
- **0.0** - Draw or mid-game (only terminal reward)

### Hyperparameters

```
learning_rate: 3e-4
n_steps: 2048 (per rollout)
batch_size: 64
n_epochs: 10
gamma: 0.99 (discount factor)
gae_lambda: 0.95
clip_range: 0.2
```

Tuned for Apple Silicon performance. Adjust if needed:
- Lower learning rate (1e-4) for more stable but slower learning
- Higher n_steps (4096) for better sample efficiency
- Increase n_epochs (20) for more PPO updates per rollout

---

## Analyzing Strategies

After training, you can inspect what the agent learned:

```python
from sb3_contrib import MaskablePPO
from src.omakase.training_env import SelfPlayEnv
from sb3_contrib.common.wrappers import ActionMasker

# Load model
model = MaskablePPO.load("models/ppo_2p_final")

# Create env
def mask_fn(env):
    return env.action_masks()

env = SelfPlayEnv(num_players=2)
env = ActionMasker(env, mask_fn)

# Play a game and observe
obs, _ = env.reset()
for _ in range(500):
    action, _ = model.predict(obs, action_masks=env.unwrapped.action_masks())
    obs, reward, done, _, info = env.step(action)
    if done:
        scores = env.unwrapped.env.get_game_results()
        print(f"Final scores: {scores}")
        break
```

---

## Troubleshooting

### "No module named 'stable_baselines3'"

Run: `pip install -e ".[dev]"`

### "CUDA out of memory" or similar GPU errors

The code auto-detects MPS on Apple Silicon. If you get errors:
1. Make sure you're on the latest PyTorch: `pip install --upgrade torch`
2. Or force CPU: Edit `train_ppo.py` line ~80, change `device="mps"` to `device="cpu"`

### Training is very slow

- Check device: should say "Using device: mps" at startup
- Reduce `n_steps` from 2048 to 1024 (faster, less stable)
- Try a smaller model: create custom policy with smaller MLP

### Training diverges (rewards go very negative)

- Lower learning_rate to 1e-4
- Increase clip_range to 0.3
- Increase batch_size to 128

---

## Next Steps

1. **Train a 2-player agent**: `python scripts/train_ppo.py --num-players 2 --timesteps 300000`
2. **Evaluate it**: `python scripts/evaluate.py --model models/ppo_2p_final.zip --games 200`
3. **Train for 3 and 4 players**: Repeat for player counts 3 and 4
4. **Analyze strategies**: Look at which cards the agent prefers in different player counts

---

## Files

- `src/omakase/training_env.py` - Single-agent wrapper with self-play support
- `scripts/train_ppo.py` - Training entry point  
- `scripts/evaluate.py` - Evaluation and tournament runner

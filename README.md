# Omakase

Omakase is a strategic, browser-based sushi card game where players compete to build the highest-scoring hand. Balance immediate point gains with long-term set completion, navigate adversarial action cards, and outsmart your opponent.

**[Play Omakase](https://your-hosted-link.com)**

---

## Features
* **Web-Based Gameplay:** Play directly in your browser with a clean, tabletop-inspired UI. No downloads required.
* **Client-Side AI:** Challenge AI opponents powered by Monte Carlo Tree Search (MCTS) running locally via Web Workers.
* **Strategic Mechanics:** Utilize action cards like *Chopsticks* (steal), *Wasabi* (turn skip), and *Chef's Choice* (deck manipulation) to disrupt your opponent.
* **Imperfect Information:** A challenging environment for both humans and AI due to hidden hands, temporal depth, and delayed gratification.

## How to Play Locally

Clone the repository and open `web/index.html` in any web browser. No local server is required for basic gameplay.

```bash
git clone https://github.com/your-username/omakase_game.git
cd omakase_game
# Mac
open web/index.html
# Windows
start web/index.html
```

## 🤖 AI & Reinforcement Learning Environment

Omakase isn't just a web game; it is also a rigorous reinforcement learning playground. The repository contains a full Python-based environment (`gymnasium` compatible) for training AI agents to play the game at superhuman levels.

Currently supported AI architectures:
* **Vanilla MCTS:** Simulated planning search (used by the browser AI).
* **Maskable PPO:** Fast, reactive reinforcement learning agent.
* **Belief-Guided AlphaZero (WIP):** Advanced architecture combining Tree Search with Neural Networks to master the game's hidden information.

### Getting Started with AI Training

To train your own models, you'll need Python 3.8+ installed. 

```bash
# Install dependencies (PyTorch, Stable-Baselines3, etc.)
pip install -e ".[dev]"

# Train a baseline PPO agent
python scripts/train_ppo.py --num-players 2 --timesteps 300000
```

For a detailed breakdown of the action spaces, observation states, and training commands, please refer to the **TRAINING.md** guide.

## 🎨 Design System
The UI is built on a custom design system inspired by physical tabletop games and Japanese restaurant menus. See `DESIGN_SYSTEM.md` for styling guidelines, color tokens, and typography rules.
import os
from pathlib import Path
from typing import Optional

from .game_state import GameState
from .cards import SushiCard, ActionCard


class CardRenderer:
    def __init__(self, cards_dir: Optional[str] = None):
        if cards_dir is None:
            cards_dir = Path(__file__).parent.parent.parent / "cards"
        self.cards_dir = Path(cards_dir)

    def get_card_image_path(self, card_name: str) -> Optional[str]:
        card_image = self.cards_dir / f"{card_name}.png"
        if card_image.exists():
            return str(card_image)
        return None

    def render_game_ascii(self, state: GameState, player_idx: int) -> str:
        lines = []
        lines.append("\n" + "=" * 100)
        lines.append(f"Turn {state.current_player} | Phase {state.phase} | Deck: {len(state.deck)} | Trash: {len(state.trash)}")
        lines.append("=" * 100)

        player = state.get_active_player()
        lines.append(f"\nPlayer {player_idx} Hand ({len(player.hand)} cards):")
        for i, card in enumerate(player.hand):
            value_str = f"¥{card.get_value()}" if card.is_sushi else "[ACTION]"
            lines.append(f"  [{i}] {card.name():20s} {value_str:>8s}")

        lines.append(f"\nConveyor Belt ({len(state.conveyor_belt)} cards):")
        for i, card in enumerate(state.conveyor_belt):
            value_str = f"¥{card.get_value()}" if card.is_sushi else "[ACTION]"
            lines.append(f"  [{i}] {card.name():20s} {value_str:>8s}")

        lines.append(f"\nPlayer States:")
        for i, p in enumerate(state.players):
            status = f"Hand: {len(p.hand):2d} | Max: {p.max_hand_size} | Matcha: {p.matcha_count} | Skip: {p.wasabi_skip_flag} | Protected: {p.check_protected}"
            lines.append(f"  Player {i}: {status}")

        return "\n".join(lines)

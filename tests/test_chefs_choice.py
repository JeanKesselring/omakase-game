import pytest
from omakase.env import OmakaseEnv
from omakase.game_state import initialize_game, GameState, Phase
from omakase.cards import Card, SushiCard, ActionCard


class TestChefsChoice:
    """Test Chef's Choice implementation with card selection and positional placement."""

    def test_chefs_choice_draws_three_cards(self):
        """Chef's Choice should draw 3 cards from deck."""
        env = OmakaseEnv(num_players=2, seed=42)
        env.reset(seed=42)

        player = env.state.get_active_player()
        initial_hand_size = len(player.hand)
        initial_deck_size = len(env.state.deck)

        chefs_choice_card = None
        for card in player.hand:
            if not card.is_sushi and card.action_card == ActionCard.CHEFS_CHOICE:
                chefs_choice_card = card
                break

        if chefs_choice_card:
            action_idx = list(player.hand).index(chefs_choice_card) + 1
            legal_actions = env.get_legal_actions()
            if action_idx in legal_actions:
                env.step(action_idx)
                assert len(player.hand) == initial_hand_size + 3 - 1
                assert len(env.state.deck) == initial_deck_size - 3
                assert env.state.phase == Phase.CHEFS_CHOICE_SELECT_CARDS

    def test_chefs_choice_selection_and_positions(self):
        """Chef's Choice should allow selecting 2 cards and positions."""
        env = OmakaseEnv(num_players=2, seed=55)
        env.reset(seed=55)

        player = env.state.get_active_player()

        chefs_choice_card = None
        for card in player.hand:
            if not card.is_sushi and card.action_card == ActionCard.CHEFS_CHOICE:
                chefs_choice_card = card
                break

        if chefs_choice_card:
            action_idx = list(player.hand).index(chefs_choice_card) + 1
            legal_actions = env.get_legal_actions()
            if action_idx in legal_actions:
                env.step(action_idx)

                if env.state.phase == Phase.CHEFS_CHOICE_SELECT_CARDS:
                    deck_size_before = len(env.state.deck)
                    hand_size_before = len(player.hand)

                    legal_actions = env.get_legal_actions()
                    assert len(legal_actions) > 0

                    env.step(legal_actions[0])
                    assert len(env.state.chefs_choice_selected_cards) == 1
                    assert env.state.phase == Phase.CHEFS_CHOICE_SELECT_CARDS

                    legal_actions = env.get_legal_actions()
                    if legal_actions:
                        env.step(legal_actions[0])
                        assert len(env.state.chefs_choice_selected_cards) == 2
                        assert env.state.phase == Phase.CHEFS_CHOICE_SELECT_POSITIONS

                        if env.state.phase == Phase.CHEFS_CHOICE_SELECT_POSITIONS:
                            legal_actions = env.get_legal_actions()
                            assert len(legal_actions) > 0

                            deck_size_at_position = len(env.state.deck)
                            env.step(legal_actions[0])
                            assert len(env.state.chefs_choice_selected_positions) == 1

                            legal_actions = env.get_legal_actions()
                            env.step(legal_actions[0])
                            assert len(env.state.chefs_choice_selected_positions) == 2
                            assert env.state.phase == Phase.PHASE_3

    def test_chefs_choice_returns_cards_to_deck(self):
        """Chef's Choice should return 2 cards to deck at specified positions."""
        env = OmakaseEnv(num_players=2, seed=99)
        env.reset(seed=99)

        player = env.state.get_active_player()
        chefs_choice_card = None
        for card in player.hand:
            if not card.is_sushi and card.action_card == ActionCard.CHEFS_CHOICE:
                chefs_choice_card = card
                break

        if chefs_choice_card:
            action_idx = list(player.hand).index(chefs_choice_card) + 1
            legal_actions = env.get_legal_actions()
            if action_idx in legal_actions:
                initial_hand_size = len(player.hand)
                initial_deck_size = len(env.state.deck)

                env.step(action_idx)

                if env.state.phase == Phase.CHEFS_CHOICE_SELECT_CARDS:
                    legal_actions = env.get_legal_actions()
                    env.step(legal_actions[0])
                    env.step(env.get_legal_actions()[0])

                    if env.state.phase == Phase.CHEFS_CHOICE_SELECT_POSITIONS:
                        legal_actions = env.get_legal_actions()
                        env.step(legal_actions[0])
                        env.step(env.get_legal_actions()[0])

                        assert env.state.phase == Phase.PHASE_3
                        assert len(player.hand) == initial_hand_size - 2
                        assert len(env.state.deck) == initial_deck_size

    def test_wasabi_triggers_from_chefs_choice_draw(self):
        """Wasabi should trigger skip flag when drawn via Chef's Choice."""
        env = OmakaseEnv(num_players=2, seed=42)
        env.reset(seed=42)

        found_chefs_choice = False
        for _ in range(100):
            if env.state.game_over:
                break

            legal_actions = env.get_legal_actions()
            player = env.state.get_active_player()

            chefs_choice_card = None
            for card in player.hand:
                if not card.is_sushi and card.action_card == ActionCard.CHEFS_CHOICE:
                    chefs_choice_card = card
                    break

            if chefs_choice_card and env.state.phase == Phase.PHASE_1:
                action_idx = list(player.hand).index(chefs_choice_card) + 1
                if action_idx in legal_actions:
                    found_chefs_choice = True
                    skip_flag_before = player.wasabi_skip_flag
                    env.step(action_idx)

                    if env.state.phase == Phase.CHEFS_CHOICE_SELECT_CARDS:
                        skip_flag_after = player.wasabi_skip_flag
                        skip_flag_increased = skip_flag_after > skip_flag_before

                        if skip_flag_increased:
                            wasabi_in_drawn = any(
                                c.action_card == ActionCard.WASABI
                                for c in env.state.chefs_choice_drawn_cards
                                if not c.is_sushi
                            )
                            assert wasabi_in_drawn
                        break
            else:
                env.step(legal_actions[0])

    def test_wasabi_triggers_from_sake(self):
        """Wasabi should trigger skip flag when received via Sake."""
        env = OmakaseEnv(num_players=2, seed=77)
        env.reset(seed=77)

        for _ in range(200):
            if env.state.game_over:
                break

            legal_actions = env.get_legal_actions()
            player = env.state.get_active_player()

            sake_card = None
            for card in player.hand:
                if not card.is_sushi and card.action_card == ActionCard.SAKE:
                    sake_card = card
                    break

            if sake_card and env.state.phase == Phase.PHASE_1:
                action_idx = list(player.hand).index(sake_card) + 1
                if action_idx in legal_actions:
                    skip_flag_before = player.wasabi_skip_flag
                    hand_size_before = len(player.hand)
                    env.step(action_idx)

                    if len(player.hand) > hand_size_before:
                        skip_flag_after = player.wasabi_skip_flag
                        if skip_flag_after > skip_flag_before:
                            wasabi_in_hand = any(
                                c.action_card == ActionCard.WASABI
                                for c in player.hand
                                if not c.is_sushi
                            )
                            assert wasabi_in_hand
                    break
            else:
                env.step(legal_actions[0])

    def test_wasabi_triggers_from_umeshu(self):
        """Wasabi should trigger skip flag when received via Umeshu."""
        env = OmakaseEnv(num_players=2, seed=88)
        env.reset(seed=88)

        for _ in range(200):
            if env.state.game_over:
                break

            legal_actions = env.get_legal_actions()
            player = env.state.get_active_player()

            umeshu_card = None
            for card in player.hand:
                if not card.is_sushi and card.action_card == ActionCard.UMESHU:
                    umeshu_card = card
                    break

            if umeshu_card and env.state.phase == Phase.PHASE_1:
                action_idx = list(player.hand).index(umeshu_card) + 1
                if action_idx in legal_actions:
                    skip_flag_before = player.wasabi_skip_flag
                    hand_composition_before = set(c.card_id for c in player.hand)
                    env.step(action_idx)

                    skip_flag_after = player.wasabi_skip_flag
                    if skip_flag_after > skip_flag_before:
                        wasabi_in_new_cards = any(
                            c.action_card == ActionCard.WASABI
                            for c in player.hand
                            if c.card_id not in hand_composition_before and not c.is_sushi
                        )
                        assert wasabi_in_new_cards
                    break
            else:
                env.step(legal_actions[0])

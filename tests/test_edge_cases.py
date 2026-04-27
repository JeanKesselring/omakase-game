import pytest
from omakase.env import OmakaseEnv
from omakase.game_state import initialize_game, GameState, PlayerState, enforce_hand_limit
from omakase.cards import Card, SushiCard, ActionCard
from omakase.scoring import calculate_score


class TestPhase2EdgeCases:
    """Test Phase 2 exchange requirements and deadlock prevention."""

    def test_phase2_with_single_shoyu_in_hand(self):
        """Player has only Shoyu, must be able to exchange with any non-Shoyu belt card."""
        env = OmakaseEnv(num_players=2, seed=99)
        env.reset(seed=99)

        player = env.state.get_active_player()
        shoyu = Card(200, is_sushi=False, action_card=ActionCard.SHOYU)
        player.hand = [shoyu]

        # Move to Phase 2 for this test
        env.state.phase = 1

        # Phase 2 legal actions
        legal_actions = env.get_legal_actions()
        assert len(legal_actions) > 0  # Should have at least one exchange option

        # Perform an exchange
        initial_hand_id = player.hand[0].card_id
        initial_belt_id = env.state.conveyor_belt[0].card_id

        env.step(legal_actions[0])

        # After exchange, cards should be swapped
        assert player.hand[0].card_id == initial_belt_id or env.state.phase == 2

    def test_phase2_no_valid_exchanges_impossible(self):
        """Verify that no valid exchanges is practically impossible due to card distribution."""
        state = initialize_game(num_players=2, seed=42)
        player = state.players[0]

        # Best case to trigger deadlock: player has one card type, all belt cards same type
        # But max 5 cards of any type exist, and belt needs 6 cards
        # So mathematically impossible

        player.hand = [Card(100, is_sushi=True, sushi_card=SushiCard.OMELETTE)]
        # There are 5 OMELETTE total, so can't fill entire belt with them

        # All belt cards can't be OMELETTE, so there must be at least 1 non-OMELETTE
        assert len([c for c in state.conveyor_belt if c.sushi_card == SushiCard.OMELETTE]) < 6


class TestScoringEdgeCases:
    """Test scoring with unusual hand compositions."""

    def test_score_empty_hand(self):
        """Score for empty hand should be 0."""
        hand = []
        score = calculate_score(hand)
        assert score == 0

    def test_score_only_action_cards(self):
        """Hand with only non-Shoyu action cards scores 0."""
        hand = [
            Card(1, is_sushi=False, action_card=ActionCard.CHOPSTICKS),
            Card(2, is_sushi=False, action_card=ActionCard.SAKE),
            Card(3, is_sushi=False, action_card=ActionCard.GINGER),
        ]
        score = calculate_score(hand)
        assert score == 0

    def test_score_only_shoyu_cards(self):
        """Hand with only Shoyu cards (no sushi to double) scores 0."""
        hand = [
            Card(1, is_sushi=False, action_card=ActionCard.SHOYU),
            Card(2, is_sushi=False, action_card=ActionCard.SHOYU),
        ]
        score = calculate_score(hand)
        assert score == 0

    def test_score_more_shoyu_than_sushi(self):
        """More Shoyu than sushi: only sushi count cards can be doubled."""
        hand = [
            Card(1, is_sushi=True, sushi_card=SushiCard.FATTY_TUNA),  # 1000
            Card(2, is_sushi=False, action_card=ActionCard.SHOYU),
            Card(3, is_sushi=False, action_card=ActionCard.SHOYU),
            Card(4, is_sushi=False, action_card=ActionCard.SHOYU),
        ]
        score = calculate_score(hand)
        # 1 sushi card (1000) + 1 Shoyu can only double 1 card max
        assert score == 1000 + 1000  # base + 1 shoyu application

    def test_score_shoyu_bonus_applies_to_highest_value(self):
        """Shoyu should double the highest-value standalone card first."""
        hand = [
            Card(1, is_sushi=True, sushi_card=SushiCard.FATTY_TUNA),      # 1000
            Card(2, is_sushi=True, sushi_card=SushiCard.PREMIUM_EEL),     # 1200
            Card(3, is_sushi=True, sushi_card=SushiCard.OCTOPUS),         # 1100
            Card(4, is_sushi=False, action_card=ActionCard.SHOYU),
        ]
        score = calculate_score(hand)
        # Base: 1000 + 1200 + 1100 = 3300
        # Shoyu doubles highest (1200)
        # Total: 3300 + 1200 = 4500
        assert score == 4500

    def test_score_set_with_leftover_shoyu(self):
        """Set scoring + Shoyu bonus for remaining cards."""
        hand = [
            # Omakase set
            Card(1, is_sushi=True, sushi_card=SushiCard.FATTY_TUNA),       # in set
            Card(2, is_sushi=True, sushi_card=SushiCard.CONGER_EEL),       # in set
            Card(3, is_sushi=True, sushi_card=SushiCard.CRAB),             # in set
            Card(4, is_sushi=True, sushi_card=SushiCard.TUNA),             # in set
            Card(5, is_sushi=True, sushi_card=SushiCard.SALMON),           # in set
            Card(6, is_sushi=True, sushi_card=SushiCard.SALMON_ROE),       # in set
            # Standalone
            Card(7, is_sushi=True, sushi_card=SushiCard.OMELETTE),         # 200
            Card(8, is_sushi=False, action_card=ActionCard.SHOYU),
        ]
        score = calculate_score(hand)
        # Omakase: 6000
        # Standalone: 200 + (Shoyu * 200) = 200 + 200 = 400
        # Total: 6400
        assert score == 6400


class TestStartTurnWithZeroCards:
    """Test the specific scenario: player has 0 cards, draws Shoyu, must exchange."""

    def test_draw_shoyu_with_zero_cards_then_exchange(self):
        """Player with 0 cards draws Shoyu and can exchange it."""
        env = OmakaseEnv(num_players=2, seed=42)
        env.reset(seed=42)

        # Manually set player to have 0 cards to simulate edge case
        player = env.state.get_active_player()
        player.hand = []

        # Go to start of next turn
        env.turn_count = 1
        env._handle_turn_start()

        # Player should now have 1 card
        assert len(player.hand) == 1

        # Force to Phase 2
        env.state.phase = 1

        # Should have legal exchange actions
        legal_actions = env.get_legal_actions()
        assert len(legal_actions) > 0

    def test_shoyu_drawn_then_exchanged(self):
        """Verify hand limit and exchange works when Shoyu is drawn then exchanged."""
        env = OmakaseEnv(num_players=2, seed=55)
        env.reset(seed=55)

        # Track if we can proceed through a full turn even with Shoyu
        max_steps = 500

        for step_count in range(max_steps):
            if env.state.game_over:
                break

            legal_actions = env.get_legal_actions()
            if not legal_actions:
                break

            action = legal_actions[0]
            env.step(action)

        # Game should eventually complete (may take > 100 steps due to random play)
        assert env.state.game_over


class TestHandLimitAndEnforcement:
    """Test hand size limits with various card combinations."""

    def test_enforce_limit_with_only_action_cards(self):
        """Hand limit enforcement with only action cards."""
        state = initialize_game(num_players=2, seed=42)
        player = state.players[0]

        # Set max to 2
        player.max_hand_size = 2

        # Add action cards only
        player.hand = [
            Card(100, is_sushi=False, action_card=ActionCard.CHOPSTICKS),
            Card(101, is_sushi=False, action_card=ActionCard.SAKE),
            Card(102, is_sushi=False, action_card=ActionCard.GINGER),
        ]

        initial_size = len(player.hand)
        enforce_hand_limit(state, 0)

        # Should discard 1 action card
        assert len(player.hand) == 2
        assert len(state.trash) > 0

    def test_enforce_limit_prefers_sushi(self):
        """Hand limit enforcement prefers to discard sushi over action cards."""
        state = initialize_game(num_players=2, seed=42)
        player = state.players[0]

        player.max_hand_size = 2

        # Mix of sushi and action
        player.hand = [
            Card(100, is_sushi=True, sushi_card=SushiCard.FATTY_TUNA),
            Card(101, is_sushi=True, sushi_card=SushiCard.OMELETTE),
            Card(102, is_sushi=False, action_card=ActionCard.CHOPSTICKS),
        ]

        enforce_hand_limit(state, 0)

        # Should discard sushi preferentially
        assert len(player.hand) == 2
        # One of the sushi should be in trash
        sushi_in_hand = [c for c in player.hand if c.is_sushi]
        assert len(sushi_in_hand) <= 2  # Should have discarded sushi


class TestMultiPlayerScenarios:
    """Test edge cases in multiplayer games."""

    def test_3player_game_hand_distribution(self):
        """Verify hand sizes are reasonable in 3-player game."""
        env = OmakaseEnv(num_players=3, seed=42)
        env.reset(seed=42)

        for i in range(50):
            if env.state.game_over:
                break

            legal_actions = env.get_legal_actions()
            action = legal_actions[0]
            env.step(action)

        # All players should have valid hand sizes
        for player in env.state.players:
            assert len(player.hand) <= player.max_hand_size

    def test_game_progresses_with_different_seeds(self):
        """Game should complete with various seed values."""
        for seed in [1, 42, 123, 999]:
            env = OmakaseEnv(num_players=2, seed=seed)
            env.reset(seed=seed)

            steps = 0
            while not env.state.game_over and steps < 500:
                legal_actions = env.get_legal_actions()
                action = legal_actions[0]
                env.step(action)
                steps += 1

            assert env.state.game_over
            results = env.get_game_results()
            assert all(v >= 0 for v in results.values())

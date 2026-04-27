// Web Worker for MCTS — keeps main thread UI responsive during AI thinking.
// Receives serialized env state, runs MCTS, posts back best action.

import { OmakaseEnv } from '../engine/env.js';
import { ISMCTSAgent } from '../agents/mcts.js';

let agent = null;

self.onmessage = function(e) {
  const { type, envState, turnCount, numPlayers, legalActions, nSimulations, c, rolloutDepth } = e.data;

  if (type === 'choose') {
    if (!agent) {
      agent = new ISMCTSAgent({ nSimulations, c: c ?? 1.5, rolloutDepth: rolloutDepth ?? 0 });
    }

    // Reconstruct env from serialized state
    const env = new OmakaseEnv(numPlayers);
    env.state = envState;   // structuredClone was used on the sending side
    env.turnCount = turnCount;

    const action = agent.chooseAction(env, legalActions);
    self.postMessage({ type: 'result', action });
  }
};

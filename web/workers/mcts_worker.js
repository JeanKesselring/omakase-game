// Web Worker for MCTS — keeps main thread UI responsive during AI thinking.
// Supports both ISMCTSAgent (v1) and ISMCTSAgentV2 (v2).

import { OmakaseEnv } from '../engine/env.js';
import { ISMCTSAgent } from '../agents/mcts.js';
import { ISMCTSAgentV2 } from '../agents/mcts2.js';

let agent = null;
let agentVersion = null;

self.onmessage = function(e) {
  const { type, envState, turnCount, numPlayers, legalActions, nSimulations, timeBudgetMs, agentType, c, rolloutDepth } = e.data;

  if (type === 'choose') {
    // Re-create agent if version changed (e.g. user switches between MCTS and MCTS+)
    const requestedVersion = agentType === 'mcts2' ? 'v2' : 'v1';
    if (!agent || agentVersion !== requestedVersion) {
      agentVersion = requestedVersion;
      const opts = { nSimulations: nSimulations ?? 500, timeBudgetMs: timeBudgetMs ?? 0, c: c ?? 1.5 };
      agent = requestedVersion === 'v2' ? new ISMCTSAgentV2(opts) : new ISMCTSAgent(opts);
    } else {
      if (nSimulations != null) agent.nSimulations = nSimulations;
      if (timeBudgetMs != null) agent.timeBudgetMs = timeBudgetMs;
    }

    // Reset tree each call — the worker is only invoked for Phase 2 while the
    // main thread handles all other phases, so the warm root from the previous
    // call was built under a completely different game state and is harmful.
    agent._root = null;
    agent._lastAction = null;

    const env = new OmakaseEnv(numPlayers);
    env.state = envState;
    env.turnCount = turnCount;

    const action = agent.chooseAction(env, legalActions);
    self.postMessage({ type: 'result', action });
  }
};

import { Type, type Static } from "@sinclair/typebox";
import { StrategyInvocation } from "../schemas/strategy.js";
import type { StrategyResultEntry } from "../schemas/manifest.js";
import type { Strategy, StrategyContext, StrategyResult } from "./types.js";

export const CompositeConfig = Type.Object(
  {
    strategies: Type.Array(StrategyInvocation, { minItems: 1 }),
  },
  {
    $id: "wpfresh/strategies/composite.config.schema.json",
    additionalProperties: false,
  },
);

export type CompositeConfig = Static<typeof CompositeConfig>;

export interface CompositeData {
  strategies: StrategyResultEntry[];
}

export const compositeStrategy: Strategy<CompositeConfig, CompositeData> = {
  id: "composite",
  description:
    "Run a sequence of inner strategies, each with its own runIf. Use to express " +
    "'do A, then B only if A passed', or to bundle reusable strategy combinations. " +
    "Inner results are nested under the manifest entry's data.strategies array.",
  configSchema: CompositeConfig,

  async run(ctx: StrategyContext, config: CompositeConfig): Promise<StrategyResult<CompositeData>> {
    const innerResults: StrategyResultEntry[] = [];
    let allPassed = true;
    const allArtifacts: string[] = [];

    for (const invocation of config.strategies) {
      const result = await ctx.runStrategy(invocation, innerResults);
      innerResults.push(result);
      if (!result.skipped && !result.passed) allPassed = false;
      if (result.artifacts) allArtifacts.push(...result.artifacts);
    }

    return {
      passed: allPassed,
      data: { strategies: innerResults },
      artifacts: allArtifacts,
    };
  },
};

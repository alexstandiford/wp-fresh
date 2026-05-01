import { Type, type Static } from "@sinclair/typebox";

export const RunIf = Type.Union(
  [
    Type.Literal("always"),
    Type.Literal("previous-passed"),
    Type.Literal("previous-failed"),
    Type.Literal("all-passed"),
  ],
  {
    default: "always",
    description:
      "Conditional execution. 'previous-*' looks back to the most recent non-skipped strategy. 'all-passed' requires every prior non-skipped strategy to have passed.",
  },
);

export const StrategyInvocation = Type.Object(
  {
    ref: Type.String({
      description:
        "Built-in strategy id (smoke, capture, interact, composite) or path to a user-defined composite JSON",
    }),
    config: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    runIf: Type.Optional(RunIf),
  },
  {
    $id: "wpfresh/strategy-invocation.schema.json",
    additionalProperties: false,
  },
);

export const CompositeStrategy = Type.Object(
  {
    id: Type.String({ pattern: "^[a-z0-9][a-z0-9-]*$" }),
    kind: Type.Literal("composite"),
    description: Type.String({ minLength: 10 }),
    strategies: Type.Array(StrategyInvocation, { minItems: 1 }),
  },
  {
    $id: "wpfresh/composite-strategy.schema.json",
    additionalProperties: false,
  },
);

export type RunIf = Static<typeof RunIf>;
export type StrategyInvocation = Static<typeof StrategyInvocation>;
export type CompositeStrategy = Static<typeof CompositeStrategy>;

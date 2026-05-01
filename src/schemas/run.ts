import { Type, type Static } from "@sinclair/typebox";
import { StrategyInvocation } from "./strategy.js";

export const TagSelector = Type.Object(
  {
    all: Type.Optional(Type.Array(Type.String())),
    any: Type.Optional(Type.Array(Type.String())),
    none: Type.Optional(Type.Array(Type.String())),
  },
  {
    $id: "wpfresh/tag-selector.schema.json",
    additionalProperties: false,
    description:
      "Set-based environment selector. all/any/none combine with AND. Empty selector matches nothing.",
  },
);

export const EnvironmentSelection = Type.Object(
  {
    ids: Type.Optional(Type.Array(Type.String(), { uniqueItems: true })),
    tags: Type.Optional(TagSelector),
  },
  {
    additionalProperties: false,
    minProperties: 1,
    description: "At least one of ids or tags must be present. Results are unioned.",
  },
);

export const Run = Type.Object(
  {
    id: Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),
    environments: EnvironmentSelection,
    strategies: Type.Array(StrategyInvocation, { minItems: 1 }),
  },
  {
    $id: "wpfresh/run.schema.json",
    additionalProperties: false,
  },
);

export type TagSelector = Static<typeof TagSelector>;
export type EnvironmentSelection = Static<typeof EnvironmentSelection>;
export type Run = Static<typeof Run>;

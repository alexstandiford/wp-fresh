import { Type, type Static } from "@sinclair/typebox";

export const StrategyResultEntry = Type.Object(
  {
    ref: Type.String(),
    passed: Type.Boolean(),
    skipped: Type.Optional(Type.Boolean()),
    skip_reason: Type.Optional(Type.String()),
    started_at: Type.String({ format: "date-time" }),
    completed_at: Type.String({ format: "date-time" }),
    data: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    artifacts: Type.Optional(Type.Array(Type.String())),
  },
  { additionalProperties: false },
);

export const EnvironmentResult = Type.Object(
  {
    environment_id: Type.String(),
    instance_id: Type.Optional(Type.String()),
    provisioned_at: Type.Optional(Type.String({ format: "date-time" })),
    passed: Type.Boolean(),
    error: Type.Optional(Type.String()),
    strategies: Type.Array(StrategyResultEntry),
  },
  { additionalProperties: false },
);

export const Manifest = Type.Object(
  {
    run_id: Type.String({ format: "uuid" }),
    started_at: Type.String({ format: "date-time" }),
    completed_at: Type.String({ format: "date-time" }),
    run_config: Type.Record(Type.String(), Type.Unknown()),
    results: Type.Array(EnvironmentResult),
    summary: Type.Object(
      {
        total_environments: Type.Integer({ minimum: 0 }),
        passed_environments: Type.Integer({ minimum: 0 }),
        failed_environments: Type.Integer({ minimum: 0 }),
      },
      { additionalProperties: false },
    ),
  },
  {
    $id: "wpfresh/manifest.schema.json",
    additionalProperties: false,
  },
);

export type StrategyResultEntry = Static<typeof StrategyResultEntry>;
export type EnvironmentResult = Static<typeof EnvironmentResult>;
export type Manifest = Static<typeof Manifest>;

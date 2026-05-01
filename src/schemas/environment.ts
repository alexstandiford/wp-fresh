import { Type, type Static } from "@sinclair/typebox";

export const EnvironmentAuth = Type.Object(
  {
    admin_user: Type.String({ default: "admin" }),
    admin_password: Type.String({ default: "password" }),
  },
  { additionalProperties: false },
);

export const Environment = Type.Object(
  {
    id: Type.String({
      pattern: "^[a-z0-9][a-z0-9-]*$",
      description: "Lowercase kebab-case identifier, unique per project",
    }),
    description: Type.String({
      minLength: 10,
      description: "Human/agent readable summary of what this environment represents",
    }),
    tags: Type.Optional(Type.Array(Type.String(), { uniqueItems: true, default: [] })),
    blueprint: Type.String({
      description: "Path to a Playground Blueprint JSON file, relative to this environment file",
    }),
    wp_version: Type.Optional(Type.String({ default: "latest" })),
    php_version: Type.Optional(Type.String({ default: "8.3" })),
    snapshot: Type.Optional(
      Type.String({
        description:
          "Optional snapshot key. If omitted, derived from blueprint contents + WP/PHP versions.",
      }),
    ),
    auth: Type.Optional(EnvironmentAuth),
  },
  {
    $id: "wpfresh/environment.schema.json",
    title: "wp-fresh Environment",
    additionalProperties: false,
  },
);

export type Environment = Static<typeof Environment>;
export type EnvironmentAuth = Static<typeof EnvironmentAuth>;

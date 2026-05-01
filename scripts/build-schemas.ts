import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Environment } from "../src/schemas/environment.js";
import { Run, TagSelector } from "../src/schemas/run.js";
import { StrategyInvocation, CompositeStrategy } from "../src/schemas/strategy.js";
import { Manifest } from "../src/schemas/manifest.js";

const DRAFT = "https://json-schema.org/draft/2020-12/schema";
const OUT = resolve("./dist/schemas/generated");

const schemas: Record<string, object> = {
  "environment.schema.json": Environment,
  "run.schema.json": Run,
  "tag-selector.schema.json": TagSelector,
  "strategy-invocation.schema.json": StrategyInvocation,
  "composite-strategy.schema.json": CompositeStrategy,
  "manifest.schema.json": Manifest,
};

await mkdir(OUT, { recursive: true });

for (const [name, schema] of Object.entries(schemas)) {
  const withDraft = { $schema: DRAFT, ...schema };
  await writeFile(resolve(OUT, name), JSON.stringify(withDraft, null, 2) + "\n");
  console.log(`wrote ${name}`);
}

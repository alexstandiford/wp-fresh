import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, isAbsolute } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { Environment } from "../schemas/environment.js";
import { Run } from "../schemas/run.js";

type AjvCtor = typeof import("ajv/dist/2020.js");
const AjvImpl = (Ajv2020 as unknown as AjvCtor).default ?? (Ajv2020 as unknown as AjvCtor);
const formatsImpl =
  (addFormats as unknown as { default?: typeof addFormats }).default ?? addFormats;

const ajv = new AjvImpl({ strict: false, allErrors: true });
formatsImpl(ajv);

const validateEnv = ajv.compile(Environment);
const validateRun = ajv.compile(Run);

export interface LoadedEnvironment {
  env: Environment;
  /** Absolute path to the environment file (used to resolve relative blueprint paths) */
  path: string;
}

function formatErrors(errors: { instancePath: string; message?: string }[] | null | undefined): string {
  return (errors ?? [])
    .map((e) => `  ${e.instancePath || "(root)"} ${e.message ?? ""}`)
    .join("\n");
}

export async function loadEnvironment(path: string): Promise<LoadedEnvironment> {
  const abs = isAbsolute(path) ? path : resolve(path);
  const text = await readFile(abs, "utf8");
  const data = JSON.parse(text);
  if (!validateEnv(data)) {
    throw new Error(`Invalid environment file ${abs}:\n${formatErrors(validateEnv.errors)}`);
  }
  return { env: data as Environment, path: abs };
}

export async function loadEnvironmentsFromDir(dir: string): Promise<LoadedEnvironment[]> {
  const abs = isAbsolute(dir) ? dir : resolve(dir);
  const entries = await readdir(abs);
  const out: LoadedEnvironment[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const full = resolve(abs, entry);
    const s = await stat(full);
    if (!s.isFile()) continue;
    out.push(await loadEnvironment(full));
  }
  return out;
}

export async function loadRun(path: string): Promise<Run> {
  const abs = isAbsolute(path) ? path : resolve(path);
  const text = await readFile(abs, "utf8");
  const data = JSON.parse(text);
  if (!validateRun(data)) {
    throw new Error(`Invalid run file ${abs}:\n${formatErrors(validateRun.errors)}`);
  }
  return data as Run;
}

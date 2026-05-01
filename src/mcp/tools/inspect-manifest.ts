import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";

interface InspectManifestInput {
  project_dir: string;
  run_id: string;
}

export const inspectManifestTool = {
  name: "inspect_manifest",
  description:
    "Read a previously-written manifest by run_id. Manifests are stored at " +
    "<project_dir>/wpfresh-runs/<run_id>.json. Returns the full manifest JSON. Use this to " +
    "inspect prior run results without re-executing.",
  inputSchema: {
    type: "object" as const,
    properties: {
      project_dir: {
        type: "string",
        description: "Absolute path to the project root containing wpfresh-runs/",
      },
      run_id: {
        type: "string",
        description: "UUID of the run, as returned by the run tool's manifest",
      },
    },
    required: ["project_dir", "run_id"],
    additionalProperties: false,
  },
  async handler(args: InspectManifestInput): Promise<unknown> {
    const path = resolve(join(args.project_dir, "wpfresh-runs", `${args.run_id}.json`));
    const text = await readFile(path, "utf8");
    return JSON.parse(text);
  },
};

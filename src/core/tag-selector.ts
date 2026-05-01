import type { TagSelector } from "../schemas/run.js";

/**
 * Match an environment's tag set against a tag selector.
 *
 * - `all`: every listed tag must be present
 * - `any`: at least one listed tag must be present (if the field is provided and non-empty)
 * - `none`: none of the listed tags may be present
 *
 * All three combine with AND. Missing or empty fields impose no constraint, except
 * that a selector with no fields (or only empty arrays) matches nothing -- the schema's
 * minProperties:1 prevents this in practice; this function returns false defensively.
 */
export function matchesTagSelector(envTags: readonly string[], selector: TagSelector): boolean {
  const env = new Set(envTags);
  const all = selector.all ?? [];
  const any = selector.any ?? [];
  const none = selector.none ?? [];

  if (all.length === 0 && any.length === 0 && none.length === 0) return false;

  for (const tag of all) {
    if (!env.has(tag)) return false;
  }

  if (any.length > 0) {
    let matched = false;
    for (const tag of any) {
      if (env.has(tag)) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }

  for (const tag of none) {
    if (env.has(tag)) return false;
  }

  return true;
}

import { StrategyRegistry } from "../core/strategy-registry.js";
import { smokeStrategy } from "../strategies/smoke.js";
import { captureStrategy } from "../strategies/capture.js";
import { compositeStrategy } from "../strategies/composite.js";

/** Build a registry pre-loaded with all built-in strategies. */
export function defaultRegistry(): StrategyRegistry {
  const r = new StrategyRegistry();
  r.register(smokeStrategy);
  r.register(captureStrategy);
  r.register(compositeStrategy);
  return r;
}

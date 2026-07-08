import type { IMemoryStore, InjectionProfile } from "./types.js";

/**
 * Build injection text by querying memory store and formatting as Markdown prefix.
 * Used by execute_prompt and chat_with_session to prepend shared context.
 */
export function buildInjection(
  store: IMemoryStore,
  profile: InjectionProfile
): string {
  if (profile.level === "off") return "";
  return store.buildInjection(profile);
}

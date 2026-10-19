/**
 * How text is sent to nope-edge: the one place that defines the prompt and
 * the decoding defaults.
 *
 * Source: the nopenet/nope-edge model card
 * (https://huggingface.co/nopenet/nope-edge, README.md "Usage", "Multi-Turn
 * Conversations" and "Production Deployment"), and the GGUF `Modelfile`
 * (https://huggingface.co/nopenet/nope-edge-GGUF), both read on 2026-10-18:
 *
 * - **No system prompt.** Every example sends a single user message, and the
 *   model's chat template adds no default system prompt.
 * - **The user message is the text itself**, unwrapped: "Edge is trained on
 *   one serialized user message, not native chat roles." For a multi-turn
 *   exchange the card serializes the whole conversation into that one string
 *   (`"User: ...\n\nAI: ...\n\nUser: ..."`); that is the caller's choice of
 *   input, so this adapter sends whatever text it is given, unchanged.
 * - **Greedy decoding.** The card generates with `do_sample=False` and its
 *   OpenAI-compatible example sends `"temperature": 0`; the Modelfile sets
 *   `temperature 0`. The weights' `generation_config.json` inherits Qwen3's
 *   sampling defaults (temperature 0.6), which a server may apply when a
 *   request omits `temperature`, so the adapter always sends it.
 * - **300 output tokens.** The card uses `max_new_tokens=300` and
 *   `"max_tokens": 300` (the Modelfile allows 512).
 *
 * The card documents no other prompt wording, so none is added. If a later
 * card prescribes a system prompt or a wrapper, change it here only.
 */

/** One OpenAI-compatible chat message. */
export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

/**
 * The system prompt nope-edge expects: none. Kept as a constant so a future
 * card change is a one-line edit.
 */
export const NOPE_EDGE_SYSTEM_PROMPT: string | undefined = undefined;

/** Default sampling temperature: 0 (greedy), as the model card and Modelfile use. */
export const DEFAULT_TEMPERATURE = 0;

/** Default `max_tokens`: 300, as the model card uses. */
export const DEFAULT_MAX_TOKENS = 300;

/**
 * Build the chat messages for one text: an optional system message (none
 * today) and one user message whose content is `text`, unchanged.
 */
export function buildNopeMessages(text: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (NOPE_EDGE_SYSTEM_PROMPT !== undefined) messages.push({ role: 'system', content: NOPE_EDGE_SYSTEM_PROMPT });
  messages.push({ role: 'user', content: text });
  return messages;
}

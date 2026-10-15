import Anthropic from "@anthropic-ai/sdk";
import models from "../models.json" with { type: "json" };

export type Task = "explain" | "classify" | "invoice";

/** One structured call. Throws on any API or parsing failure; callers degrade to their fallback. */
export async function complete(args: { task: Task; system: string; user: string; schema: object; model?: string }): Promise<unknown> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 30_000 });
  const message = await client.messages.create({
    model: args.model ?? models[args.task],
    max_tokens: 1024,
    system: args.system,
    messages: [{ role: "user", content: args.user }],
    output_config: { format: { type: "json_schema", schema: args.schema } },
  } as Parameters<typeof client.messages.create>[0]);
  const block = "content" in message ? message.content.find((item) => item.type === "text") : undefined;
  if (!block || block.type !== "text") throw new Error("the model returned no text");
  return JSON.parse(block.text);
}

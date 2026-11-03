/** A spoken teaching response must leave the listener with an actionable task.
 * This never grants progression or makes a model call. */
export function responsePrompt(reply: string, currentPrompt: string): string {
  if (reply.includes('?') || /\b(?:tell me|try saying|please (?:say|explain|work out))\b/i.test(reply)) return reply;
  const question = currentPrompt.match(/[^.!?]*\?/g)?.at(-1)?.trim() ?? currentPrompt.match(/(?:tell me|try saying|please (?:say|explain|work out))[^.!?]*/i)?.[0];
  return question ? `${reply.trim()} ${question}`.trim() : reply;
}

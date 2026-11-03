/** Checked prerequisite micro-content.
 *
 * When a learner is missing a foundation (multiplication inside an
 * equation step, say), the AI may choose an explain-prerequisite
 * move - but the teaching itself comes from here: small, checked,
 * Primary-5-worded content with a deterministic check question.
 * The model never invents the foundation, and the original lesson
 * state waits untouched on the learning-context stack. */

export interface Prerequisite {
  id: string;
  topic: string;
  /** Simple grounded explanation, one idea per line. */
  explanation: string[];
  /** Easier re-explanation if the check is missed once. */
  simpler: string[];
  check: { prompt: string; answer: number; teach: string };
}

export const MULTIPLICATION: Prerequisite = {
  id: 'multiplication',
  topic: 'multiplication',
  explanation: [
    'Let us pause the equation and think about multiplication itself. Multiplication is a quick way to add the same number again and again.',
    'Three times four means three groups of four. That is four plus four plus four. Count with me: four, eight, twelve. So three times four makes twelve.',
  ],
  simpler: [
    'Think of three bags, with four oranges in each bag. Count all the oranges: four, eight, twelve.',
    'Multiplying just counts equal groups quickly. Three groups of four oranges make twelve oranges.',
  ],
  check: {
    prompt: 'Let us check together: two times three means two groups of three. What does two times three make?',
    answer: 6,
    teach: 'Two groups of three make six: three plus three is six.',
  },
};

export const PREREQUISITES: Record<string, Prerequisite> = {
  multiplication: MULTIPLICATION,
};

/** Which prerequisite (if any) a topic word in context points to.
 * Topic identification comes from the orchestrator's move plus the
 * lesson context; this only maps an already-chosen topic to its
 * checked content. */
export function getPrerequisite(topic: string): Prerequisite | null {
  return PREREQUISITES[topic.toLowerCase()] ?? null;
}

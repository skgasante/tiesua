/** Resume the instruction interrupted by voice selection, without advancing it. */
export function voiceReturn(acknowledgement: string, instruction: string): string {
  const task = instruction.trim().replace(/^Welcome (?:back|once again)[.!]\s*/i, '');
  return `${acknowledgement} Back to where we were. ${task || 'Would you like to study, or hear how this platform works?'}`;
}

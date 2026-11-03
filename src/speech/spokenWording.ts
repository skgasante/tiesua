/** Keep the product name visual while using natural wording in spoken output. */
export function spokenWording(text: string): string {
  return text
    .replace(/\bI am TieSua\b/gi, 'I am your tutor')
    .replace(/\bTieSua['’]s\b/gi, "the app's")
    .replace(/\bTieSua\b/gi, 'this app');
}

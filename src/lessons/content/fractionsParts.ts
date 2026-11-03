import type { LessonDef } from '../catalogue';

/** Parts of a Whole - JHS 1 Fractions.
 * Objective: name the numerator and denominator and say what each counts. */
export const FRACTIONS_PARTS: LessonDef = {
  id: 'fractions-parts',
  level: 'Junior High 1',
  topic: 'Fractions',
  title: 'Parts of a Whole',
  objective: 'Name the numerator and denominator of a fraction and say what each one counts.',
  keywords: ['fraction', 'fractions', 'numerator', 'denominator', 'parts of a whole', 'part of a whole'],
  intro: [
    'A fraction tells us about equal parts of a whole.',
    'Imagine a chocolate bar split into equal pieces. A fraction can tell us how many pieces we have.' ,
  ],
  example: {
    expression: '2/4',
    steps: [
      { expression: '2/4', explanation: 'Imagine a chocolate bar split into four equal pieces. You have two of those pieces. We say two over four. Is that clear? You can ask a question or say continue.' },
      { expression: '2/4', explanation: 'In two over four, two counts the pieces we have. Two is the numerator, the number before over. Four counts all the equal pieces. Four is the denominator, the number after over. That finishes this example. Are you ready to practise, or do you have a question?' },
    ],
    explanation: [
      'Imagine a chocolate bar split into four equal pieces. You have two of those pieces.',
      'That is two over four: two pieces out of four equal pieces. The two is called the numerator; the four is called the denominator.',
    ],
  },
  simpler: [
    'Let us use the chocolate again. Break one bar into four equal pieces.',
    'In two over four, the number after over is four. It tells us how many equal pieces the bar was split into.',
    'The number before over is two. It tells us how many of those pieces we have.',
  ],
  clarifyHint: 'explains what the two numbers in a fraction mean',
  exampleCheck: {
    prompt: 'Quick check before we practise: if we cut the bar into six equal pieces instead, what number would come after over?',
    answer: 6,
    teach: 'The denominator counts all the equal pieces. Six pieces means six comes after over.',
  },
  kind: 'fractions',
  guidedItems: [
    { prompt: 'Here is three over five. Which number is the numerator? Say or type just the number.', answer: 3, teach: 'The numerator counts the parts we take. It is the number before over: in three over five, that is three.' },
    { prompt: 'Staying with three over five: which number is the denominator?', answer: 5, teach: 'The denominator counts all the equal parts. It is the number after over: in three over five, that is five.' },
    { prompt: 'New one: four over seven. What is the numerator?', answer: 4, teach: 'In four over seven, the numerator is four, the number before over.' },
  ],
  guidedExtraItems: [
    { prompt: 'Let us do one together: five over six. What is the numerator?', answer: 5, teach: 'In five over six, the numerator is five, the number before over.' },
    { prompt: 'And in five over six, what is the denominator?', answer: 6, teach: 'The denominator is six, the number after over. It counts all the equal parts.' },
  ],
  independentItems: [
    { prompt: 'Your turn, on your own: five over nine. What is the denominator?', answer: 9, teach: 'In five over nine, the denominator is nine, the number after over.' },
    { prompt: 'Six over eight. What is the numerator?', answer: 6, teach: 'In six over eight, the numerator is six, the number before over.' },
    { prompt: 'In two over four, into how many equal parts is the whole split?', answer: 4, teach: 'The denominator tells us: four equal parts.' },
    { prompt: 'Last one: seven over ten. What is the numerator?', answer: 7, teach: 'In seven over ten, the numerator is seven, the number before over.' },
  ],
  recap: 'You learned that the denominator counts the equal parts in the whole, and the numerator counts the parts we take.',
  nextId: 'equations-fraction',
};

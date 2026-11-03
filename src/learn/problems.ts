/** Ghana Junior High problem bank. Every entry stays inside the
 * parser/verifier grammar, carries its tested valid solution path
 * (also exercised against the backend in
 * backend/tests/test_problem_bank.py — keep the two in sync), its
 * expected complete solution, and the misconception it is chosen
 * to surface. Learners select problems in-app; nothing is scripted. */

export interface ProblemDef {
  id: string;
  title: string;
  topic: string;
  expression: string;
  solution: string;
  misconceptions: string[];
  validPath: string[];
}

export const PROBLEMS: ProblemDef[] = [
  {
    id: 'fraction-plus-three-fifths', title: 'A sum divided by five', topic: 'Fractions and brackets',
    expression: '(x+3)/5 = 4', solution: 'x = 17',
    misconceptions: ['Multiplying only one side by five', 'Forgetting to subtract three'],
    validPath: ['multiply both sides by five', 'x plus three equals twenty', 'x equals seventeen'],
  },
  {
    id: 'fraction-plus-one-thirds', title: 'A sum divided by three', topic: 'Fractions and brackets',
    expression: '(x+1)/3 = 5', solution: 'x = 14',
    misconceptions: ['Multiplying only one side by three', 'Forgetting to subtract one'],
    validPath: ['multiply both sides by three', 'x plus one equals fifteen', 'x equals fourteen'],
  },
  {
    id: 'fraction-sum-numerator', title: 'A sum divided by four', topic: 'Fractions and brackets',
    expression: '(x+2)/4 = 3', solution: 'x = 10',
    misconceptions: ['Reading (x+2)/4 as x + 2/4', 'Multiplying only one side by 4', 'Computing 3 × 4 as 7'],
    validPath: ['multiply both sides by four', 'x plus two equals twelve', 'x equals ten'],
  },
  {
    id: 'fraction-difference-numerator', title: 'A difference divided by two', topic: 'Fractions and brackets',
    expression: '(x-3)/2 = 5', solution: 'x = 13',
    misconceptions: ['Treating (x-3)/2 as x - 3/2', 'Forgetting the bracket when multiplying both sides by 2'],
    validPath: ['multiply both sides by two', 'x minus three equals ten', 'x equals thirteen'],
  },
  {
    id: 'add-unknown', title: 'Adding to the unknown', topic: 'One-step equations',
    expression: 'x+5 = 12', solution: 'x = 7',
    misconceptions: ['Adding 5 again instead of subtracting it', 'Answering with the sum 17'],
    validPath: ['subtract five from both sides', 'x equals seven'],
  },
  {
    id: 'multiply-unknown', title: 'Three times the unknown', topic: 'One-step equations',
    expression: '3x = 15', solution: 'x = 5',
    misconceptions: ['Subtracting 3 instead of dividing by 3', 'Dividing only the right side by 3'],
    validPath: ['divide both sides by three', 'x equals five'],
  },
  {
    id: 'subtract-unknown', title: 'Taking away from the unknown', topic: 'One-step equations',
    expression: 'x-4 = 9', solution: 'x = 13',
    misconceptions: ['Subtracting 4 again instead of adding it', 'Answering 9 - 4 = 5'],
    validPath: ['add four to both sides', 'x equals thirteen'],
  },
  {
    id: 'double-bracket', title: 'Double a bracket', topic: 'Brackets and multiplication',
    expression: '2(x+1) = 14', solution: 'x = 6',
    misconceptions: ['Multiplying only the x by 2 and not the 1', 'Dividing only one side by 2'],
    validPath: ['divide both sides by two', 'x plus one equals seven', 'x equals six'],
  },
  {
    id: 'two-steps', title: 'Two steps to the unknown', topic: 'Two-step equations',
    expression: '2x+3 = 11', solution: 'x = 4',
    misconceptions: ['Dividing by 2 before removing the +3', 'Removing 3 from one side only'],
    validPath: ['subtract three from both sides', '2x equals eight', 'divide both sides by two', 'x equals four'],
  },
  {
    id: 'fraction-sum-thirds', title: 'A sum divided by three', topic: 'Fractions and brackets',
    expression: '(x+6)/3 = 4', solution: 'x = 6',
    misconceptions: ['Reading (x+6)/3 as x + 6/3', 'Computing 4 × 3 as 7'],
    validPath: ['multiply both sides by three', 'x plus six equals twelve', 'x equals six'],
  },
];

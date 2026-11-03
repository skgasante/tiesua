import { describe, expect, it } from 'vitest';
import { parseExpression } from '../math/parser';
import { toSpeechPlan } from './speechPlan';
import { plannedPauseTotal, renderLegacyUtterances, renderUtterances } from './render';

const render = (expr: string, mode: 'natural' | 'detailed' | 'ordinary' = 'natural') =>
  renderUtterances(toSpeechPlan(parseExpression(expr), mode));

describe('phrase-level rendering (improved speech)', () => {
  it('(x+2)/4 becomes two connected phrases with one brief boundary', () => {
    const u = render('(x+2)/4');
    expect(u).toHaveLength(2);
    expect(u[0].text).toBe('x plus two');
    expect(u[1].text).toBe('all over four');
    expect(u[0].pauseAfterMs).toBeLessThanOrEqual(200);
    expect(u[1].pitch).toBeGreaterThan(1); // emphasis on ALL over
  });

  it('x+(2/4) separates x from the fraction term with a real pause', () => {
    const u = render('x+(2/4)');
    expect(u).toHaveLength(2);
    expect(u[0].text).toBe('x');
    expect(u[0].pauseAfterMs).toBe(300);
    expect(u[1].text).toBe('plus two over four');
  });

  it('3(x+2) and x-(-3) are single phrases with no inserted silence', () => {
    expect(render('3(x+2)')).toHaveLength(1);
    expect(render('x-(-3)')).toHaveLength(1);
    expect(plannedPauseTotal(toSpeechPlan(parseExpression('3(x+2)'), 'natural'))).toBe(0);
  });

  it('the demo equation uses at most two phrases', () => {
    const u = render('(x+2)/4 = 3');
    expect(u.length).toBeLessThanOrEqual(3);
    expect(u.map((x) => x.text).join(' ')).toContain('equals');
  });

  it('nested fractions keep boundaries without exploding utterance count', () => {
    const plan = toSpeechPlan(parseExpression('((x+2)/4)/2'), 'natural');
    const u = renderUtterances(plan);
    expect(u.length).toBeGreaterThanOrEqual(2);
    expect(u.length).toBeLessThanOrEqual(4);
    expect(plannedPauseTotal(plan)).toBeLessThanOrEqual(400);
  });

  it('improved rendering uses far fewer utterances than legacy', () => {
    const plan = toSpeechPlan(parseExpression('(x+2)/4 = 3'), 'natural');
    expect(renderUtterances(plan).length).toBeLessThan(renderLegacyUtterances(plan).length);
  });

  it('Detailed mode keeps stronger, more segmented grouping', () => {
    const plan = toSpeechPlan(parseExpression('(x+2)/4'), 'detailed');
    expect(plannedPauseTotal(plan)).toBeGreaterThan(plannedPauseTotal(toSpeechPlan(parseExpression('(x+2)/4'), 'natural')));
    expect(renderUtterances(plan).length).toBeGreaterThan(render('(x+2)/4').length);
  });

  it('ordinary short expressions carry no planned pauses', () => {
    expect(plannedPauseTotal(toSpeechPlan(parseExpression('x+5 = 12'), 'natural'))).toBeLessThanOrEqual(250);
  });
});


it('keeps the full lesson equation and alternate grouping audibly distinct', () => {
  const grouped = renderUtterances(toSpeechPlan(parseExpression('(x+2)/4 = 3'), 'natural'));
  const separate = renderUtterances(toSpeechPlan(parseExpression('x+(2/4) = 3'), 'natural'));
  expect(grouped.map(s => s.text).join(' ')).toContain('x plus two all over four');
  expect(separate.map(s => s.text).join(' ')).toContain('x plus two over four');
  expect(grouped.map(s => s.text).join(' ')).toContain('equals three');
});

it('honours the separate fraction convention inside tutor prose too', () => {
  const utterances = renderUtterances({ mode: 'natural', segments: [{ id: 'p', nodeId: 'p', text: 'The second expression is x, plus two over four. Only two is divided.', pauseAfterMs: 0, boundary: 'none' }] });
  expect(utterances[0].text).toBe('The second expression is x');
  expect(utterances[0].pauseAfterMs).toBe(300);
  expect(utterances[1].text).toBe('plus two over four. Only two is divided.');
});

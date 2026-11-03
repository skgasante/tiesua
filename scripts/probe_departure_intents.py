"""Owner-authorized Contributor model probes against the separate local backend.

Uses synthetic inputs only. The report contains model output, no credentials.
This evaluates decisions from the live endpoint, not the complete browser flow.
"""
import concurrent.futures
import json
from pathlib import Path
import httpx

SCENARIOS = [
    ('Could we do fractions instead?', 'switch'),
    ('I would rather learn about parts of a whole.', 'switch'),
    ('Please take me to the fractions lesson.', 'switch'),
    ('Can we switch to fractions now?', 'switch'),
    ('Let us leave equations and study parts of a whole.', 'switch'),
    ('I want to learn fractions instead of this.', 'switch'),
    ('Could you open Parts of a Whole for me?', 'switch'),
    ('I would like to change to the other lesson, Parts of a Whole.', 'switch'),
    ('Please move me to the lesson about parts of a whole.', 'switch'),
    ('I want a different topic. Can we do fractions?', 'switch'),
    ('Please take me home.', 'home'),
    ('I would like to go home now.', 'home'),
    ('Can we leave and go back to the home screen?', 'home'),
    ('Return me to the beginning of the app, please.', 'home'),
    ('I am ready to go to the home page.', 'home'),
    ('Take me back to Home, please.', 'home'),
    ('I want to leave this question and go home.', 'home'),
    ('Could we go back to the home screen instead?', 'home'),
    ('Do not take me home.', 'stay'),
    ("I don't want to switch to fractions.", 'stay'),
    ('Please keep me on this equation.', 'stay'),
    ('I am confused. Can you help with this problem?', 'stay'),
    ('I do not understand the division by three.', 'stay'),
    ('Give me a hint, but stay on this question.', 'stay'),
    ('What would happen if we went home?', 'stay'),
    ('What if I switched to fractions later?', 'stay'),
    ('Can you explain what going home would do?', 'stay'),
    ('Why would someone switch lessons?', 'stay'),
    ('If I left, would my answer count as complete?', 'stay'),
    ('What is a fraction? I am asking about this equation.', 'stay'),
]

CONTEXT = {
    'screen': 'lesson', 'lesson': 'equations-fraction', 'title': 'Solving Equations with a Fraction',
    'stage': 'guided', 'equation': '(x+6)/3 = 4', 'current_question': 'What step will you try first?',
    'verified_result': {'verdict': 'incomplete', 'solved': False, 'equation_now': '(x+6)/3 = 4'},
    'available_lessons': ['fractions-parts', 'equations-fraction'],
    'catalogue': [{'id': 'fractions-parts', 'title': 'Parts of a Whole'},
                  {'id': 'equations-fraction', 'title': 'Solving Equations with a Fraction'}],
}

def probe(case):
    utterance, expected = case
    try:
        response = httpx.post('http://127.0.0.1:8012/v1/orchestrate',
                              json={'text': utterance, 'context': CONTEXT}, timeout=25)
        response.raise_for_status()
        result = response.json()
        actions = result.get('actions') or []
        names = [action.get('name') for action in actions]
        departure = any(name in ('nav.goHome', 'nav.openLessons', 'nav.openLearn', 'lesson.openLesson',
                                 'lesson.morePractice', 'lesson.nextProblem', 'lesson.easierProblem', 'lesson.restart') for name in names)
        if expected == 'switch':
            ok = any(a.get('name') == 'lesson.openLesson' and str(a.get('args', {}).get('query', '')).lower() in
                     ('fractions', 'fraction', 'fractions-parts', 'parts of a whole') for a in actions)
        elif expected == 'home':
            ok = 'nav.goHome' in names
        else:
            ok = not departure and result.get('teachingMove') not in ('guided-example', 'independent-practice')
        return {'utterance': utterance, 'expected': expected, 'source': result.get('source'),
                'model': result.get('model'), 'actions': actions, 'move': result.get('teachingMove'),
                'reply': result.get('reply'), 'clarification': result.get('clarification'),
                'pass': bool(ok and result.get('source') == 'live-meta' and result.get('model') == 'muse-spark-1.3-contributor')}
    except Exception as exc:
        return {'utterance': utterance, 'expected': expected, 'pass': False, 'error': type(exc).__name__}

def main():
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        results = list(executor.map(probe, SCENARIOS))
    output = Path('docs/ORCHESTRATOR_DEPARTURE_PROBES_2026-10-30.json')
    output.write_text(json.dumps(results, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'{sum(r["pass"] for r in results)} of {len(results)} model decisions met expectations; report: {output}')
    for result in results:
        if not result['pass']:
            print(json.dumps(result, ensure_ascii=False))

if __name__ == '__main__':
    main()

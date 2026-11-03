"""Probe voice-selection decisions against the owner's Contributor backend."""
import json
from pathlib import Path
import httpx
from probe_settings_tutorial import throttle

CASES = [
    ('I like this voice.', 'keep'), ('This one sounds good to me.', 'keep'),
    ('Please keep the voice I just heard.', 'keep'), ('Yes, that is the one I want.', 'keep'),
    ('I am happy with this speaker.', 'keep'), ('This voice is clear; use it.', 'keep'),
    ('I do not like this voice.', 'next'), ('Can I hear a different one?', 'next'),
    ('Please try another voice.', 'next'), ('This one is not right for me.', 'next'),
    ('Go to the next speaker.', 'next'), ('Could you play the previous voice again?', 'previous'),
    ('Go back to the voice before this.', 'previous'), ('I preferred the last voice; go back.', 'previous'),
    ('Cancel voice selection.', 'cancel'), ('Stop choosing voices.', 'cancel'),
    ('I am not sure about this one.', 'uncertain'), ('I do not know which voice I prefer.', 'uncertain'),
    ('What is different about these voices?', 'uncertain'), ('Do not save this voice yet.', 'uncertain'),
]

def main():
    results = []
    for i, (utterance, expected) in enumerate(CASES):
        screen = ['home', 'lesson', 'explore', 'settings'][i % 4]
        context = {'screen': screen, 'voice_preview': {'active': True, 'index': 2, 'count': 4},
                   'current_question': 'Choose whether to keep this voice, try another, return to the previous voice, or cancel.',
                   'available_actions': ['speech.previewVoice keep', 'speech.previewVoice next', 'speech.previewVoice previous', 'speech.stop']}
        throttle()
        try:
            response = httpx.post('http://127.0.0.1:8012/v1/orchestrate', json={'text': utterance, 'context': context}, timeout=25)
            response.raise_for_status()
            data = response.json()
            actions = data.get('actions') or []
            if expected == 'uncertain':
                correct = not any(a.get('name') == 'speech.previewVoice' and a.get('args', {}).get('direction') == 'keep' for a in actions)
            elif expected == 'cancel':
                correct = len(actions) == 1 and actions[0].get('name') == 'speech.stop'
            else:
                correct = len(actions) == 1 and actions[0].get('name') == 'speech.previewVoice' and actions[0].get('args', {}).get('direction') == expected
            results.append({'utterance': utterance, 'expected': expected, 'screen': screen, 'source': data.get('source'), 'model': data.get('model'), 'actions': actions, 'reply': data.get('reply'), 'clarification': data.get('clarification'), 'pass': bool(correct and data.get('source') == 'live-meta' and data.get('model') == 'muse-spark-1.3-contributor')})
        except Exception as exc:
            results.append({'utterance': utterance, 'expected': expected, 'screen': screen, 'pass': False, 'error': type(exc).__name__})
        if (i + 1) % 5 == 0:
            print(f'Completed {i + 1}/{len(CASES)} voice-choice probes', flush=True)
    path = Path('docs/ORCHESTRATOR_VOICE_CHOICE_PROBES_2026-10-31.json')
    path.write_text(json.dumps(results, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'{sum(r["pass"] for r in results)}/{len(results)} met expectations; report: {path}', flush=True)
    for result in results:
        if not result['pass']:
            print(json.dumps(result, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    main()

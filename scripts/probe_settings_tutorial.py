"""Synthetic Contributor-model settings and tutorial probes.

Run only against the separately launched, current backend on port 8012.
Requests are rate-spaced; no API key is read or stored by this script.
The output is an evidence file of direct model decisions, not a UI test.
"""
from concurrent.futures import ThreadPoolExecutor
from itertools import cycle
from pathlib import Path
from threading import Lock
import json
import time
import httpx

GROUPS = {
    'rate_down': [
        'Could you speak a little more slowly?', 'Your voice is too quick for me.',
        'Please slow the way you are talking.', 'I need you to talk less fast.',
        'You are rushing; can you slow down?', 'Make your speaking speed slower.',
        'I cannot follow when you talk so fast.', 'Please lower the reading speed.',
        'Could you take a little more time with your words?', 'Slow your speech down a bit.',
    ],
    'rate_up': [
        'Please speak a little faster.', 'Can you read more quickly?',
        'Your voice is too slow for me.', 'Increase your speaking speed.',
        'Could you speed up a little?', 'Say things a bit quicker please.',
        'I can follow a faster voice.', 'Please raise the reading speed.',
        'Can you talk faster than this?', 'Speed up your speech a little.',
    ],
    'volume_up': [
        'Please make your voice louder.', 'I cannot hear you well; speak up.',
        'Could you increase the volume?', 'Your voice is too quiet.',
        'Turn up the sound a little.', 'Can you talk a bit louder?',
        'The speaking volume needs to be higher.', 'Raise your voice volume please.',
        'I can barely hear TieSua.', 'Please turn the voice volume up.',
    ],
    'volume_down': [
        'Please make your voice quieter.', 'The sound is too loud for me.',
        'Could you lower the volume?', 'Turn down the voice a little.',
        'Can you speak a bit more quietly?', 'Your voice volume is too high.',
        'Reduce the sound volume please.', 'Please turn the volume down.',
        'I need a softer volume, not a different voice.', 'Make the audio less loud.',
    ],
    'pause_up': [
        'Please pause longer between phrases.', 'Give me longer pauses when you read.',
        'Can you leave more time between phrases?', 'Increase the pauses in your speech.',
        'Take longer breaks between spoken parts.', 'I need longer pauses in the reading.',
        'Could your reading have more pauses?', 'Please increase the reading pauses.',
    ],
    'pause_down': [
        'Please shorten the pauses between phrases.', 'Do not pause so much when reading.',
        'Can you leave less time between phrases?', 'Decrease the pauses in your speech.',
        'The breaks between words are too long.', 'Please use shorter reading pauses.',
        'Could you pause less between the parts?', 'Reduce the long pauses in the reading.',
    ],
    'text_up': [
        'Make the writing bigger.', 'Please enlarge the text.',
        'Can the mathematics be displayed larger?', 'I need bigger writing.',
        'Increase the text size.', 'The writing is too small; make it larger.',
        'Could you make the letters bigger?', 'Please set the text to 150 percent.',
    ],
    'text_down': [
        'Make the writing smaller.', 'Please reduce the text size.',
        'The letters are too large; make them smaller.', 'Set the text back to standard size.',
        'Could you make the writing smaller?', 'Please set the text to 100 percent.',
        'I need smaller text on the screen.', 'Return the writing to its normal size.',
    ],
    'voice_preview': [
        'Can I try a different voice?', 'Please let me hear another voice.',
        'I would like a softer sounding voice.', 'Could we try a deeper voice?',
        'Show me another voice option.', 'I want to hear a different speaker.',
        'Can I sample a female sounding voice?', 'Please help me choose a different voice.',
    ],
    'no_change': [
        'Do not make your voice louder.', 'Please do not change the speed.',
        'I do not want a different voice.', 'Keep the writing size as it is.',
        'What happens if I make the text larger?', 'Can you explain what speech speed means?',
        'I was asking about volume, not asking you to change it.', 'Do not lower the volume.',
        'Would changing the voice restart my lesson?', 'I like the speed exactly as it is.',
    ],
}

TUTORIAL = [
    ('Could you say that once more?', 'tutorial_repeat', 'repeat'),
    ('I missed that. Please repeat it.', 'tutorial_repeat', 'repeat'),
    ('Would you read that again for me?', 'tutorial_repeat', 'repeat'),
    ('Please say the sample one more time.', 'tutorial_repeat', 'repeat'),
    ('Can you repeat the example?', 'tutorial_repeat', 'repeat'),
    ('I did not catch the example; say it again.', 'tutorial_repeat', 'repeat'),
    ('Could I have a bit more time?', 'tutorial_wait', 'controls'),
    ('Hang on a minute while I think.', 'tutorial_wait', 'controls'),
    ('Please wait; I need time to think.', 'tutorial_wait', 'controls'),
    ('Let me think for a little while.', 'tutorial_wait', 'controls'),
    ('I am still thinking, please wait.', 'tutorial_wait', 'controls'),
    ('Give me a moment to think.', 'tutorial_wait', 'controls'),
    ('Let us move on to the next part.', 'tutorial_next', 'controls'),
    ('I am ready to continue the tutorial.', 'tutorial_next', 'controls'),
    ('Please go to the next tutorial step.', 'tutorial_next', 'controls'),
    ('I would like to start studying now.', 'tutorial_study', 'choice'),
    ('Can we study a lesson instead?', 'tutorial_study', 'choice'),
    ('Please tell me which lessons I can learn.', 'tutorial_study', 'choice'),
    ('I do not want to continue the tutorial.', 'tutorial_exit', 'controls'),
    ('Please leave the tutorial.', 'tutorial_exit', 'controls'),
    ('How can I use the keyboard?', 'tutorial_question', 'controls'),
    ('What does the higher sound mean?', 'tutorial_question', 'controls'),
    ('Please do not start a lesson yet.', 'tutorial_question', 'controls'),
    ('What happens if I stop the microphone?', 'tutorial_question', 'controls'),
]

EXPECTED_ACTION = {
    'rate_down': 'speech.setRate', 'rate_up': 'speech.setRate',
    'volume_down': 'speech.setVolume', 'volume_up': 'speech.setVolume',
    'pause_down': 'speech.setPauses', 'pause_up': 'speech.setPauses',
    'text_down': 'display.setTextSize', 'text_up': 'display.setTextSize',
    'voice_preview': 'speech.previewVoice', 'tutorial_repeat': 'speech.repeatCurrent',
    'tutorial_wait': 'conversation.wait', 'tutorial_next': 'help.tutorialNext',
    'tutorial_study': 'help.offerLessons', 'tutorial_exit': 'help.tutorialExit',
}
SCREENS = cycle(['home', 'lesson', 'explore', 'settings'])
SCENARIOS = [(text, kind, next(SCREENS), None) for kind, values in GROUPS.items() for text in values]
SCENARIOS.extend((text, kind, 'home', stage) for text, kind, stage in TUTORIAL)
assert len(SCENARIOS) >= 100 and len({case[0] for case in SCENARIOS}) == len(SCENARIOS)

_lock = Lock()
_next_request = 0.0

def throttle():
    global _next_request
    with _lock:
        now = time.monotonic()
        delay = max(0.0, _next_request - now)
        _next_request = max(now, _next_request) + 2.6  # below the 30/minute endpoint limit
    if delay:
        time.sleep(delay)

def judge(result, kind, utterance):
    actions = result.get('actions') or []
    if utterance == 'What does the higher sound mean?':
        reply = (result.get('reply') or '').lower()
        return not actions and 'listen' in reply and not any(word in reply for word in ('went well', 'moved up', 'success'))
    if kind in ('no_change', 'tutorial_question'):
        return not actions and bool(result.get('reply') or result.get('clarification'))
    expected = EXPECTED_ACTION[kind]
    action = next((a for a in actions if a.get('name') == expected), None)
    if not action:
        return False
    args = action.get('args') or {}
    if kind in ('rate_down', 'volume_down', 'pause_down'):
        return args.get('delta', 0) < 0 or ('value' in args and args['value'] < {'rate_down': 1.15, 'volume_down': 0.7, 'pause_down': 1}[kind])
    if kind in ('rate_up', 'volume_up', 'pause_up'):
        return args.get('delta', 0) > 0 or ('value' in args and args['value'] > {'rate_up': 1.15, 'volume_up': 0.7, 'pause_up': 1}[kind])
    if kind == 'text_up': return args.get('value', 100) > 100
    if kind == 'text_down': return args.get('value', 200) < 150
    return True

def probe(case):
    utterance, kind, screen, stage = case
    context = {'screen': screen, 'settings': {'rate': 1.15, 'volume': .7, 'pauseScale': 1, 'textSize': 150},
               'current_question': 'What would you like to do next?'}
    if screen == 'lesson':
        context.update({'lesson': 'equations-fraction', 'stage': 'guided', 'equation': '(x+6)/3 = 4',
                        'verified_result': {'verdict': 'incomplete', 'solved': False, 'equation_now': '(x+6)/3 = 4'}})
    if stage:
        context.update({'tutorial': {'active': True, 'stage': stage, 'sample': 'Two over four means two of four equal parts.'},
                        'current_question': 'Would you like to try, ask a question, or move on?',
                        'available_actions': ['speech.repeatCurrent', 'conversation.wait', 'help.tutorialNext', 'help.tutorialExit', 'help.offerLessons']})
    throttle()
    try:
        response = httpx.post('http://127.0.0.1:8012/v1/orchestrate', json={'text': utterance, 'context': context}, timeout=25)
        response.raise_for_status()
        data = response.json()
        return {'utterance': utterance, 'category': kind, 'screen': screen, 'tutorial_stage': stage,
                'source': data.get('source'), 'model': data.get('model'), 'actions': data.get('actions'),
                'move': data.get('teachingMove'), 'reply': data.get('reply'), 'clarification': data.get('clarification'),
                'pass': bool(data.get('source') == 'live-meta' and data.get('model') == 'muse-spark-1.3-contributor' and judge(data, kind, utterance))}
    except Exception as exc:
        return {'utterance': utterance, 'category': kind, 'screen': screen, 'pass': False, 'error': type(exc).__name__}

def main():
    output = Path('docs/ORCHESTRATOR_SETTINGS_TUTORIAL_PROBES_2026-10-31.json')
    results = []
    with ThreadPoolExecutor(max_workers=3) as pool:
        for result in pool.map(probe, SCENARIOS):
            results.append(result)
            if len(results) % 10 == 0:
                print(f'Completed {len(results)}/{len(SCENARIOS)} probes', flush=True)
    output.write_text(json.dumps(results, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'{sum(r["pass"] for r in results)} of {len(results)} decisions met expectations. Report: {output}', flush=True)
    for result in results:
        if not result['pass']:
            print(json.dumps(result, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    main()

import { CATALOGUE_DISPLAY } from '../lessons/catalogue';
import { useEffect, useState, type ReactNode } from 'react';
import type { Progress } from '../lessons/progress';
import '../design/minimal.css';

interface Props {
  progress: Progress;
  onOpenLesson: (id: string) => void;
  conversationControls?: ReactNode;
}

/** Quiet lesson catalogue: Level -> Topic -> Lesson. Only genuinely
 * implemented lessons can be started; the rest is honestly marked. */
export function Lessons({ onOpenLesson, conversationControls }: Props) {
  const [showUpcoming, setShowUpcoming] = useState(false);
  useEffect(() => { const workspace = document.getElementById('main'); if (workspace) workspace.scrollTop = 0; }, [showUpcoming]);
  return (
    <section aria-labelledby="lessons-heading">
      {!showUpcoming ? <>
      {conversationControls}
      <h1 id="lessons-heading" className="mn-title">What would you like to learn?</h1>
      <p className="lessons-intro">Tell TieSua what you want to learn, or choose a lesson.</p>
      <ul className="ready-lessons" aria-label="Available lessons">
        {CATALOGUE_DISPLAY.flatMap((level) => level.topics.flatMap((topic) => topic.lessons.filter((item) => item.lessonId).map((item) => ({item, topic})))).map(({item, topic}, index) => (
          <li key={item.lessonId}>
            <span className="ready-lesson-number" aria-hidden="true">{index + 1}</span>
            <button type="button" className="ready-lesson" onClick={() => onOpenLesson(item.lessonId!)}>
              <span className="ready-lesson-symbol" aria-hidden="true">{topic.topic === 'Fractions' ? '½' : 'x ÷ 4'}</span>
              <span className="ready-lesson-copy"><strong>{item.title}</strong><span>{topic.topic === 'Fractions' ? 'Understand fractions as parts of a whole.' : 'Learn how to solve equations that include fractions.'}</span></span>
              <span aria-hidden="true" className="ready-lesson-arrow">›</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="upcoming-link" onClick={() => setShowUpcoming(true)}>See upcoming lessons</button>
      </> : <section className="future-lessons" aria-labelledby="lessons-heading">
      <div className="sound-lab-toolbar"><button type="button" className="btn" onClick={() => setShowUpcoming(false)}>Back to lessons</button>{conversationControls}</div>
      <h1 id="lessons-heading">Coming soon</h1>
      <p className="lessons-intro">These lessons are not available yet.</p>
      {CATALOGUE_DISPLAY.map((lvl) => (
        <section key={lvl.level} className="mn-level" aria-label={lvl.level}>
          <h2 className="mn-level-name">{lvl.level}</h2>
          {lvl.topics.map((t) => (
            <ul key={t.topic} className="upcoming-list" aria-label={t.topic}>
              {t.lessons.filter((l) => !l.lessonId).map((l) => <li key={l.title} className="upcoming-row"><span>{l.title}</span><span className="upcoming-topic">{t.topic}</span></li>)}
            </ul>
          ))}
        </section>
      ))}
      </section>}
    </section>
  );
}

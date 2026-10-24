'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_WINDOW = 10;
const RE_ARM_CHOICES = [10, 20, 30];

// armed    — counting down, a step detonates it
// blown    — stepped on while armed
// safe     — the window ran out, the mine disengaged itself
// idle     — never armed yet
const IDLE = 'idle';
const ARMED = 'armed';
const BLOWN = 'blown';
const SAFE = 'safe';

export default function Mine() {
  const [phase, setPhase] = useState(IDLE);
  const [windowLength, setWindowLength] = useState(DEFAULT_WINDOW);
  const [remaining, setRemaining] = useState(DEFAULT_WINDOW);
  const [log, setLog] = useState([]);
  const [stepping, setStepping] = useState(false);

  // Counting down from a wall-clock deadline rather than decrementing a
  // counter: a background tab throttles timers, and a decrementing counter
  // would silently run long.
  const deadlineRef = useRef(null);

  const record = useCallback((text, kind) => {
    setLog((entries) =>
      [{ id: Date.now() + Math.random(), text, kind, at: new Date() }, ...entries].slice(0, 6)
    );
  }, []);

  const arm = useCallback(
    (seconds) => {
      setWindowLength(seconds);
      setRemaining(seconds);
      deadlineRef.current = Date.now() + seconds * 1000;
      setPhase(ARMED);
      record(`Armed for ${seconds}s.`, 'arm');
    },
    [record]
  );

  // Push the deadline out while the mine is still live. The window length grows
  // with it so the dial still reads as a fraction of the whole armed period.
  const extend = useCallback(
    (seconds) => {
      if (deadlineRef.current === null) return;
      deadlineRef.current += seconds * 1000;
      setWindowLength((w) => w + seconds);
      setRemaining(Math.max(0, deadlineRef.current - Date.now()) / 1000);
      record(`Extended by ${seconds}s.`, 'arm');
    },
    [record]
  );

  // Operator stands the mine down before the window runs out.
  const disengage = useCallback(() => {
    const left = Math.max(0, deadlineRef.current - Date.now()) / 1000;
    deadlineRef.current = null;
    setRemaining(0);
    setPhase(SAFE);
    record(`Disengaged manually with ${left.toFixed(1)}s left.`, 'safe');
  }, [record]);

  useEffect(() => {
    if (phase !== ARMED) return undefined;

    const tick = () => {
      const left = Math.max(0, deadlineRef.current - Date.now());
      setRemaining(left / 1000);

      if (left === 0) {
        setPhase(SAFE);
        record('Window elapsed. Mine disengaged.', 'safe');
      }
    };

    // 100ms keeps the dial motion smooth without being wasteful.
    const id = setInterval(tick, 100);
    tick();
    return () => clearInterval(id);
  }, [phase, record]);

  function step() {
    if (phase !== ARMED) {
      // Stepping on a disengaged mine is the whole point of disengaging it.
      setStepping(true);
      setTimeout(() => setStepping(false), 400);
      if (phase === SAFE) record('Stepped on — nothing happened. It is safe.', 'safe');
      return;
    }

    const elapsed = windowLength - remaining;
    setPhase(BLOWN);
    record(`Stepped on at ${elapsed.toFixed(1)}s — detonated.`, 'blown');
  }

  function reset() {
    deadlineRef.current = null;
    setRemaining(DEFAULT_WINDOW);
    setPhase(IDLE);
    setLog([]);
  }

  const seconds = Math.ceil(remaining);
  const progress = phase === ARMED ? remaining / windowLength : phase === IDLE ? 1 : 0;
  const urgent = phase === ARMED && remaining <= 3;

  return (
    <main className="shell mine-shell">
      <header className="masthead">
        <h1>SD time</h1>
        <Link href="/" className="backlink">
          ← Block console
        </Link>
      </header>

      <div className="mine-layout">
        <section className={`field-area phase-${phase} ${urgent ? 'urgent' : ''}`}>
          <div className="status-line">
            <span className={`lamp ${phase}`} aria-hidden="true" />
            <span className="status-text">
              {phase === ARMED && 'Armed — live'}
              {phase === BLOWN && 'Detonated'}
              {phase === SAFE && 'Disengaged — safe'}
              {phase === IDLE && 'Inert — not armed'}
            </span>
            {phase === ARMED && (
              <span className="countdown" aria-live="off">
                {seconds}s
              </span>
            )}
          </div>

          <div className="ground">
            <button
              type="button"
              className={`mine phase-${phase} ${stepping ? 'nudge' : ''}`}
              onClick={step}
              aria-label={
                phase === ARMED
                  ? `Mine is armed, ${seconds} seconds remaining. Step on it to detonate.`
                  : 'Step on the mine'
              }
            >
              <Dial progress={progress} phase={phase} />
              <span className="mine-face">
                {phase === BLOWN ? 'BLAST' : phase === ARMED ? seconds : phase === SAFE ? 'SAFE' : '—'}
              </span>
            </button>

            {phase === BLOWN && <span className="shock" aria-hidden="true" />}
            <div className="ground-line" aria-hidden="true" />
          </div>

          <p className="prompt" role="status">
            {phase === IDLE && 'Arm the mine to begin. Once armed, stepping on it within the window detonates it.'}
            {phase === ARMED && 'Live. Step on it and it detonates. Add time, disengage it, or wait the window out.'}
            {phase === BLOWN && 'It detonated. Reset to lay a fresh mine.'}
            {phase === SAFE && 'The mine is disengaged. Stepping on it now does nothing.'}
          </p>
        </section>

        <aside className="mine-rail">
          <div className="panel">
            <h2>Control</h2>

            {phase === IDLE && (
              <>
                <p className="hint">Set the live window and arm it.</p>
                <div className="choice-row">
                  {RE_ARM_CHOICES.map((s) => (
                    <button key={s} type="button" className="choice" onClick={() => arm(s)}>
                      {s}s
                    </button>
                  ))}
                </div>
              </>
            )}

            {phase === ARMED && (
              <>
                <p className="hint">
                  Counting down from {windowLength}s. It disengages on its own at zero.
                </p>
                <button type="button" className="action danger-action" onClick={step}>
                  Step on it
                </button>

                <p className="hint">Add time to the live window:</p>
                <div className="choice-row">
                  {RE_ARM_CHOICES.map((s) => (
                    <button key={s} type="button" className="choice" onClick={() => extend(s)}>
                      +{s}s
                    </button>
                  ))}
                </div>

                <button type="button" className="action quiet" onClick={disengage}>
                  Disengage now
                </button>
              </>
            )}

            {phase === SAFE && (
              <>
                <p className="hint">Disengaged and safe. Arm it again:</p>
                <div className="choice-row">
                  {RE_ARM_CHOICES.map((s) => (
                    <button key={s} type="button" className="choice" onClick={() => arm(s)}>
                      +{s}s
                    </button>
                  ))}
                </div>
                <button type="button" className="action quiet" onClick={reset}>
                  Reset
                </button>
              </>
            )}

            {phase === BLOWN && (
              <>
                <p className="hint">The mine is spent.</p>
                <button type="button" className="action" onClick={() => arm(DEFAULT_WINDOW)}>
                  Lay a new mine
                </button>
                <button type="button" className="action quiet" onClick={reset}>
                  Reset
                </button>
              </>
            )}
          </div>

          <div className="panel">
            <h2>Event log</h2>
            {log.length === 0 ? (
              <p className="hint">Nothing yet.</p>
            ) : (
              <ul className="mine-log">
                {log.map((e) => (
                  <li key={e.id} className={e.kind}>
                    <span className="mono">
                      {e.at.toLocaleTimeString([], { hour12: false })}
                    </span>
                    {e.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

/** Ring that drains as the window runs out. */
function Dial({ progress, phase }) {
  const r = 54;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(1, progress)));

  return (
    <svg className="dial" viewBox="0 0 128 128" aria-hidden="true">
      <circle className="dial-track" cx="64" cy="64" r={r} />
      {phase === 'armed' && (
        <circle
          className="dial-fill"
          cx="64"
          cy="64"
          r={r}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      )}
    </svg>
  );
}

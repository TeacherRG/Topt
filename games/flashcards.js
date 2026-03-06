/**
 * Flashcards mini-game
 *
 * Data contract (from chNN.json):
 *   chapters: Array<{ number, theme, grammar: { examples: Array<{de, ru}> } }>
 *
 * Usage:
 *   import { startFlashcards } from './games/flashcards.js';
 *   const stop = startFlashcards(containerEl, chaptersArray, { onClose });
 *   // call stop() to clear the timer externally if needed
 */

// ── Constants ──────────────────────────────────────────────────────────────

const TOTAL_TIME      = 60;  // seconds per round
const BONUS_CORRECT   =  3;  // seconds added on correct answer
const NEXT_DELAY      = 1300; // ms before advancing to next card
const MIN_DECK_SIZE   =  4;  // need at least 4 unique answers for options
const CSS_ID          = 'fc-game-styles';

// ── Utilities ──────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Data extraction ────────────────────────────────────────────────────────

/**
 * Builds a flat array of flash cards from chapters.
 * Each card: { q: string, a: string, label: string }
 * Direction is always de → ru (easiest starting point).
 */
function buildDeck(chapters) {
  const cards = [];
  for (const ch of chapters) {
    for (const ex of (ch.grammar?.examples ?? [])) {
      if (!ex.de || !ex.ru) continue;
      // Skip placeholder entries that start with '('
      if (ex.de.startsWith('(') || ex.ru === '') continue;
      cards.push({ q: ex.de, a: ex.ru, label: `Гл. ${ch.number}` });
    }
  }
  return cards;
}

/**
 * Returns 4 shuffled options: 1 correct + 3 random wrong answers.
 * Guarantees no duplicates.
 */
function buildOptions(deck, correctIdx) {
  const correct = deck[correctIdx].a;
  const pool = deck.filter((_, i) => i !== correctIdx && _.a !== correct);
  const wrong = shuffle(pool).slice(0, 3).map(c => c.a);
  return shuffle([correct, ...wrong]);
}

// ── CSS injection ──────────────────────────────────────────────────────────

function injectCSS() {
  if (document.getElementById(CSS_ID)) return;
  const style = document.createElement('style');
  style.id = CSS_ID;
  style.textContent = `
    .fc-game {
      display: flex;
      flex-direction: column;
      gap: 18px;
      padding: 16px 0 32px;
      max-width: 600px;
      margin: 0 auto;
    }

    /* top bar */
    .fc-top {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .fc-close {
      background: none;
      border: 1.5px solid var(--paper-dark, #e0d8c8);
      border-radius: 7px;
      width: 34px; height: 34px;
      cursor: pointer;
      font-size: .9rem;
      color: var(--ink, #1a1208);
      flex-shrink: 0;
      transition: background .15s;
    }
    .fc-close:hover { background: var(--paper-dark, #e0d8c8); }
    .fc-score-lbl {
      font-family: 'IBM Plex Mono', monospace;
      font-size: .82rem;
      color: var(--sage, #4a6741);
      flex-shrink: 0;
    }
    .fc-timer-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
    }
    .fc-timer-bar {
      flex: 1;
      height: 7px;
      background: var(--paper-dark, #e0d8c8);
      border-radius: 4px;
      overflow: hidden;
    }
    .fc-timer-fill {
      height: 100%;
      background: var(--gold, #c8922a);
      border-radius: 4px;
      transition: width .95s linear, background .3s;
    }
    .fc-timer-fill.urgent { background: var(--rust, #8b3a2a); }
    .fc-time-lbl {
      font-family: 'IBM Plex Mono', monospace;
      font-size: .78rem;
      color: var(--gold, #c8922a);
      min-width: 26px;
      text-align: right;
    }

    /* card */
    .fc-card-wrap {
      background: #fff;
      border-radius: 14px;
      padding: 30px 28px;
      box-shadow: 0 2px 12px rgba(26,18,8,.1);
      text-align: center;
    }
    .fc-card-label {
      font-family: 'IBM Plex Mono', monospace;
      font-size: .68rem;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      color: var(--gold, #c8922a);
      margin-bottom: 14px;
    }
    .fc-card-q {
      font-family: 'Playfair Display', serif;
      font-size: 1.45rem;
      line-height: 1.55;
      color: var(--ink, #1a1208);
    }

    /* options */
    .fc-opts {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 9px;
    }
    .fc-opt-btn {
      padding: 13px 10px;
      border: 2px solid var(--paper-dark, #e0d8c8);
      border-radius: 9px;
      background: #fff;
      font-family: 'IBM Plex Sans', sans-serif;
      font-size: .9rem;
      line-height: 1.4;
      cursor: pointer;
      transition: border-color .15s, background .15s, transform .1s;
      color: var(--ink, #1a1208);
    }
    .fc-opt-btn:hover:not(:disabled) {
      border-color: var(--gold, #c8922a);
      transform: translateY(-1px);
    }
    .fc-opt-btn:disabled { cursor: default; }
    .fc-opt-btn.fc-correct {
      border-color: var(--sage, #4a6741);
      background: rgba(74,103,65,.1);
      color: var(--sage, #4a6741);
      font-weight: 600;
    }
    .fc-opt-btn.fc-wrong {
      border-color: var(--rust, #8b3a2a);
      background: rgba(139,58,42,.08);
      color: var(--rust, #8b3a2a);
    }
    .fc-opt-btn.fc-dim { opacity: .35; }

    /* finish screen */
    .fc-finish, .fc-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 55vh;
      gap: 10px;
      text-align: center;
      padding: 24px;
    }
    .fc-finish-icon { font-size: 3rem; }
    .fc-finish-title {
      font-family: 'Playfair Display', serif;
      font-size: 1.6rem;
      color: var(--ink, #1a1208);
    }
    .fc-finish-score {
      font-family: 'Playfair Display', serif;
      font-size: 3.5rem;
      color: var(--gold, #c8922a);
      line-height: 1;
      margin: 4px 0;
    }
    .fc-finish-sub {
      font-size: .88rem;
      opacity: .6;
      margin-bottom: 10px;
    }
    .fc-finish-primary {
      padding: 12px 32px;
      border: none;
      border-radius: 9px;
      background: var(--ink, #1a1208);
      color: #f5f0e8;
      font-family: 'IBM Plex Sans', sans-serif;
      font-size: .94rem;
      cursor: pointer;
      width: 100%;
      max-width: 280px;
      transition: background .15s;
    }
    .fc-finish-primary:hover { background: #2e2010; }
    .fc-finish-sec {
      padding: 10px 28px;
      border: 2px solid var(--ink, #1a1208);
      border-radius: 9px;
      background: transparent;
      font-family: 'IBM Plex Sans', sans-serif;
      font-size: .9rem;
      cursor: pointer;
      width: 100%;
      max-width: 280px;
      color: var(--ink, #1a1208);
      transition: background .15s;
    }
    .fc-finish-sec:hover { background: var(--paper-dark, #e0d8c8); }
  `;
  document.head.appendChild(style);
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * @param {HTMLElement} container  - Where to render the game
 * @param {Array}       chapters   - Array of chapter data objects (chNN.json format)
 * @param {Object}      [opts]
 * @param {Function}    [opts.onClose] - Called with final score when game ends/closed
 * @returns {Function} cleanup — call to stop the timer externally
 */
export function startFlashcards(container, chapters, { onClose } = {}) {
  injectCSS();

  const fullDeck = buildDeck(chapters);
  if (fullDeck.length < MIN_DECK_SIZE) {
    container.innerHTML = `<div class="fc-empty">
      <p>Недостаточно данных для игры.<br>Пройдите хотя бы 2 главы.</p>
    </div>`;
    return () => {};
  }

  // ── Game state ─────────────────────────────────────────────────────────
  let deck      = shuffle([...fullDeck]);
  let idx       = 0;
  let score     = 0;
  let timeLeft  = TOTAL_TIME;
  let answered  = false;
  let timerId   = null;

  // ── Timer ──────────────────────────────────────────────────────────────
  function tick() {
    timeLeft--;
    const fill = container.querySelector('.fc-timer-fill');
    const lbl  = container.querySelector('.fc-time-lbl');
    if (fill) {
      fill.style.width = `${Math.max(0, timeLeft / TOTAL_TIME * 100)}%`;
      if (timeLeft <= 10) fill.classList.add('urgent');
    }
    if (lbl) lbl.textContent = `${timeLeft}с`;
    if (timeLeft <= 0) finish();
  }

  // ── Card render ────────────────────────────────────────────────────────
  function renderCard() {
    // Reshuffle when deck exhausted (endless loop)
    if (idx >= deck.length) {
      deck = shuffle([...fullDeck]);
      idx = 0;
    }

    const card    = deck[idx];
    const options = buildOptions(deck, idx);
    const pct     = Math.max(0, timeLeft / TOTAL_TIME * 100);

    container.innerHTML = `
      <div class="fc-game">
        <div class="fc-top">
          <button class="fc-close" title="Закрыть">✕</button>
          <span class="fc-score-lbl">✓ <strong>${score}</strong></span>
          <div class="fc-timer-wrap">
            <div class="fc-timer-bar">
              <div class="fc-timer-fill ${timeLeft <= 10 ? 'urgent' : ''}"
                   style="width:${pct}%"></div>
            </div>
            <span class="fc-time-lbl">${timeLeft}с</span>
          </div>
        </div>

        <div class="fc-card-wrap">
          <div class="fc-card-label">${esc(card.label)} · de → ru</div>
          <div class="fc-card-q">${esc(card.q)}</div>
        </div>

        <div class="fc-opts">
          ${options.map(o =>
            `<button class="fc-opt-btn" data-v="${esc(o)}">${esc(o)}</button>`
          ).join('')}
        </div>
      </div>`;

    // Events
    container.querySelector('.fc-close').addEventListener('click', () => {
      clearInterval(timerId);
      onClose && onClose(score);
    });

    container.querySelectorAll('.fc-opt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (answered) return;
        answered = true;

        const correct = btn.dataset.v === card.a;
        if (correct) {
          score++;
          timeLeft = Math.min(timeLeft + BONUS_CORRECT, TOTAL_TIME);
          btn.classList.add('fc-correct');
        } else {
          btn.classList.add('fc-wrong');
          container.querySelectorAll('.fc-opt-btn').forEach(b => {
            if (b.dataset.v === card.a) b.classList.add('fc-correct');
            else if (b !== btn) b.classList.add('fc-dim');
          });
        }
        container.querySelectorAll('.fc-opt-btn').forEach(b => (b.disabled = true));

        setTimeout(() => {
          idx++;
          answered = false;
          renderCard();
        }, NEXT_DELAY);
      });
    });
  }

  // ── Finish screen ──────────────────────────────────────────────────────
  function finish() {
    clearInterval(timerId);
    container.innerHTML = `
      <div class="fc-finish">
        <div class="fc-finish-icon">🏆</div>
        <div class="fc-finish-title">Время вышло!</div>
        <div class="fc-finish-score">${score}</div>
        <div class="fc-finish-sub">правильных ответов</div>
        <button class="fc-finish-primary" id="fc-restart">Сыграть ещё</button>
        <button class="fc-finish-sec" id="fc-done">Закрыть</button>
      </div>`;
    container.querySelector('#fc-restart').addEventListener('click', () =>
      startFlashcards(container, chapters, { onClose }));
    container.querySelector('#fc-done').addEventListener('click', () =>
      onClose && onClose(score));
  }

  // ── Start ──────────────────────────────────────────────────────────────
  renderCard();
  timerId = setInterval(tick, 1000);

  return () => clearInterval(timerId); // external cleanup handle
}

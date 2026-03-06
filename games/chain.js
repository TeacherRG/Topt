/**
 * Chain mini-game — answer questions in a row without a single mistake.
 *
 * Data contract (from chNN.json):
 *   chapters: Array<{
 *     number, theme,
 *     exercises: Array<{
 *       type: 'fill' | 'classify' | 'translate',
 *       question: string,
 *       answer: string,
 *       options?: string[],   // only for classify
 *       hint: string
 *     }>
 *   }>
 *
 * Usage:
 *   import { startChain } from './games/chain.js';
 *   startChain(containerEl, chaptersArray, { onClose });
 */

// ── Constants ──────────────────────────────────────────────────────────────

const BEST_KEY      = 'wad_chain_best';
const NEXT_DELAY    = 900;   // ms of green flash before next question
const CSS_ID        = 'ch-game-styles';

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

/** Normalises a free-text answer for comparison */
function normalize(s) {
  return String(s)
    .toLowerCase()
    .replace(/[.,!?;:„"«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function saveBest(v) {
  try { localStorage.setItem(BEST_KEY, String(v)); } catch (_) {}
}
function loadBest() {
  try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10); } catch (_) { return 0; }
}

// ── Data extraction ────────────────────────────────────────────────────────

/**
 * Flattens all exercises from all chapters into one pool.
 * Skips placeholder exercises (answer === '*').
 */
function buildPool(chapters) {
  const pool = [];
  for (const ch of chapters) {
    for (const ex of (ch.exercises ?? [])) {
      if (!ex.question || !ex.answer || ex.answer === '*') continue;
      pool.push({ ...ex, chNum: ch.number, chTheme: ch.theme });
    }
  }
  return pool;
}

// ── CSS injection ──────────────────────────────────────────────────────────

function injectCSS() {
  if (document.getElementById(CSS_ID)) return;
  const style = document.createElement('style');
  style.id = CSS_ID;
  style.textContent = `
    .ch-game {
      display: flex;
      flex-direction: column;
      gap: 18px;
      padding: 16px 0 32px;
      max-width: 600px;
      margin: 0 auto;
      position: relative;
    }

    /* top bar */
    .ch-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .ch-close {
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
    .ch-close:hover { background: var(--paper-dark, #e0d8c8); }
    .ch-streaks {
      display: flex;
      gap: 14px;
      align-items: center;
    }
    .ch-streak {
      font-family: 'Playfair Display', serif;
      font-size: 1.3rem;
      color: var(--ink, #1a1208);
    }
    .ch-best {
      font-family: 'IBM Plex Mono', monospace;
      font-size: .75rem;
      color: var(--gold, #c8922a);
    }

    /* question card */
    .ch-from {
      font-family: 'IBM Plex Mono', monospace;
      font-size: .68rem;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      color: var(--gold, #c8922a);
    }
    .ch-question {
      background: #fff;
      border-radius: 13px;
      padding: 24px 22px;
      box-shadow: 0 2px 10px rgba(26,18,8,.09);
      font-family: 'Playfair Display', serif;
      font-size: 1.1rem;
      line-height: 1.65;
      color: var(--ink, #1a1208);
    }

    /* classify options */
    .ch-opts {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 9px;
    }
    .ch-opt-btn {
      padding: 12px 8px;
      border: 2px solid var(--paper-dark, #e0d8c8);
      border-radius: 9px;
      background: #fff;
      font-family: 'IBM Plex Sans', sans-serif;
      font-size: .93rem;
      cursor: pointer;
      transition: border-color .15s, transform .1s;
      color: var(--ink, #1a1208);
    }
    .ch-opt-btn:hover:not(:disabled) {
      border-color: var(--gold, #c8922a);
      transform: translateY(-1px);
    }
    .ch-opt-btn:disabled { cursor: default; }
    .ch-opt-btn.ch-correct {
      border-color: var(--sage, #4a6741);
      background: rgba(74,103,65,.1);
      color: var(--sage, #4a6741);
      font-weight: 600;
    }
    .ch-opt-btn.ch-wrong {
      border-color: var(--rust, #8b3a2a);
      background: rgba(139,58,42,.08);
      color: var(--rust, #8b3a2a);
    }

    /* text input */
    .ch-input-row {
      display: flex;
      gap: 9px;
    }
    .ch-input {
      flex: 1;
      padding: 12px 15px;
      border: 2px solid var(--paper-dark, #e0d8c8);
      border-radius: 9px;
      font-family: 'IBM Plex Sans', sans-serif;
      font-size: .96rem;
      background: #fff;
      color: var(--ink, #1a1208);
      transition: border-color .15s;
    }
    .ch-input:focus { outline: none; border-color: var(--gold, #c8922a); }
    .ch-input.ch-correct { border-color: var(--sage, #4a6741); background: rgba(74,103,65,.04); }
    .ch-input.ch-wrong   { border-color: var(--rust, #8b3a2a); background: rgba(139,58,42,.04); }
    .ch-check-btn {
      padding: 12px 20px;
      border: none;
      border-radius: 9px;
      background: var(--ink, #1a1208);
      color: #f5f0e8;
      font-family: 'IBM Plex Sans', sans-serif;
      font-size: .9rem;
      cursor: pointer;
      flex-shrink: 0;
      transition: background .15s;
    }
    .ch-check-btn:hover { background: #2e2010; }

    /* inline feedback toast */
    .ch-fb {
      position: absolute;
      top: 56px;
      left: 50%;
      transform: translateX(-50%);
      padding: 9px 22px;
      border-radius: 30px;
      font-family: 'IBM Plex Sans', sans-serif;
      font-size: .88rem;
      font-weight: 500;
      pointer-events: none;
      animation: ch-pop .2s ease;
      white-space: nowrap;
      z-index: 10;
    }
    .ch-fb-ok  { background: var(--sage, #4a6741); color: #fff; }
    .ch-fb-err { background: var(--rust, #8b3a2a); color: #fff; }
    @keyframes ch-pop {
      from { transform: translateX(-50%) scale(.85); opacity: 0; }
      to   { transform: translateX(-50%) scale(1);   opacity: 1; }
    }

    /* break / empty / finish screens */
    .ch-break, .ch-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 55vh;
      gap: 10px;
      text-align: center;
      padding: 24px;
    }
    .ch-break-icon { font-size: 3rem; }
    .ch-break-title {
      font-family: 'Playfair Display', serif;
      font-size: 1.65rem;
      color: var(--ink, #1a1208);
    }
    .ch-break-score {
      font-family: 'Playfair Display', serif;
      font-size: 3.5rem;
      color: var(--gold, #c8922a);
      line-height: 1;
      margin: 4px 0;
    }
    .ch-break-sub {
      font-size: .88rem;
      opacity: .6;
    }
    .ch-break-record {
      font-family: 'IBM Plex Mono', monospace;
      font-size: .78rem;
      padding: 6px 14px;
      border-radius: 20px;
      margin: 4px 0 8px;
    }
    .ch-break-record.new-record {
      background: rgba(200,146,42,.15);
      color: var(--gold, #c8922a);
    }
    .ch-break-record.old-record {
      color: var(--sage, #4a6741);
    }
    .ch-break-answer {
      font-size: .84rem;
      background: var(--paper-dark, #e0d8c8);
      border-radius: 8px;
      padding: 9px 16px;
      margin: 4px 0 10px;
      max-width: 340px;
    }
    .ch-finish-primary {
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
    .ch-finish-primary:hover { background: #2e2010; }
    .ch-finish-sec {
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
    .ch-finish-sec:hover { background: var(--paper-dark, #e0d8c8); }
  `;
  document.head.appendChild(style);
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * @param {HTMLElement} container  - Where to render the game
 * @param {Array}       chapters   - Array of chapter data objects (chNN.json format)
 * @param {Object}      [opts]
 * @param {Function}    [opts.onClose] - Called when the player exits
 * @returns {Function} cleanup (no-op here, but keeps API consistent)
 */
export function startChain(container, chapters, { onClose } = {}) {
  injectCSS();

  const fullPool = buildPool(chapters);
  if (fullPool.length < 3) {
    container.innerHTML = `<div class="ch-empty">
      <p>Недостаточно упражнений.<br>Пройдите хотя бы 2 главы.</p>
    </div>`;
    return () => {};
  }

  // ── Game state ─────────────────────────────────────────────────────────
  let pool     = shuffle([...fullPool]);
  let idx      = 0;
  let streak   = 0;
  let best     = loadBest();
  let answered = false;

  // ── Render question ────────────────────────────────────────────────────
  function renderQuestion() {
    if (idx >= pool.length) {
      pool = shuffle([...fullPool]);
      idx  = 0;
    }

    const ex          = pool[idx];
    const isClassify  = ex.type === 'classify';

    container.innerHTML = `
      <div class="ch-game">
        <div class="ch-top">
          <button class="ch-close" title="Закрыть">✕</button>
          <div class="ch-streaks">
            <span class="ch-streak">🔥 ${streak}</span>
            <span class="ch-best">Рекорд: ${best}</span>
          </div>
        </div>

        <div class="ch-from">Глава ${ex.chNum} · ${esc(ex.chTheme)}</div>
        <div class="ch-question">${esc(ex.question)}</div>

        ${isClassify
          ? `<div class="ch-opts">
               ${ex.options.map(o =>
                 `<button class="ch-opt-btn" data-v="${esc(o)}">${esc(o)}</button>`
               ).join('')}
             </div>`
          : `<div class="ch-input-row">
               <input id="ch-input" class="ch-input" type="text"
                 placeholder="Ваш ответ…" autocomplete="off" spellcheck="false">
               <button class="ch-check-btn">Проверить</button>
             </div>`
        }
      </div>`;

    // Close button
    container.querySelector('.ch-close').addEventListener('click', () =>
      onClose && onClose());

    // Input controls
    if (isClassify) {
      container.querySelectorAll('.ch-opt-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (answered) return;
          answered = true;
          const correct = btn.dataset.v === ex.answer;

          if (correct) {
            btn.classList.add('ch-correct');
          } else {
            btn.classList.add('ch-wrong');
            container.querySelectorAll('.ch-opt-btn').forEach(b => {
              if (b.dataset.v === ex.answer) b.classList.add('ch-correct');
            });
          }
          container.querySelectorAll('.ch-opt-btn').forEach(b => (b.disabled = true));
          handleResult(correct, ex);
        });
      });
    } else {
      const input    = container.querySelector('#ch-input');
      const checkBtn = container.querySelector('.ch-check-btn');

      const submit = () => {
        if (answered || !input.value.trim()) return;
        answered = true;
        const correct = normalize(input.value) === normalize(ex.answer);
        input.classList.add(correct ? 'ch-correct' : 'ch-wrong');
        input.disabled    = true;
        checkBtn.disabled = true;
        handleResult(correct, ex);
      };

      input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
      checkBtn.addEventListener('click', submit);
      input.focus();
    }
  }

  // ── Result handling ────────────────────────────────────────────────────
  function handleResult(correct, ex) {
    if (correct) {
      streak++;
      if (streak > best) {
        best = streak;
        saveBest(best);
      }
      showToast('✓ Верно!', 'ok', () => {
        idx++;
        answered = false;
        renderQuestion();
      });
    } else {
      showBreak(streak, best, ex.answer);
    }
  }

  // ── Toast feedback (brief, then proceed) ──────────────────────────────
  function showToast(text, type, cb) {
    const game = container.querySelector('.ch-game');
    if (!game) { cb(); return; }
    const fb = document.createElement('div');
    fb.className = `ch-fb ch-fb-${type}`;
    fb.textContent = text;
    game.appendChild(fb);
    setTimeout(() => { fb.remove(); cb && cb(); }, NEXT_DELAY);
  }

  // ── Break screen ───────────────────────────────────────────────────────
  function showBreak(finalStreak, currentBest, correctAnswer) {
    const isNewRecord = finalStreak > 0 && finalStreak >= currentBest;

    container.innerHTML = `
      <div class="ch-break">
        <div class="ch-break-icon">💔</div>
        <div class="ch-break-title">Цепочка оборвалась</div>
        <div class="ch-break-score">${finalStreak}</div>
        <div class="ch-break-sub">${finalStreak === 1 ? 'ответ' : finalStreak < 5 ? 'ответа' : 'ответов'} подряд</div>
        <div class="ch-break-record ${isNewRecord ? 'new-record' : 'old-record'}">
          ${isNewRecord ? '🏆 Новый рекорд!' : `Рекорд: ${currentBest}`}
        </div>
        <div class="ch-break-answer">
          Правильный ответ: <strong>${esc(correctAnswer)}</strong>
        </div>
        <button class="ch-finish-primary" id="ch-restart">Попробовать снова</button>
        <button class="ch-finish-sec"     id="ch-done">Закрыть</button>
      </div>`;

    container.querySelector('#ch-restart').addEventListener('click', () =>
      startChain(container, chapters, { onClose }));
    container.querySelector('#ch-done').addEventListener('click', () =>
      onClose && onClose());
  }

  // ── Start ──────────────────────────────────────────────────────────────
  renderQuestion();
  return () => {}; // no timer to clean up
}

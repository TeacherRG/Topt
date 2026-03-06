/**
 * grammar-mindmap.js
 * Renders a color-coded mind-map for a German grammar topic.
 * Used by index.html in the Grammar step of each lesson.
 *
 * Supports two JSON shapes:
 *   Extended – grammar object with branches[], algorithm[], definition, level
 *   Legacy   – grammar object with topic, explanation, formula, examples[]
 *
 * Exposes:
 *   window.GrammarMindMap.render(g)  → HTML string
 *   window.mmToggle(el)              → toggle translation visibility
 */
'use strict';

(function (global) {

  /* ── branch color palette ──────────────────────────────────────
   * Each type maps to: background color, border/header color, icon, default label.
   * Colors match the spec semantics:
   *   🔵 structure (blue)    🔴 verbs/forms (red)     🟢 usage/cases (green)
   *   🟡 examples (yellow)   🟣 errors (purple)
   * bg values are light tints; border values are the saturated accent.
   * ─────────────────────────────────────────────────────────── */
  var COLORS = {
    structure: { bg: '#dbeafe', border: '#1a6fb5', icon: '🔵', label: 'Структура / Формула' },
    forms:     { bg: '#fee2e2', border: '#c0392b', icon: '🔴', label: 'Формы / Глаголы'     },
    usage:     { bg: '#d1fae5', border: '#27ae60', icon: '🟢', label: 'Использование'        },
    examples:  { bg: '#fef9c3', border: '#d68910', icon: '🟡', label: 'Примеры'              },
    errors:    { bg: '#ede9fe', border: '#7d3c98', icon: '🟣', label: 'Типичные ошибки'      }
  };

  /* ── HTML escaping ─────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ── Convert legacy grammar JSON to branches array ─────────── */
  function legacyToBranches(g) {
    var branches = [];
    if (g.formula) {
      branches.push({ type: 'structure', label: 'Структура / Формула', content: g.formula });
    }
    if (g.explanation) {
      branches.push({ type: 'usage', label: 'Использование', items: [g.explanation] });
    }
    if (g.examples && g.examples.length) {
      branches.push({ type: 'examples', label: 'Примеры', items: g.examples });
    }
    return branches;
  }

  /* ── Render items inside a branch body ─────────────────────── */
  function renderBranchItems(items) {
    if (!items || !items.length) return '';
    var isExPairs = typeof items[0] === 'object' && items[0] !== null;
    if (isExPairs) {
      return items.map(function (ex) {
        return '<div class="mm-example-item" onclick="mmToggle(this)">' +
          '<span class="mm-example-de">' + esc(ex.de) + '</span>' +
          '<span class="mm-example-ru" hidden>' + esc(ex.ru) + '</span>' +
          '</div>';
      }).join('');
    }
    return items.map(function (item) {
      return '<div class="mm-item">' + esc(item) + '</div>';
    }).join('');
  }

  /* ── Render a single branch card ───────────────────────────── */
  function renderBranch(branch) {
    var col = COLORS[branch.type] || COLORS.usage;
    var body = '';
    if (branch.content) {
      body = '<pre class="mm-branch-pre">' + esc(branch.content) + '</pre>';
    } else if (branch.items) {
      body = renderBranchItems(branch.items);
    }
    return '<div class="mm-branch" style="--bb:' + col.border + ';--bbg:' + col.bg + ';">' +
      '<div class="mm-branch-head">' +
        '<span>' + col.icon + '</span>' +
        '<span>' + esc(branch.label || col.label) + '</span>' +
      '</div>' +
      '<div class="mm-branch-body">' + body + '</div>' +
    '</div>';
  }

  /* ── Render algorithm steps ─────────────────────────────────── */
  function renderAlgorithm(steps) {
    if (!steps || !steps.length) return '';
    var stepsHtml = steps.map(function (s, i) {
      return '<div class="mm-step">' +
        '<span class="mm-step-num">' + (i + 1) + '</span>' +
        '<span class="mm-step-text">' + esc(s) + '</span>' +
      '</div>' +
      (i < steps.length - 1 ? '<div class="mm-step-arrow">↓</div>' : '');
    }).join('');
    return '<div class="mm-section mm-algorithm">' +
      '<div class="mm-section-title">⚙ Алгоритм</div>' +
      '<div class="mm-steps">' + stepsHtml + '</div>' +
    '</div>';
  }

  /* ── Render mini-examples section ───────────────────────────── */
  function renderMiniExamples(examples) {
    if (!examples || !examples.length) return '';
    var html = examples.map(function (ex) {
      return '<div class="mm-example-item" onclick="mmToggle(this)">' +
        '<span class="mm-example-de">' + esc(ex.de) + '</span>' +
        '<span class="mm-example-ru" hidden>' + esc(ex.ru) + '</span>' +
      '</div>';
    }).join('');
    return '<div class="mm-section">' +
      '<div class="mm-section-title">🟡 Мини-примеры — нажмите для перевода</div>' +
      html +
    '</div>';
  }

  /* ── Main render function ───────────────────────────────────── */
  function render(g) {
    var isExtended = Array.isArray(g.branches);
    var branches   = isExtended ? g.branches : legacyToBranches(g);
    var topic      = g.topic || '';
    var definition = ((g.definition && g.definition.trim()) || (g.explanation && g.explanation.trim()) || '').split('\n')[0];
    var level      = g.level || '';
    var algorithm  = g.algorithm || [];
    var examples   = isExtended ? (g.examples || []) : [];

    var levelBadge = level
      ? '<span class="mm-level">' + esc(level) + '</span>'
      : '';

    var branchesHtml = branches.map(renderBranch).join('');

    return '<div class="mm-wrap">' +
      '<div class="mm-center">' +
        levelBadge +
        '<h2 class="mm-topic">' + esc(topic) + '</h2>' +
        '<p class="mm-definition">' + esc(definition) + '</p>' +
      '</div>' +
      '<div class="mm-connector"><div class="mm-connector-line"></div></div>' +
      '<div class="mm-branches">' + branchesHtml + '</div>' +
      renderAlgorithm(algorithm) +
      renderMiniExamples(examples) +
    '</div>';
  }

  /* ── Global exports ─────────────────────────────────────────── */
  global.GrammarMindMap = { render: render };

  /**
   * Toggle the Russian translation of an example item.
   * Called via onclick="mmToggle(this)" in the rendered HTML.
   */
  global.mmToggle = function (el) {
    var ru = el.querySelector('.mm-example-ru');
    if (ru) { ru.hidden = !ru.hidden; }
  };

}(window));

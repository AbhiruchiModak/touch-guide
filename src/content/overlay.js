/**
 * overlay.js
 *
 * Builds and manages the floating guidance card.
 * Uses Shadow DOM so page styles can never interfere.
 *
 * New in this version:
 *  - updateContent(info)  — smoothly updates the card body AFTER the
 *    contextual AI result arrives, without hiding/reshowing.
 *  - Loading shimmer state while AI is fetching.
 */

const GuidanceOverlay = (() => {
  'use strict';

  let hostEl         = null;
  let shadowRoot     = null;
  let cardEl         = null;
  let autoDismissTimer = null;
  let _currentInfo   = null;

  return { show, hide, isInsideCard, updateContent };

  // ── show(info, x, y) ──────────────────────────────────────────────────────
  function show(info, x, y) {
    hide();
    _currentInfo = info;

    hostEl = document.createElement('div');
    hostEl.id = 'touchguide-host';
    Object.assign(hostEl.style, {
      position: 'fixed', zIndex: '2147483646',
      top: '0', left: '0', width: '0', height: '0',
      overflow: 'visible', pointerEvents: 'none',
    });
    document.documentElement.appendChild(hostEl);

    shadowRoot = hostEl.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = getCardCSS();
    shadowRoot.appendChild(style);

    cardEl = buildCard(info);
    shadowRoot.appendChild(cardEl);

    positionCard(cardEl, x, y);

    requestAnimationFrame(() => cardEl.classList.add('tg-visible'));

    shadowRoot.getElementById('tg-close').addEventListener('click', (e) => {
      e.stopPropagation();
      hide();
    });

    shadowRoot.getElementById('tg-speak')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = _currentInfo;
      chrome.runtime.sendMessage({
        type: 'SPEAK',
        text: `${i.name}. ${i.description}. ${i.howToUse}`,
      });
    });

    autoDismissTimer = setTimeout(hide, 10000);
    cardEl.style.pointerEvents = 'all';
  }

  // ── updateContent(info) — called when contextual AI result arrives ─────────
  function updateContent(info) {
    if (!shadowRoot || !cardEl) return;
    _currentInfo = info;

    // Remove shimmer if present
    const shimmer = shadowRoot.getElementById('tg-shimmer');
    if (shimmer) shimmer.remove();

    // Update badge
    const badge = shadowRoot.getElementById('tg-badge');
    if (badge) {
      badge.className   = 'tg-badge tg-badge-context';
      badge.textContent = '✨ Contextual';
    }

    // Update name
    const nameEl = shadowRoot.getElementById('tg-name');
    if (nameEl) nameEl.textContent = info.name;

    // Update description with a brief fade
    const descEl = shadowRoot.getElementById('tg-desc');
    if (descEl) {
      descEl.classList.add('tg-updating');
      setTimeout(() => {
        descEl.textContent = info.description;
        descEl.classList.remove('tg-updating');
      }, 150);
    }

    // Update how-to-use
    const howEl = shadowRoot.getElementById('tg-how');
    if (howEl) {
      howEl.classList.add('tg-updating');
      setTimeout(() => {
        howEl.textContent = info.howToUse;
        howEl.classList.remove('tg-updating');
      }, 200);
    }

    // Update source label
    const srcEl = shadowRoot.getElementById('tg-source');
    if (srcEl) srcEl.textContent = '✨ Contextual AI';

    // Reset progress bar so user gets the full 10s from AI result
    clearTimeout(autoDismissTimer);
    autoDismissTimer = setTimeout(hide, 10000);
    const fill = shadowRoot.querySelector('.tg-progress-fill');
    if (fill) {
      fill.style.animation = 'none';
      fill.offsetHeight; // force reflow
      fill.style.animation = 'tg-countdown 10s linear forwards';
    }
  }

  // ── hide() ────────────────────────────────────────────────────────────────
  function hide() {
    clearTimeout(autoDismissTimer);
    if (cardEl) {
      cardEl.classList.remove('tg-visible');
      cardEl.classList.add('tg-hiding');
      setTimeout(() => {
        hostEl?.remove();
        hostEl = shadowRoot = cardEl = _currentInfo = null;
      }, 200);
    }
  }

  // ── isInsideCard ──────────────────────────────────────────────────────────
  function isInsideCard(el) {
    if (!hostEl) return false;
    return hostEl.contains(el) || el === hostEl || el?.id === 'touchguide-host';
  }

  // ── buildCard ─────────────────────────────────────────────────────────────
  function buildCard(info) {
    const card = document.createElement('div');
    card.className = 'tg-card';

    // Badge logic
    let badgeHtml = '';
    if (info.source === 'context-ai') {
      badgeHtml = `<span class="tg-badge tg-badge-context" id="tg-badge">✨ Contextual</span>`;
    } else if (info.source === 'ai') {
      badgeHtml = `<span class="tg-badge tg-badge-ai" id="tg-badge">AI · ${Math.round((info.confidence || 0) * 100)}%</span>`;
    } else if (info.source === 'demo') {
      badgeHtml = `<span class="tg-badge tg-badge-demo" id="tg-badge">Demo</span>`;
    } else {
      // No API key yet — show a subtle "loading context..." shimmer badge
      badgeHtml = `<span class="tg-badge tg-badge-loading" id="tg-badge">⏳ Loading context…</span>`;
    }

    card.innerHTML = `
      <div class="tg-header">
        <span class="tg-icon">${escHtml(info.icon || '💡')}</span>
        <span class="tg-name" id="tg-name">${escHtml(info.name)}</span>
        ${badgeHtml}
        <button class="tg-btn-icon" id="tg-close" title="Close" aria-label="Close guidance card">✕</button>
      </div>

      <div class="tg-body">
        <div class="tg-section">
          <div class="tg-label">WHAT IT DOES</div>
          <div class="tg-text" id="tg-desc">${escHtml(info.description)}</div>
        </div>

        <div class="tg-divider"></div>

        <div class="tg-section">
          <div class="tg-label">HOW TO USE</div>
          <div class="tg-text" id="tg-how">${escHtml(info.howToUse)}</div>
        </div>

        ${info.extra ? `
        <div class="tg-divider"></div>
        <div class="tg-section">
          <div class="tg-label">EXTRA INFO</div>
          <div class="tg-text tg-muted">${escHtml(info.extra)}</div>
        </div>` : ''}
      </div>

      <div class="tg-footer">
        <button class="tg-btn-speak" id="tg-speak" aria-label="Read guidance aloud">
          🔊 Read Aloud
        </button>
        <span class="tg-source" id="tg-source">${sourceLabel(info.source)}</span>
      </div>

      <div class="tg-progress-bar">
        <div class="tg-progress-fill"></div>
      </div>
    `;

    return card;
  }

  // ── positionCard ──────────────────────────────────────────────────────────
  function positionCard(card, x, y) {
    const vpW = window.innerWidth, vpH = window.innerHeight;
    const cW = 320, cH = 280, GAP = 16;
    let left = x + GAP, top = y - cH / 2;

    if (left + cW > vpW - GAP) left = x - cW - GAP;
    if (left < GAP)             left = GAP;
    if (top  < GAP)             top  = GAP;
    if (top + cH > vpH - GAP)  top  = vpH - cH - GAP;

    Object.assign(card.style, { position: 'fixed', left: `${left}px`, top: `${top}px` });
  }

  // ── helpers ───────────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function sourceLabel(src) {
    const map = {
      'context-ai': '✨ Contextual AI',
      aria:        '♿ ARIA',
      semantic:    '🏷 HTML',
      heuristic:   '🔍 Heuristic',
      ai:          '🤖 AI',
      demo:        '🎯 Demo',
      fallback:    '❓ Unknown',
    };
    return map[src] || '';
  }

  // ── CSS ───────────────────────────────────────────────────────────────────
  function getCardCSS() {
    return `
      :host { all: initial; }

      .tg-card {
        position: fixed;
        width: 320px;
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: #1a1a2e;
        overflow: hidden;
        opacity: 0;
        transform: scale(0.94) translateY(6px);
        transition: opacity 0.18s ease, transform 0.18s ease;
        z-index: 2147483646;
      }
      .tg-card.tg-visible { opacity: 1; transform: scale(1) translateY(0); }
      .tg-card.tg-hiding  { opacity: 0; transform: scale(0.94) translateY(6px); }

      .tg-header {
        display: flex;
        align-items: center;
        gap: 8px;
        background: linear-gradient(135deg, #4F46E5 0%, #6D28D9 100%);
        padding: 14px 16px;
        color: #fff;
      }
      .tg-icon { font-size: 22px; flex-shrink: 0; }
      .tg-name {
        flex: 1;
        font-size: 16px;
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .tg-btn-icon {
        background: rgba(255,255,255,0.2);
        border: none; color: #fff;
        width: 26px; height: 26px;
        border-radius: 50%;
        cursor: pointer; font-size: 13px;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0; transition: background 0.15s;
      }
      .tg-btn-icon:hover { background: rgba(255,255,255,0.35); }

      .tg-badge {
        font-size: 10px; font-weight: 700;
        padding: 2px 7px; border-radius: 10px;
        flex-shrink: 0; letter-spacing: 0.03em;
      }
      .tg-badge-ai      { background: rgba(255,255,255,0.25); color: #fff; }
      .tg-badge-demo    { background: #FEF3C7; color: #92400E; }
      .tg-badge-context { background: #D1FAE5; color: #065F46; }
      .tg-badge-loading {
        background: rgba(255,255,255,0.15); color: rgba(255,255,255,0.8);
        animation: tg-pulse 1.4s ease-in-out infinite;
      }
      @keyframes tg-pulse {
        0%,100% { opacity: 0.6; }
        50%      { opacity: 1;   }
      }

      .tg-body { padding: 14px 16px 10px; }
      .tg-section { margin-bottom: 2px; }
      .tg-label {
        font-size: 10px; font-weight: 700;
        letter-spacing: 0.08em; color: #9CA3AF;
        margin-bottom: 4px; text-transform: uppercase;
      }
      .tg-text  { color: #374151; font-size: 13.5px; line-height: 1.55; }
      .tg-muted { color: #6B7280; font-style: italic; }

      /* Fade transition when AI updates text */
      .tg-updating {
        transition: opacity 0.15s ease;
        opacity: 0.3;
      }

      .tg-divider { height: 1px; background: #F3F4F6; margin: 10px 0; }

      .tg-footer {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 16px 12px;
        background: #F9FAFB; border-top: 1px solid #F3F4F6;
      }
      .tg-btn-speak {
        background: #EEF2FF; border: none; color: #4F46E5;
        font-size: 12px; font-weight: 600;
        padding: 6px 14px; border-radius: 20px;
        cursor: pointer; transition: background 0.15s;
      }
      .tg-btn-speak:hover { background: #E0E7FF; }
      .tg-source { font-size: 11px; color: #9CA3AF; font-style: italic; }

      .tg-progress-bar  { height: 3px; background: #E5E7EB; }
      .tg-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #4F46E5, #6D28D9);
        width: 100%;
        animation: tg-countdown 10s linear forwards;
      }
      @keyframes tg-countdown { from { width: 100%; } to { width: 0%; } }
    `;
  }

})();

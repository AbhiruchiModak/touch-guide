/**
 * overlay.js
 *
 * Builds and manages the floating guidance card that appears when
 * a user clicks an element.
 *
 * The card is injected directly into the page DOM using a Shadow DOM
 * so page styles CANNOT interfere with our card's appearance.
 *
 * ── Shadow DOM explained (beginner) ───────────────────────────────────────
 * Imagine putting your card inside a sealed glass box.
 * The page's CSS can't reach in, and your card's CSS can't leak out.
 * This means our card looks the same on EVERY website.
 * ──────────────────────────────────────────────────────────────────────────
 */

const GuidanceOverlay = (() => {
  'use strict';

  // ── Private state ─────────────────────────────────────────────────────────
  let hostEl    = null;   // the <div> we inject into the page
  let shadowRoot = null;  // the Shadow DOM root inside hostEl
  let cardEl    = null;   // the actual card element inside shadow
  let autoDismissTimer = null;

  // ── Public API ────────────────────────────────────────────────────────────
  return { show, hide, isInsideCard };

  // ── show(info, x, y) ──────────────────────────────────────────────────────
  function show(info, x, y) {
    hide();  // remove previous card if any

    // 1. Create the host element (invisible wrapper)
    hostEl = document.createElement('div');
    hostEl.id = 'touchguide-host';
    Object.assign(hostEl.style, {
      position:  'fixed',
      zIndex:    '2147483646',
      top:       '0',
      left:      '0',
      width:     '0',
      height:    '0',
      overflow:  'visible',
      pointerEvents: 'none',
    });
    document.documentElement.appendChild(hostEl);

    // 2. Attach Shadow DOM (style isolation)
    shadowRoot = hostEl.attachShadow({ mode: 'open' });

    // 3. Inject our CSS into the shadow root
    const style = document.createElement('style');
    style.textContent = getCardCSS();
    shadowRoot.appendChild(style);

    // 4. Build the card HTML
    cardEl = buildCard(info);
    shadowRoot.appendChild(cardEl);

    // 5. Position the card (smart: stay within viewport)
    positionCard(cardEl, x, y);

    // 6. Animate in
    requestAnimationFrame(() => {
      cardEl.classList.add('tg-visible');
    });

    // 7. Wire up close / speak buttons
    shadowRoot.getElementById('tg-close').addEventListener('click', (e) => {
      e.stopPropagation();
      hide();
    });

    shadowRoot.getElementById('tg-speak')?.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({
        type: 'SPEAK',
        text: `${info.name}. ${info.description}. ${info.howToUse}`,
      });
    });

    // 8. Auto-dismiss after 7 seconds
    autoDismissTimer = setTimeout(hide, 7000);

    // 9. Enable pointer events on the card itself
    cardEl.style.pointerEvents = 'all';
  }

  // ── hide() ────────────────────────────────────────────────────────────────
  function hide() {
    clearTimeout(autoDismissTimer);
    if (cardEl) {
      cardEl.classList.remove('tg-visible');
      cardEl.classList.add('tg-hiding');
      setTimeout(() => {
        hostEl?.remove();
        hostEl   = null;
        shadowRoot = null;
        cardEl   = null;
      }, 200);
    }
  }

  // ── isInsideCard(el) ──────────────────────────────────────────────────────
  // Returns true if the element is part of our guidance card UI
  function isInsideCard(el) {
    if (!hostEl) return false;
    return hostEl.contains(el) || el === hostEl || el?.id === 'touchguide-host';
  }

  // ── buildCard(info) ───────────────────────────────────────────────────────
  function buildCard(info) {
    const card = document.createElement('div');
    card.className = 'tg-card';

    const confidenceBadge = info.source === 'ai'
      ? `<span class="tg-badge tg-badge-ai">AI · ${Math.round((info.confidence || 0) * 100)}%</span>`
      : info.source === 'demo'
      ? `<span class="tg-badge tg-badge-demo">Demo</span>`
      : '';

    card.innerHTML = `
      <div class="tg-header">
        <span class="tg-icon">${info.icon || '💡'}</span>
        <span class="tg-name">${escHtml(info.name)}</span>
        ${confidenceBadge}
        <button class="tg-btn-icon" id="tg-close" title="Close" aria-label="Close guidance card">✕</button>
      </div>

      <div class="tg-body">
        <div class="tg-section">
          <div class="tg-label">WHAT IT DOES</div>
          <div class="tg-text">${escHtml(info.description)}</div>
        </div>

        <div class="tg-divider"></div>

        <div class="tg-section">
          <div class="tg-label">HOW TO USE</div>
          <div class="tg-text">${escHtml(info.howToUse)}</div>
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
        <span class="tg-source">${sourceLabel(info.source)}</span>
      </div>

      <div class="tg-progress-bar">
        <div class="tg-progress-fill"></div>
      </div>
    `;

    return card;
  }

  // ── positionCard(cardEl, x, y) ────────────────────────────────────────────
  function positionCard(card, x, y) {
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    const cW  = 320;   // card width (matches CSS)
    const cH  = 260;   // approximate card height

    const GAP = 16;
    let left = x + GAP;
    let top  = y - cH / 2;

    // Flip left if too close to right edge
    if (left + cW > vpW - GAP) left = x - cW - GAP;
    // Keep within left boundary
    if (left < GAP) left = GAP;
    // Keep within vertical bounds
    if (top < GAP)             top = GAP;
    if (top + cH > vpH - GAP)  top = vpH - cH - GAP;

    Object.assign(card.style, {
      position: 'fixed',
      left:     `${left}px`,
      top:      `${top}px`,
    });
  }

  // ── helpers ───────────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function sourceLabel(src) {
    const map = {
      aria:     '♿ ARIA',
      semantic: '🏷 HTML',
      heuristic:'🔍 Heuristic',
      ai:       '🤖 AI',
      demo:     '🎯 Demo',
      fallback: '❓ Unknown',
    };
    return map[src] || '';
  }

  // ── Card CSS (injected into Shadow DOM) ───────────────────────────────────
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
      .tg-card.tg-visible {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
      .tg-card.tg-hiding {
        opacity: 0;
        transform: scale(0.94) translateY(6px);
      }

      /* Header */
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
        border: none;
        color: #fff;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 13px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: background 0.15s;
      }
      .tg-btn-icon:hover { background: rgba(255,255,255,0.35); }

      /* Badges */
      .tg-badge {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 10px;
        flex-shrink: 0;
        letter-spacing: 0.03em;
      }
      .tg-badge-ai   { background: rgba(255,255,255,0.25); color: #fff; }
      .tg-badge-demo { background: #FEF3C7; color: #92400E; }

      /* Body */
      .tg-body { padding: 14px 16px 10px; }
      .tg-section { margin-bottom: 2px; }
      .tg-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        color: #9CA3AF;
        margin-bottom: 4px;
        text-transform: uppercase;
      }
      .tg-text  { color: #374151; font-size: 13.5px; line-height: 1.55; }
      .tg-muted { color: #6B7280; font-style: italic; }
      .tg-divider {
        height: 1px;
        background: #F3F4F6;
        margin: 10px 0;
      }

      /* Footer */
      .tg-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 16px 12px;
        background: #F9FAFB;
        border-top: 1px solid #F3F4F6;
      }
      .tg-btn-speak {
        background: #EEF2FF;
        border: none;
        color: #4F46E5;
        font-size: 12px;
        font-weight: 600;
        padding: 6px 14px;
        border-radius: 20px;
        cursor: pointer;
        transition: background 0.15s;
      }
      .tg-btn-speak:hover { background: #E0E7FF; }
      .tg-source {
        font-size: 11px;
        color: #9CA3AF;
        font-style: italic;
      }

      /* Progress bar (auto-dismiss countdown) */
      .tg-progress-bar {
        height: 3px;
        background: #E5E7EB;
      }
      .tg-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #4F46E5, #6D28D9);
        width: 100%;
        animation: tg-countdown 7s linear forwards;
      }
      @keyframes tg-countdown {
        from { width: 100%; }
        to   { width: 0%; }
      }
    `;
  }

})();

/**
 * context-analyzer.js
 *
 * Gathers rich, contextual information about the current page and the
 * clicked element so the AI can give SPECIFIC, contextual guidance rather
 * than generic descriptions.
 *
 * Example output:
 *   site:       "Amazon"
 *   pageType:   "product"
 *   section:    "Product actions"
 *   nearbyText: ["Add to Cart", "Buy Now", "$29.99", "In Stock"]
 *   formContext: "Checkout form – Shipping address"
 *   breadcrumb: "Home > Electronics > Headphones"
 */

const ContextAnalyzer = (() => {
  'use strict';

  return { analyze };

  /**
   * Main entry point.
   * @param {Element} el  The element the user clicked
   * @returns {Object}   Rich context object
   */
  function analyze(el) {
    return {
      // ── Page-level context ─────────────────────────────────────────────
      url:          sanitizeUrl(window.location.href),
      site:         detectSiteName(),
      pageTitle:    document.title?.slice(0, 120) || '',
      pageType:     detectPageType(),
      breadcrumb:   detectBreadcrumb(),
      mainHeading:  detectMainHeading(),

      // ── Element-level context ──────────────────────────────────────────
      section:      detectSection(el),
      formContext:  detectFormContext(el),
      nearbyText:   collectNearbyText(el),
      siblingLabels:collectSiblingLabels(el),
      listContext:  detectListContext(el),
      tableContext: detectTableContext(el),

      // ── Raw element signals ────────────────────────────────────────────
      elementTag:   el.tagName?.toLowerCase() || '',
      elementText:  (el.textContent || '').trim().slice(0, 100),
      elementHref:  el.getAttribute?.('href') || el.closest('a')?.getAttribute('href') || '',
      elementType:  el.getAttribute?.('type') || '',
      elementName:  el.getAttribute?.('name') || '',
      elementId:    el.id || '',
      elementClasses: (el.className || '').toString().slice(0, 200),
      isDisabled:   !!(el.disabled || el.getAttribute?.('aria-disabled') === 'true'),
      isExpanded:   el.getAttribute?.('aria-expanded') || null,
      ariaLabel:    el.getAttribute?.('aria-label') || '',
      placeholder:  el.getAttribute?.('placeholder') || '',
      dataAttrs:    collectDataAttrs(el),
    };
  }

  // ── Site name ─────────────────────────────────────────────────────────────
  function detectSiteName() {
    // Try OG site_name meta tag first
    const og = document.querySelector('meta[property="og:site_name"]');
    if (og?.content?.trim()) return og.content.trim();

    // Try application-name
    const appName = document.querySelector('meta[name="application-name"]');
    if (appName?.content?.trim()) return appName.content.trim();

    // Fall back to hostname, cleaned up
    const host = window.location.hostname.replace(/^www\./, '');
    // Convert "github.com" → "GitHub" style lookup
    const knownSites = {
      'github.com': 'GitHub', 'youtube.com': 'YouTube', 'twitter.com': 'Twitter',
      'x.com': 'X (Twitter)', 'facebook.com': 'Facebook', 'instagram.com': 'Instagram',
      'linkedin.com': 'LinkedIn', 'reddit.com': 'Reddit', 'amazon.com': 'Amazon',
      'amazon.in': 'Amazon India', 'flipkart.com': 'Flipkart', 'google.com': 'Google',
      'gmail.com': 'Gmail', 'docs.google.com': 'Google Docs', 'drive.google.com': 'Google Drive',
      'wikipedia.org': 'Wikipedia', 'stackoverflow.com': 'Stack Overflow',
      'netflix.com': 'Netflix', 'spotify.com': 'Spotify', 'notion.so': 'Notion',
      'slack.com': 'Slack', 'discord.com': 'Discord', 'figma.com': 'Figma',
      'medium.com': 'Medium', 'substack.com': 'Substack', 'shopify.com': 'Shopify',
    };
    return knownSites[host] || host;
  }

  // ── Page type detection ───────────────────────────────────────────────────
  function detectPageType() {
    const url   = window.location.href.toLowerCase();
    const title = document.title.toLowerCase();
    const body  = document.body?.className?.toLowerCase() || '';

    if (/\/(login|signin|sign-in|auth|log-in)/.test(url) || title.includes('sign in') || title.includes('log in')) return 'login';
    if (/\/(signup|register|join|create-account)/.test(url) || title.includes('sign up') || title.includes('register')) return 'registration';
    if (/\/(checkout|payment|billing|order)/.test(url)) return 'checkout';
    if (/\/(cart|basket|bag)/.test(url) || title.includes('cart')) return 'cart';
    if (/\/product\/|\/item\/|\/dp\/|\/p\//.test(url) || document.querySelector('[class*="product-detail"],[class*="pdp"]')) return 'product';
    if (/\/(search|results|find)/.test(url) || url.includes('?q=') || url.includes('?query=') || url.includes('?s=')) return 'search-results';
    if (/\/(settings|account|profile|preferences)/.test(url)) return 'settings';
    if (/\/(dashboard|home|overview|feed)/.test(url) || body.includes('dashboard')) return 'dashboard';
    if (/\/(article|post|blog|news|story)\//.test(url) || document.querySelector('article')) return 'article';
    if (/\/(contact|support|help|faq)/.test(url)) return 'support';
    if (url === window.location.origin + '/' || url === window.location.origin) return 'homepage';
    if (document.querySelector('form[class*="form"], [class*="wizard"], [class*="stepper"]')) return 'form';
    return 'general';
  }

  // ── Breadcrumb ────────────────────────────────────────────────────────────
  function detectBreadcrumb() {
    const sel = [
      '[aria-label="breadcrumb"] a',
      '[class*="breadcrumb"] a',
      '[class*="bread-crumb"] a',
      'nav.breadcrumb a',
      '.crumbs a',
    ].join(', ');
    const crumbs = Array.from(document.querySelectorAll(sel))
      .map(a => a.textContent?.trim())
      .filter(Boolean)
      .slice(0, 5);
    return crumbs.length ? crumbs.join(' > ') : '';
  }

  // ── Main heading ──────────────────────────────────────────────────────────
  function detectMainHeading() {
    const h1 = document.querySelector('h1');
    return h1?.textContent?.trim().slice(0, 100) || '';
  }

  // ── Section detection ─────────────────────────────────────────────────────
  function detectSection(el) {
    // Walk up looking for section/article headings or aria-label regions
    let node = el.parentElement;
    for (let i = 0; i < 10 && node && node !== document.body; i++, node = node.parentElement) {
      // Labelled region
      const regionLabel = node.getAttribute?.('aria-label') || node.getAttribute?.('aria-labelledby');
      if (regionLabel) {
        if (regionLabel.length < 80) return regionLabel;
        const labelEl = document.getElementById(regionLabel);
        if (labelEl?.textContent?.trim()) return labelEl.textContent.trim().slice(0, 80);
      }
      // Nearest heading sibling
      const heading = node.querySelector?.('h1,h2,h3,h4');
      if (heading?.textContent?.trim()) return heading.textContent.trim().slice(0, 80);
    }
    return '';
  }

  // ── Form context ──────────────────────────────────────────────────────────
  function detectFormContext(el) {
    const form = el.closest('form');
    if (!form) return '';

    const parts = [];

    // Form's own aria-label or legend
    const formLabel = form.getAttribute('aria-label') || form.getAttribute('aria-labelledby');
    if (formLabel && formLabel.length < 80) parts.push(formLabel);

    const legend = form.querySelector('legend, h2, h3');
    if (legend?.textContent?.trim()) parts.push(legend.textContent.trim().slice(0, 60));

    // Field group (fieldset)
    const fieldset = el.closest('fieldset');
    if (fieldset) {
      const fs_legend = fieldset.querySelector('legend');
      if (fs_legend?.textContent?.trim()) parts.push(fs_legend.textContent.trim().slice(0, 60));
    }

    return parts.filter(Boolean).join(' – ').slice(0, 120) || 'Form';
  }

  // ── Nearby text ───────────────────────────────────────────────────────────
  function collectNearbyText(el) {
    const texts = new Set();
    const MAX = 8;

    // Own text
    const own = el.textContent?.trim().replace(/\s+/g, ' ');
    if (own && own.length > 1 && own.length < 80) texts.add(own);

    // Label elements pointing at this field
    if (el.id) {
      const lbl = document.querySelector(`label[for="${el.id}"]`);
      if (lbl?.textContent?.trim()) texts.add(lbl.textContent.trim().slice(0, 60));
    }

    // Parent container's direct children text
    const parent = el.parentElement;
    if (parent) {
      for (const child of parent.children) {
        if (child === el) continue;
        const t = child.textContent?.trim().replace(/\s+/g, ' ');
        if (t && t.length > 1 && t.length < 80) {
          texts.add(t);
          if (texts.size >= MAX) break;
        }
      }
    }

    // Grandparent container (gives section context)
    const grandparent = parent?.parentElement;
    if (grandparent && texts.size < MAX) {
      for (const child of grandparent.children) {
        const t = child.textContent?.trim().replace(/\s+/g, ' ');
        if (t && t.length > 1 && t.length < 80 && !texts.has(t)) {
          texts.add(t);
          if (texts.size >= MAX) break;
        }
      }
    }

    return Array.from(texts).slice(0, MAX);
  }

  // ── Sibling labels (for inputs/buttons in a row) ──────────────────────────
  function collectSiblingLabels(el) {
    const labels = [];
    const siblings = el.parentElement?.children || [];
    for (const sib of siblings) {
      if (sib === el) continue;
      const tag = sib.tagName?.toLowerCase();
      if (['label', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'strong', 'em'].includes(tag)) {
        const t = sib.textContent?.trim().slice(0, 60);
        if (t) labels.push(t);
      }
    }
    return labels.slice(0, 4);
  }

  // ── List context ──────────────────────────────────────────────────────────
  function detectListContext(el) {
    const li = el.closest('li, [role="listitem"], [role="option"]');
    if (!li) return '';
    const list = li.closest('ul, ol, [role="list"], [role="listbox"]');
    if (!list) return '';
    const listLabel = list.getAttribute('aria-label') || '';
    const itemCount = list.children.length;
    return listLabel
      ? `Item in "${listLabel}" list (${itemCount} items)`
      : `Item in a list with ${itemCount} entries`;
  }

  // ── Table context ─────────────────────────────────────────────────────────
  function detectTableContext(el) {
    const cell = el.closest('td, th');
    if (!cell) return '';
    const table = cell.closest('table');
    if (!table) return '';

    const caption = table.querySelector('caption')?.textContent?.trim();
    const headerRow = table.querySelector('tr');
    const headers = Array.from(headerRow?.querySelectorAll('th') || [])
      .map(th => th.textContent?.trim())
      .filter(Boolean)
      .slice(0, 6)
      .join(', ');

    const colIndex = cell.cellIndex;
    const colHeader = table.querySelector(`th:nth-child(${colIndex + 1})`)?.textContent?.trim() || '';

    const parts = [];
    if (caption) parts.push(`Table: "${caption}"`);
    if (colHeader) parts.push(`Column: "${colHeader}"`);
    if (headers) parts.push(`Headers: ${headers}`);
    return parts.join(' | ').slice(0, 150);
  }

  // ── Data attributes ───────────────────────────────────────────────────────
  function collectDataAttrs(el) {
    if (!el.dataset) return {};
    const useful = {};
    const interestingKeys = ['action', 'name', 'icon', 'testid', 'cy', 'track', 'event', 'type', 'id'];
    for (const key of interestingKeys) {
      if (el.dataset[key]) useful[key] = el.dataset[key].slice(0, 60);
    }
    return useful;
  }

  // ── URL sanitizer (strip tokens/sessions) ─────────────────────────────────
  function sanitizeUrl(url) {
    try {
      const u = new URL(url);
      // Keep only origin + pathname (strip query params that may have tokens)
      return u.origin + u.pathname.slice(0, 80);
    } catch {
      return url.slice(0, 100);
    }
  }

})();

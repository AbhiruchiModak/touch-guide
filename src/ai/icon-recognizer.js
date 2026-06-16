/**
 * icon-recognizer.js
 *
 * AI / heuristic fallback for identifying web elements that have
 * no ARIA labels, no semantic role, and no visible text.
 *
 * Strategy (no server needed — runs entirely in the browser):
 *  1. Inspect computed styles, class names, and attributes
 *  2. Examine child SVG paths and icon font characters
 *  3. Analyse background-image URLs for known icon patterns
 *  4. Check common CSS class naming conventions (BEM, Bootstrap, etc.)
 *
 * Returns the same { name, description, howToUse, icon, confidence, source }
 * shape as ElementInfo.extract() so callers treat them identically.
 */

const IconRecognizer = (() => {
  'use strict';

  return { identify };

  /**
   * @param {Element} el
   * @returns {Object|null}
   */
  async function identify(el) {
    if (!el) return null;

    // Try each strategy in confidence order
    const result =
      fromAriaHidden(el)     ||
      fromClassNames(el)     ||
      fromSvgTitle(el)       ||
      fromIconFont(el)       ||
      fromBackgroundImage(el)||
      fromDataAttrs(el)      ||
      fromNearbyText(el);

    return result || null;
  }

  // ── Strategy 1: aria-hidden SVG icons ─────────────────────────────────────
  // Many icon libraries render <svg aria-hidden="true"> inside a button.
  // We look at the SVG's class or the button's data-icon attribute.
  function fromAriaHidden(el) {
    const svg = el.querySelector('svg') || (el.tagName === 'SVG' ? el : null);
    if (!svg) return null;

    const svgClass = svg.getAttribute('class') || '';
    const use      = svg.querySelector('use');
    const href     = use?.getAttribute('href') || use?.getAttribute('xlink:href') || '';
    const symbol   = href.replace(/.*#/, '').toLowerCase();

    const matched = matchKeywords(svgClass + ' ' + symbol);
    if (matched) return buildResult(matched, 0.72, 'ai');

    return null;
  }

  // ── Strategy 2: CSS class name pattern matching ────────────────────────────
  // Developers often write class="btn-close", "icon-search", "fa-trash" etc.
  function fromClassNames(el) {
    const classes = [
      el.className,
      el.parentElement?.className,
      el.querySelector('[class]')?.className,
    ].filter(Boolean).join(' ').toLowerCase();

    const matched = matchKeywords(classes);
    if (matched) return buildResult(matched, 0.65, 'ai');
    return null;
  }

  // ── Strategy 3: SVG <title> element ───────────────────────────────────────
  function fromSvgTitle(el) {
    const title = el.querySelector('svg title')?.textContent?.trim();
    if (title) {
      const matched = matchKeywords(title) || { name: title, ...genericGuidance(title) };
      return buildResult(matched, 0.85, 'ai');
    }
    return null;
  }

  // ── Strategy 4: Icon font characters (FontAwesome, Material Icons etc.) ────
  // Icon fonts render a Unicode character via ::before pseudo-element.
  // We check the element's text content for known private-use Unicode ranges.
  function fromIconFont(el) {
    const text = el.textContent?.trim();
    if (!text) return null;

    // Material Icons use plain text class names as content
    const matParent = el.closest('.material-icons, .material-symbols-outlined, .material-symbols-rounded');
    if (matParent) {
      const iconName = text.replace(/_/g,' ');
      const matched  = matchKeywords(iconName) || { name: capitalise(iconName), ...genericGuidance(iconName) };
      return buildResult(matched, 0.88, 'ai');
    }

    // FontAwesome Unicode range (e0000–e ffff private use area)
    if (text.length === 1 && text.charCodeAt(0) > 0xe000) {
      return buildResult({ name: 'Icon Button', ...genericGuidance('icon') }, 0.4, 'ai');
    }

    return null;
  }

  // ── Strategy 5: background-image URL ─────────────────────────────────────
  function fromBackgroundImage(el) {
    const bg = getComputedStyle(el).backgroundImage || '';
    if (!bg || bg === 'none') return null;

    const url = bg.replace(/url\(["']?|["']?\)/g,'').toLowerCase();
    const filename = url.split('/').pop().replace(/\.\w+$/, '');
    const matched = matchKeywords(filename);
    if (matched) return buildResult(matched, 0.6, 'ai');
    return null;
  }

  // ── Strategy 6: data-* attributes ────────────────────────────────────────
  function fromDataAttrs(el) {
    const candidates = [
      el.dataset.icon,
      el.dataset.name,
      el.dataset.action,
      el.dataset.testid,
      el.dataset.cy,
      el.getAttribute('data-tip'),
      el.getAttribute('data-tooltip'),
    ].filter(Boolean).join(' ').toLowerCase();

    if (!candidates) return null;
    const matched = matchKeywords(candidates);
    if (matched) return buildResult(matched, 0.7, 'ai');
    return null;
  }

  // ── Strategy 7: nearby visible text ───────────────────────────────────────
  // Look at sibling or parent text nodes for a label
  function fromNearbyText(el) {
    const parent = el.parentElement;
    if (!parent) return null;

    // Adjacent text node
    for (const node of parent.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent?.trim();
        if (t && t.length > 1 && t.length < 60) {
          return buildResult(
            { name: t, ...genericGuidance(t) },
            0.45,
            'ai'
          );
        }
      }
    }
    return null;
  }

  // ── Keyword → guidance dictionary ─────────────────────────────────────────
  const ICON_DICT = [
    { keys: ['search','find','magnif','lookup'],
      name:'Search', icon:'🔍',
      description:'A search control. Type keywords to find content.',
      howToUse:'Click it, type your search terms, then press Enter.' },

    { keys: ['close','dismiss','cancel','remove','delete','trash','bin','clear','times','×','✕'],
      name:'Close / Delete', icon:'✕',
      description:'Closes or removes the associated item, window, or selection.',
      howToUse:'Click once to close or delete. You may be asked to confirm.' },

    { keys: ['menu','hamburger','nav','navigation','sidebar','drawer'],
      name:'Menu', icon:'☰',
      description:'Opens the navigation menu or sidebar.',
      howToUse:'Click to expand the menu, then click any item to navigate.' },

    { keys: ['home','house'],
      name:'Home', icon:'🏠',
      description:'Returns you to the homepage or dashboard.',
      howToUse:'Click to go back to the main starting page.' },

    { keys: ['back','previous','prev','arrow-left','chevron-left'],
      name:'Back', icon:'←',
      description:'Goes back to the previous page or step.',
      howToUse:'Click to return to where you were before.' },

    { keys: ['forward','next','arrow-right','chevron-right'],
      name:'Next / Forward', icon:'→',
      description:'Moves to the next page, step, or item.',
      howToUse:'Click to proceed forward.' },

    { keys: ['setting','config','gear','cog','preference','option'],
      name:'Settings', icon:'⚙️',
      description:'Opens settings or configuration options.',
      howToUse:'Click to see and change preferences and options.' },

    { keys: ['user','account','profile','avatar','person','people'],
      name:'User / Profile', icon:'👤',
      description:'Opens your user profile or account settings.',
      howToUse:'Click to view or edit your profile, or to sign in/out.' },

    { keys: ['login','signin','sign-in','log-in'],
      name:'Sign In', icon:'🔑',
      description:'Opens the login form to sign into your account.',
      howToUse:'Click, then enter your email and password.' },

    { keys: ['logout','signout','sign-out','log-out'],
      name:'Sign Out', icon:'🚪',
      description:'Logs you out of your account.',
      howToUse:'Click to securely sign out. You will need to log in again to access your account.' },

    { keys: ['cart','basket','bag','shop','store'],
      name:'Shopping Cart', icon:'🛒',
      description:'Opens your shopping cart or bag with items you\'ve selected.',
      howToUse:'Click to review your cart, change quantities, or proceed to checkout.' },

    { keys: ['heart','like','love','favourite','favorite','wishlist'],
      name:'Like / Favourite', icon:'❤️',
      description:'Saves this item to your favourites or likes it.',
      howToUse:'Click to toggle liked/saved state. Click again to remove.' },

    { keys: ['share','send','export','forward'],
      name:'Share', icon:'↗️',
      description:'Opens sharing options to send this content to others.',
      howToUse:'Click to see options: copy link, share to social media, email, etc.' },

    { keys: ['download','save','export'],
      name:'Download', icon:'⬇️',
      description:'Downloads a file or saves content to your device.',
      howToUse:'Click to start the download. Check your Downloads folder afterwards.' },

    { keys: ['upload','import','attach'],
      name:'Upload', icon:'⬆️',
      description:'Lets you upload or attach a file from your device.',
      howToUse:'Click to open a file browser, select your file, then confirm.' },

    { keys: ['edit','pencil','pen','write','modify','update'],
      name:'Edit', icon:'✏️',
      description:'Opens this item for editing.',
      howToUse:'Click to enter edit mode. Make your changes, then save.' },

    { keys: ['add','plus','create','new','insert'],
      name:'Add / Create', icon:'➕',
      description:'Creates a new item, entry, or opens a creation form.',
      howToUse:'Click to start creating something new.' },

    { keys: ['filter','sort','funnel'],
      name:'Filter / Sort', icon:'🔽',
      description:'Opens filtering or sorting options to narrow down results.',
      howToUse:'Click to choose filters or a sort order, then apply.' },

    { keys: ['notification','bell','alert'],
      name:'Notifications', icon:'🔔',
      description:'Shows your notifications and alerts.',
      howToUse:'Click to see recent notifications. A badge number means unread alerts.' },

    { keys: ['help','info','question','support','?'],
      name:'Help / Info', icon:'ℹ️',
      description:'Shows help information or documentation.',
      howToUse:'Click to read more about this feature or get support.' },

    { keys: ['refresh','reload','sync','update','spinner'],
      name:'Refresh', icon:'🔄',
      description:'Reloads or refreshes the current content.',
      howToUse:'Click to fetch the latest data and update the page.' },

    { keys: ['print'],
      name:'Print', icon:'🖨️',
      description:'Opens the print dialog to print this page or document.',
      howToUse:'Click, then choose your printer and settings, then click Print.' },

    { keys: ['zoom','expand','fullscreen','maximise','maximize'],
      name:'Zoom / Fullscreen', icon:'🔍',
      description:'Expands the view to fullscreen or zooms in.',
      howToUse:'Click to enter fullscreen. Press Esc to exit.' },

    { keys: ['collapse','minimise','minimize','compress','shrink'],
      name:'Collapse', icon:'➖',
      description:'Collapses or minimises this section.',
      howToUse:'Click to hide the content. Click again to expand it.' },

    { keys: ['play','start','resume'],
      name:'Play', icon:'▶️',
      description:'Plays or starts the media (video or audio).',
      howToUse:'Click to start playing. Click again to pause.' },

    { keys: ['pause','stop'],
      name:'Pause', icon:'⏸️',
      description:'Pauses the currently playing media.',
      howToUse:'Click to pause. Click Play to resume.' },

    { keys: ['volume','mute','speaker','sound'],
      name:'Volume / Mute', icon:'🔊',
      description:'Controls the audio volume or mutes/unmutes sound.',
      howToUse:'Click to mute/unmute. Drag the slider to adjust volume.' },

    { keys: ['calendar','date','schedule','event'],
      name:'Calendar / Date', icon:'📅',
      description:'Opens a date picker or calendar view.',
      howToUse:'Click to open the calendar. Click a date to select it.' },

    { keys: ['attach','paperclip','file','document','pdf'],
      name:'File / Attachment', icon:'📎',
      description:'Represents a file or attachment.',
      howToUse:'Click to open, download, or preview the file.' },

    { keys: ['map','location','pin','marker','gps','directions'],
      name:'Map / Location', icon:'📍',
      description:'Shows a location on a map or opens map directions.',
      howToUse:'Click to view the location on a map or get directions.' },

    { keys: ['camera','photo','image','picture','screenshot'],
      name:'Camera / Photo', icon:'📷',
      description:'Takes a photo, opens the camera, or lets you upload an image.',
      howToUse:'Click to open the camera or image picker.' },

    { keys: ['message','chat','comment','reply','bubble'],
      name:'Message / Chat', icon:'💬',
      description:'Opens a chat, comment section, or messaging interface.',
      howToUse:'Click to read or write messages.' },

    { keys: ['email','mail','envelope','inbox'],
      name:'Email', icon:'✉️',
      description:'Composes an email or opens your inbox.',
      howToUse:'Click to open your email or start composing a new message.' },

    { keys: ['lock','secure','password','privacy'],
      name:'Lock / Security', icon:'🔒',
      description:'Indicates a secure connection or locked content.',
      howToUse:'Locked content may require a password or login to access.' },

    { keys: ['tag','label','category','badge'],
      name:'Tag / Label', icon:'🏷️',
      description:'A category tag or label for this item.',
      howToUse:'Click to filter by this tag or see related items.' },

    { keys: ['star','rating','review','score'],
      name:'Rating / Star', icon:'⭐',
      description:'A star rating or review score.',
      howToUse:'Click a star to submit your rating.' },

    { keys: ['checkbox','check','tick','done','complete'],
      name:'Checkbox', icon:'✅',
      description:'A checkbox to mark an item as selected or completed.',
      howToUse:'Click to check or uncheck this item.' },

    { keys: ['link','chain','url','hyperlink'],
      name:'Link', icon:'🔗',
      description:'A hyperlink to another page or resource.',
      howToUse:'Click to navigate to the linked page. Right-click to open in a new tab.' },
  ];

  // ── Keyword matcher ────────────────────────────────────────────────────────
  function matchKeywords(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    for (const entry of ICON_DICT) {
      if (entry.keys.some(k => lower.includes(k))) {
        return entry;
      }
    }
    return null;
  }

  // ── Result builder ─────────────────────────────────────────────────────────
  function buildResult(entry, confidence, source) {
    if (!entry) return null;
    return {
      name:        entry.name,
      description: entry.description,
      howToUse:    entry.howToUse,
      icon:        entry.icon || '💡',
      confidence,
      source,
    };
  }

  // ── Generic guidance when no dictionary match ──────────────────────────────
  function genericGuidance(label) {
    return {
      description: `An element labelled "${capitalise(label)}".`,
      howToUse:    'Click to interact with this element.',
    };
  }

  function capitalise(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
  }

})();

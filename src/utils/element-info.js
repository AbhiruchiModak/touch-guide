/**
 * element-info.js
 *
 * Extracts human-readable information from any DOM element.
 *
 * ── How web accessibility labels work (beginner) ───────────────────────────
 * Just like Android's contentDescription, the web has ARIA attributes:
 *
 *   <button aria-label="Search">🔍</button>
 *                 ↑ this is the label!
 *
 * We also use semantic HTML to infer purpose:
 *   <input type="email"> → "Email address field"
 *   <nav>                → "Navigation menu"
 *   <a href="...">       → "Link"
 *
 * Priority order (best → worst):
 *   1. aria-label / aria-labelledby
 *   2. title attribute
 *   3. placeholder (for inputs)
 *   4. alt text (for images)
 *   5. visible text content
 *   6. Inferred from tag + type
 * ──────────────────────────────────────────────────────────────────────────
 */

const ElementInfo = (() => {
  'use strict';

  return { extract };

  /**
   * Main entry point.
   * @param {Element} el  The DOM element the user clicked
   * @returns {Object|null}  Info object, or null if nothing useful found
   */
  function extract(el) {
    if (!el || el === document.body || el === document.documentElement) return null;

    // Walk up the DOM tree a bit — the user might click a child icon
    // inside a button, so we check the element AND its closest meaningful ancestor
    const meaningful = findMeaningfulAncestor(el);
    const target = meaningful || el;

    const name        = extractName(target);
    const role        = extractRole(target);
    const { description, howToUse } = buildGuidance(target, name, role);
    const icon        = pickIcon(target, role);
    const confidence  = name ? 0.9 : 0.4;
    const source      = detectSource(target, name);

    if (!name && !role) return null;

    return {
      name:       name || roleToName(role) || 'Web Element',
      description,
      howToUse,
      icon,
      confidence,
      source,
      role,
      tagName:    target.tagName?.toLowerCase(),
    };
  }

  // ── Name extraction ────────────────────────────────────────────────────────
  function extractName(el) {
    // 1. aria-label (explicit, highest priority)
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel?.trim()) return ariaLabel.trim();

    // 2. aria-labelledby (points to another element's text)
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl?.textContent?.trim()) return labelEl.textContent.trim();
    }

    // 3. title attribute
    const title = el.getAttribute('title');
    if (title?.trim()) return title.trim();

    // 4. alt text (images)
    if (el.tagName === 'IMG') {
      const alt = el.getAttribute('alt');
      if (alt?.trim()) return alt.trim();
    }

    // 5. placeholder (inputs)
    const placeholder = el.getAttribute('placeholder');
    if (placeholder?.trim()) return placeholder.trim();

    // 6. <label> element pointing to this input via 'for' attribute
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label?.textContent?.trim()) return label.textContent.trim().replace(/\s+/g,' ');
    }

    // 7. Wrapping <label>
    const parentLabel = el.closest('label');
    if (parentLabel) {
      const txt = parentLabel.textContent?.trim().replace(/\s+/g,' ');
      if (txt) return txt.slice(0, 60);
    }

    // 8. Visible text content (buttons, links, etc.)
    const text = el.textContent?.trim().replace(/\s+/g,' ');
    if (text && text.length <= 80) return text;

    // 9. value attribute (submit buttons)
    const value = el.getAttribute('value');
    if (value?.trim() && el.tagName === 'INPUT') return value.trim();

    // 10. name or id as last resort
    const name = el.getAttribute('name') || el.id;
    if (name?.trim()) return name.replace(/[-_]/g,' ').trim();

    return null;
  }

  // ── Role / semantic type ───────────────────────────────────────────────────
  function extractRole(el) {
    // Explicit ARIA role
    const ariaRole = el.getAttribute('role');
    if (ariaRole) return ariaRole;

    const tag  = el.tagName?.toLowerCase();
    const type = el.getAttribute('type')?.toLowerCase();

    // Map HTML elements to roles
    const roleMap = {
      'a':          'link',
      'button':     'button',
      'input':      inputRole(type),
      'select':     'combobox',
      'textarea':   'textbox',
      'nav':        'navigation',
      'header':     'banner',
      'footer':     'contentinfo',
      'main':       'main',
      'aside':      'complementary',
      'article':    'article',
      'section':    'region',
      'form':       'form',
      'table':      'table',
      'img':        'img',
      'video':      'video',
      'audio':      'audio',
      'details':    'disclosure',
      'dialog':     'dialog',
      'search':     'search',
      'figure':     'figure',
      'h1':'heading','h2':'heading','h3':'heading',
      'h4':'heading','h5':'heading','h6':'heading',
      'ul':'list','ol':'list','li':'listitem',
      'progress': 'progressbar',
      'meter':    'meter',
    };

    return roleMap[tag] || (el.onclick || el.getAttribute('tabindex') !== null ? 'interactive' : null);
  }

  function inputRole(type) {
    const map = {
      'text':     'textbox',
      'email':    'textbox',
      'password': 'textbox',
      'search':   'searchbox',
      'number':   'spinbutton',
      'range':    'slider',
      'checkbox': 'checkbox',
      'radio':    'radio',
      'file':     'fileupload',
      'submit':   'button',
      'reset':    'button',
      'button':   'button',
      'color':    'colorpicker',
      'date':     'datepicker',
      'time':     'timepicker',
    };
    return map[type] || 'textbox';
  }

  // ── Guidance builder ───────────────────────────────────────────────────────
  function buildGuidance(el, name, role) {
    const tag  = el.tagName?.toLowerCase();
    const type = el.getAttribute('type')?.toLowerCase();
    const href = el.getAttribute('href');
    const isDisabled = el.disabled || el.getAttribute('aria-disabled') === 'true';

    // Disabled state override
    if (isDisabled) {
      return {
        description: `"${name || 'This element'}" is currently disabled and cannot be interacted with.`,
        howToUse:    'This option is unavailable right now. It may become active based on other choices you make on this page.',
      };
    }

    switch (role) {
      case 'button':
      case 'menuitem':
        return {
          description: `A button labelled "${name}". Clicking it will trigger an action on this page.`,
          howToUse:    'Click once to activate. If nothing happens, look for a confirmation dialog that may have appeared.',
        };

      case 'link':
        return {
          description: href?.startsWith('#')
            ? `An in-page link that jumps to a different section of this page.`
            : `A hyperlink labelled "${name}" that navigates to another page or website.`,
          howToUse: href?.startsWith('#')
            ? 'Click to jump to that section of the page. Use the browser Back button to return.'
            : 'Click to navigate. Right-click → "Open in new tab" to keep this page open.',
        };

      case 'textbox':
      case 'searchbox': {
        const inputType = type || 'text';
        const typeMap = {
          'email':    'Enter your email address (e.g. you@example.com).',
          'password': 'Type your password. Characters will be hidden as dots.',
          'search':   'Type keywords to search. Press Enter or click the Search button.',
          'number':   'Enter a number. You can also use the up/down arrows.',
          'url':      'Enter a web address (e.g. https://example.com).',
          'tel':      'Enter a phone number.',
        };
        return {
          description: `A text input field${name ? ` for "${name}"` : ''}.`,
          howToUse:    typeMap[inputType] || 'Click to focus, then type your input. Press Tab to move to the next field.',
        };
      }

      case 'checkbox':
        return {
          description: `A checkbox${name ? ` for "${name}"` : ''}. ${el.checked ? 'Currently checked (ON).' : 'Currently unchecked (OFF).'}`,
          howToUse:    'Click to toggle between checked and unchecked. A checkmark means it\'s selected/enabled.',
        };

      case 'radio':
        return {
          description: `A radio button${name ? ` for option "${name}"` : ''}. Radio buttons are part of a group — selecting one deselects the others.`,
          howToUse:    'Click to select this option. Only one option in the group can be selected at a time.',
        };

      case 'combobox': {
        const options = Array.from(el.options || []).map(o => o.text).slice(0,4).join(', ');
        return {
          description: `A dropdown list${name ? ` labelled "${name}"` : ''}${options ? `. Options include: ${options}…` : ''}.`,
          howToUse:    'Click the dropdown arrow to see all options. Click an option to select it.',
        };
      }

      case 'slider':
        return {
          description: `A slider${name ? ` for "${name}"` : ''} to set a value within a range.`,
          howToUse:    'Click and drag the handle left or right to change the value. You can also use the arrow keys after clicking it.',
        };

      case 'img':
      case 'figure':
        return {
          description: name
            ? `An image of "${name}".`
            : 'A decorative image with no text description.',
          howToUse: el.onclick || el.closest('a')
            ? 'This image is clickable — click to follow the link or see a larger version.'
            : 'This is a display image. There is no action associated with it.',
        };

      case 'navigation':
        return {
          description: 'The site navigation menu. Contains links to different sections or pages of this website.',
          howToUse:    'Click any link in this menu to navigate to that section of the website.',
        };

      case 'heading':
        return {
          description: `A heading: "${name}". Headings divide content into sections and help you skim the page.`,
          howToUse:    'Headings are usually not interactive. They label the content that follows them.',
        };

      case 'progressbar':
        return {
          description: `A progress bar showing completion or loading status.`,
          howToUse:    'This is informational — no interaction needed. Wait for it to complete.',
        };

      case 'fileupload':
        return {
          description: 'A file upload button. Lets you choose a file from your computer to upload.',
          howToUse:    'Click to open a file browser. Select the file you want to upload, then click Open.',
        };

      case 'form':
        return {
          description: 'A form. Contains fields you fill in and submit to send data (e.g. login, registration, contact).',
          howToUse:    'Fill in each field, then click the Submit or Send button at the bottom of the form.',
        };

      case 'video':
        return {
          description: `A video player${name ? ` showing "${name}"` : ''}.`,
          howToUse:    'Click the play button (▶) to start. Use the bottom controls to pause, seek, adjust volume, or go fullscreen.',
        };

      case 'audio':
        return {
          description: `An audio player${name ? ` for "${name}"` : ''}.`,
          howToUse:    'Click play (▶) to listen. Use the controls to pause or adjust volume.',
        };

      case 'dialog':
        return {
          description: 'A dialog box (popup). It requires your attention or action before you can continue.',
          howToUse:    'Read the message, then click the appropriate button (OK, Cancel, Close, etc.) to dismiss it.',
        };

      default:
        if (name) {
          return {
            description: `A web element labelled "${name}".`,
            howToUse:    el.tabIndex >= 0 || el.onclick
              ? 'This element appears to be interactive. Try clicking it.'
              : 'This element is likely for display only.',
          };
        }
        return {
          description: `A <${tag}> HTML element.`,
          howToUse:    'This element may not have a specific interaction. Look at surrounding content for context.',
        };
    }
  }

  // ── Icon picker ────────────────────────────────────────────────────────────
  function pickIcon(el, role) {
    const iconMap = {
      'button':       '🔘',
      'link':         '🔗',
      'textbox':      '✏️',
      'searchbox':    '🔍',
      'checkbox':     el?.checked ? '☑️' : '⬜',
      'radio':        el?.checked ? '🔵' : '⚪',
      'combobox':     '📋',
      'slider':       '🎚️',
      'img':          '🖼️',
      'figure':       '🖼️',
      'navigation':   '🗺️',
      'heading':      '📌',
      'progressbar':  '⏳',
      'fileupload':   '📁',
      'form':         '📝',
      'video':        '▶️',
      'audio':        '🔊',
      'dialog':       '💬',
      'banner':       '🏠',
      'contentinfo':  'ℹ️',
      'list':         '📄',
      'table':        '📊',
      'interactive':  '👆',
    };
    return iconMap[role] || '💡';
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function findMeaningfulAncestor(el) {
    const meaningful = ['A','BUTTON','INPUT','SELECT','TEXTAREA',
                        'LABEL','NAV','HEADER','FOOTER','FORM',
                        'DETAILS','DIALOG','VIDEO','AUDIO'];
    let current = el.parentElement;
    for (let i = 0; i < 4 && current; i++, current = current.parentElement) {
      if (meaningful.includes(current.tagName)) return current;
    }
    return null;
  }

  function roleToName(role) {
    const map = {
      'navigation':  'Navigation Menu',
      'banner':      'Page Header',
      'contentinfo': 'Page Footer',
      'main':        'Main Content Area',
      'form':        'Form',
      'table':       'Data Table',
    };
    return map[role] || null;
  }

  function detectSource(el, name) {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return 'aria';
    if (name && el.tagName) return 'semantic';
    return 'heuristic';
  }

})();

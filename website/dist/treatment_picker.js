/* Progressive treatment disclosure picker. The native select owns value/events. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TreatmentPicker = factory();
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';
  const instances = new WeakMap();
  let serial = 0;
  const normalized = (value) => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

  class Picker {
    constructor(select) {
      this.select = select; this.doc = select.ownerDocument; this.win = this.doc.defaultView || {};
      this.expanded = new Set(); this.searchCollapsed = new Set(); this.nodes = []; this.roots = [];
      this.cleanups = []; this.opened = false; this.destroyed = false;
      this.original = { hidden: select.hidden, tabIndex: select.getAttribute('tabindex'), ariaHidden: select.getAttribute('aria-hidden') };
      const id = (select.id || 'treatment') + '-picker-' + (++serial);
      this.root = this.make('div', 'treatment-picker');
      this.trigger = this.make('button', 'treatment-picker-trigger', this.root); this.trigger.type = 'button';
      this.trigger.id = id + '-trigger';
      this.caption = this.make('span', 'treatment-picker-value', this.trigger); this.caption.id = id + '-value';
      const arrow = this.make('span', 'treatment-picker-arrow', this.trigger); arrow.setAttribute('aria-hidden', 'true');
      const label = select.labels?.[0] || this.doc.getElementById?.(select.id + '-label');
      this.name = (label?.textContent || select.getAttribute('aria-label') || 'Treatment').trim();
      let labelId;
      if (label) {
        labelId = label.id;
        if (!labelId) { labelId = id + '-label'; label.id = labelId; this.assignedLabel = label; }
        this.listen(label, 'click', (event) => { if (!select.disabled) { event.preventDefault(); this.trigger.focus(); } });
      } else {
        const text = this.make('span', 'sr-only', this.root); text.textContent = this.name; text.id = id + '-label'; labelId = text.id;
      }
      this.trigger.setAttribute('aria-labelledby', labelId + ' ' + this.caption.id);
      this.trigger.setAttribute('aria-haspopup', 'dialog'); this.trigger.setAttribute('aria-expanded', 'false');
      this.popup = this.make('div', 'treatment-picker-popup', this.root); this.popup.id = id + '-popup'; this.popup.hidden = true;
      this.popup.setAttribute('role', 'dialog'); this.popup.setAttribute('aria-labelledby', labelId);
      this.trigger.setAttribute('aria-controls', this.popup.id);
      this.search = this.make('input', 'treatment-picker-search', this.popup); this.search.type = 'search';
      this.search.placeholder = 'Search treatments'; this.search.setAttribute('aria-label', 'Search ' + this.name.toLowerCase() + ' options');
      this.list = this.make('ul', 'treatment-picker-list', this.popup); this.list.id = id + '-choices'; this.search.setAttribute('aria-controls', this.list.id);
      this.status = this.make('p', 'treatment-picker-status', this.popup); this.status.setAttribute('role', 'status');
      this.status.setAttribute('aria-live', 'polite');
      select.parentNode.insertBefore(this.root, select.nextSibling);
      select.hidden = true; select.setAttribute('tabindex', '-1'); select.setAttribute('aria-hidden', 'true');
      this.listen(this.trigger, 'click', () => this.opened ? this.close(true) : this.open());
      this.listen(this.trigger, 'keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); this.open(); this.focusEdge(event.key === 'ArrowUp');
        }
      });
      this.listen(this.search, 'input', () => { this.searchCollapsed.clear(); this.render(); this.position(); });
      this.listen(this.search, 'keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); this.focusEdge(event.key === 'ArrowUp'); }
        if (event.key === 'Enter') {
          event.preventDefault();
          const found = this.nodes.find((node) => node.directMatch && node.displayed && !node.choice.disabled);
          if (normalized(this.search.value) && found) this.choose(found.entry.value); else this.focusEdge(false);
        }
      });
      this.listen(this.root, 'keydown', (event) => { if (event.key === 'Escape' && this.opened) { event.preventDefault(); event.stopPropagation(); this.close(true); } });
      this.listen(this.doc, 'pointerdown', (event) => { if (this.opened && !this.root.contains(event.target)) this.close(false); });
      this.listen(this.doc, 'focusin', (event) => { if (this.opened && !this.root.contains(event.target)) this.close(false); });
      this.listen(this.doc, 'keydown', (event) => { if (this.opened && event.key === 'Escape') { event.preventDefault(); this.close(true); } });
      this.listen(select, 'change', () => this.sync());
      this.listen(this.doc, 'scroll', () => this.position(), true);
      if (typeof this.win.addEventListener === 'function') this.listen(this.win, 'resize', () => this.position());
      if (typeof this.win.MutationObserver === 'function') {
        this.observer = new this.win.MutationObserver(() => this.sync());
        this.observer.observe(select, { attributes: true, childList: true, subtree: true, characterData: true });
      }
      this.refresh([], select.options?.[0]?.textContent || 'All treatments');
    }

    make(tag, name, parent) { const node = this.doc.createElement(tag); node.className = name; if (parent) parent.appendChild(node); return node; }
    listen(target, type, callback, capture) { target.addEventListener(type, callback, capture); this.cleanups.push(() => target.removeEventListener(type, callback, capture)); }
    cacheOptions() {
      this.nativeOptions = new Map(); this.enabledOptions = new Map();
      for (const option of Array.from(this.select.options || [])) {
        if (!this.nativeOptions.has(option.value)) this.nativeOptions.set(option.value, option);
        if (!option.disabled && !option.parentNode?.disabled && !this.enabledOptions.has(option.value)) this.enabledOptions.set(option.value, option);
      }
    }
    option(value) { return this.enabledOptions.get(value); }

    refresh(tree, placeholder) {
      if (this.destroyed) return this;
      this.placeholder = placeholder || 'All treatments'; this.nodes = []; this.roots = []; this.labels = new Map();
      const stack = [];
      for (const entry of Array.isArray(tree) ? tree : []) {
        if (!entry || typeof entry.value !== 'string' || typeof entry.label !== 'string') continue;
        if (!this.labels.has(entry.value)) this.labels.set(entry.value, entry.label);
        if (entry.hidden === true || !entry.value) continue;
        const depth = Number.isInteger(entry.depth) && entry.depth >= 0 ? Math.min(entry.depth, 16) : 0;
        while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
        const parent = stack[stack.length - 1] || null;
        const family = entry.class_id && !entry.class_id.startsWith('agent:') ? entry.class_id : parent?.family || 'other';
        const node = { entry, depth, parent, children: [], key: String(this.nodes.length), family };
        (parent ? parent.children : this.roots).push(node); this.nodes.push(node); stack.push(node);
      }
      this.expanded.clear(); this.searchCollapsed.clear(); this.render(); this.sync(); return this;
    }

    render() {
      this.cacheOptions();
      const query = normalized(this.search.value), previousScroll = this.list.scrollTop;
      const scan = (node, ancestorMatch) => {
        node.directMatch = !!query && normalized(node.entry.label + ' ' + node.entry.value + ' ' + (node.entry.class_id || '') + ' ' + (node.entry.search_text || '')).includes(query);
        node.children.forEach((child) => scan(child, ancestorMatch || node.directMatch));
        node.visible = !query || ancestorMatch || node.directMatch || node.children.some((child) => child.visible);
        node.open = query ? node.children.some((child) => child.visible) && !this.searchCollapsed.has(node.key) : this.expanded.has(node.key);
      };
      this.roots.forEach((node) => scan(node, false));
      this.list.textContent = ''; this.visibleChoices = [];
      const all = this.make('li', 'treatment-picker-all', this.list);
      this.allChoice = this.make('button', 'treatment-picker-choice', all); this.allChoice.type = 'button'; this.allChoice.textContent = this.placeholder;
      this.allChoice.disabled = this.select.disabled || !this.option(''); this.allChoice.setAttribute('aria-pressed', String(!this.select.value));
      this.allChoice.addEventListener('click', () => this.choose('')); this.allChoice.addEventListener('keydown', (event) => this.key(event, null));
      this.visibleChoices.push(this.allChoice);
      const draw = (node, parent, displayed) => {
        const li = this.make('li', 'treatment-picker-node', parent); li.hidden = !node.visible; li.setAttribute('data-family', node.family); li.setAttribute('data-treatment-class', node.family);
        const row = this.make('div', 'treatment-picker-row', li);
        const choice = node.choice = this.make('button', 'treatment-picker-choice', row); choice.type = 'button';
        choice.textContent = node.entry.label; choice.id = this.list.id + '-' + node.key;
        choice.disabled = this.select.disabled || !this.option(node.entry.value);
        choice.setAttribute('aria-pressed', String(this.select.value === node.entry.value));
        choice.addEventListener('click', () => this.choose(node.entry.value)); choice.addEventListener('keydown', (event) => this.key(event, node));
        node.displayed = displayed && node.visible;
        if (node.displayed) this.visibleChoices.push(choice);
        if (node.children.length) {
          const toggle = node.toggle = this.make('button', 'treatment-picker-toggle', row); toggle.type = 'button';
          const children = this.make('ul', 'treatment-picker-children', li); children.id = choice.id + '-children'; children.hidden = !node.open;
          children.setAttribute('aria-labelledby', choice.id);
          toggle.setAttribute('aria-label', (node.open ? 'Collapse ' : 'Expand ') + node.entry.label);
          toggle.setAttribute('aria-expanded', String(node.open)); toggle.setAttribute('aria-controls', children.id);
          const icon = this.make('span', 'treatment-picker-chevron', toggle); icon.setAttribute('aria-hidden', 'true');
          toggle.addEventListener('click', () => this.toggle(node, true));
          toggle.addEventListener('keydown', (event) => { if (['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(event.key)) this.key(event, node); });
          node.children.forEach((child) => draw(child, children, node.displayed && node.open));
        }
      };
      this.roots.forEach((node) => draw(node, this.list, true));
      this.list.scrollTop = previousScroll;
      this.status.textContent = query && !this.nodes.some((node) => node.visible) ? 'No matching treatments.' : 'Select a category or expand it to choose a treatment.';
    }

    sync() {
      if (this.destroyed) return this;
      this.cacheOptions();
      const value = this.select.value, native = this.nativeOptions.get(value);
      const label = value ? this.labels.get(value) || native?.textContent?.trim() || this.placeholder : this.placeholder;
      this.caption.textContent = label; this.trigger.title = label; this.trigger.disabled = !!this.select.disabled;
      this.allChoice.disabled = this.select.disabled || !this.option(''); this.allChoice.setAttribute('aria-pressed', String(!value));
      for (const node of this.nodes) {
        node.choice.disabled = this.select.disabled || !this.option(node.entry.value);
        node.choice.setAttribute('aria-pressed', String(value === node.entry.value));
        if (node.toggle) node.toggle.disabled = !!this.select.disabled;
      }
      if (this.select.disabled) this.close(false); return this;
    }

    open() {
      if (this.destroyed || this.select.disabled || this.opened) return;
      this.opened = true; this.expanded.clear(); this.searchCollapsed.clear(); this.search.value = ''; this.render();
      this.popup.hidden = false; this.trigger.setAttribute('aria-expanded', 'true'); this.position(); this.search.focus();
    }
    close(restoreFocus) {
      this.opened = false; this.popup.hidden = true; this.trigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus && !this.select.disabled && !this.destroyed) this.trigger.focus();
    }
    choose(value) {
      this.cacheOptions();
      if (this.select.disabled || !this.option(value)) return;
      const changed = this.select.value !== value; this.select.value = value; this.close(true);
      if (changed) this.select.dispatchEvent(new this.win.Event('change', { bubbles: true }));
      this.sync();
    }
    toggle(node, disclosure) {
      if (this.select.disabled) return;
      const set = normalized(this.search.value) ? this.searchCollapsed : this.expanded;
      if (normalized(this.search.value)) node.open ? set.add(node.key) : set.delete(node.key);
      else node.open ? set.delete(node.key) : set.add(node.key);
      this.render(); this.position(); (disclosure ? node.toggle : node.choice).focus();
    }
    focusEdge(last) { const choices = this.visibleChoices.filter((choice) => !choice.disabled); (last ? choices[choices.length - 1] : choices[0])?.focus(); }
    key(event, node) {
      const choices = this.visibleChoices.filter((choice) => !choice.disabled), at = choices.indexOf(node ? node.choice : this.allChoice);
      const key = event.key;
      if (['ArrowDown','ArrowUp','Home','End'].includes(key)) {
        event.preventDefault(); const index = key === 'Home' ? 0 : key === 'End' ? choices.length - 1 : Math.max(0, Math.min(choices.length - 1, at + (key === 'ArrowDown' ? 1 : -1)));
        choices[index]?.focus(); choices[index]?.scrollIntoView?.({ block: 'nearest' });
      } else if (key === 'ArrowRight' && node?.children.length) {
        event.preventDefault(); if (!node.open) this.toggle(node, false); else node.children.find((child) => child.displayed && !child.choice.disabled)?.choice.focus();
      } else if (key === 'ArrowLeft' && node) {
        event.preventDefault(); if (node.children.length && node.open) this.toggle(node, false); else node.parent?.choice.focus();
      } else if (key === 'Enter' || key === ' ') { event.preventDefault(); this.choose(node ? node.entry.value : ''); }
    }
    position() {
      if (!this.opened) return;
      const rect = this.trigger.getBoundingClientRect(), width = this.win.innerWidth || 1024, height = this.win.innerHeight || 768;
      const popupWidth = Math.min(Math.max(rect.width, 320), Math.max(1, width - 24));
      const below = height - rect.bottom - 20, above = rect.top - 20, up = below < 240 && above > below;
      const maxHeight = Math.max(80, Math.min(480, up ? above : below));
      Object.assign(this.popup.style, { width: popupWidth + 'px', maxHeight: maxHeight + 'px',
        left: Math.max(12, Math.min(rect.left, width - popupWidth - 12)) + 'px',
        top: Math.max(12, up ? rect.top - 8 - Math.min(maxHeight, this.popup.scrollHeight || maxHeight) : rect.bottom + 8) + 'px' });
    }
    destroy() {
      if (this.destroyed) return;
      this.close(false); this.destroyed = true; this.cleanups.forEach((cleanup) => cleanup()); this.observer?.disconnect();
      this.root.parentNode?.removeChild(this.root); this.select.hidden = this.original.hidden;
      for (const [attribute, value] of [['tabindex',this.original.tabIndex],['aria-hidden',this.original.ariaHidden]]) value === null ? this.select.removeAttribute(attribute) : this.select.setAttribute(attribute,value);
      if (this.assignedLabel) this.assignedLabel.removeAttribute('id'); instances.delete(this.select);
    }
  }

  function enhance(select) {
    if (!select || String(select.tagName).toUpperCase() !== 'SELECT' || !select.ownerDocument ||
        typeof select.ownerDocument.createElement !== 'function' || typeof select.ownerDocument.addEventListener !== 'function' ||
        typeof select.addEventListener !== 'function' || typeof select.parentNode?.insertBefore !== 'function' ||
        typeof select.ownerDocument.defaultView?.Event !== 'function') return null;
    if (!instances.has(select)) instances.set(select, new Picker(select));
    return instances.get(select);
  }
  return Object.freeze({ enhance });
});

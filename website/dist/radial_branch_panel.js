/* Presentation of a selected regimen and its eligible comparators. The caller
   supplies the current study, pooled, or network result in left/right order. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./radial_branch_family.js'));
  else root.RadialBranchPanel = factory(root.RadialBranchFamily);
})(typeof globalThis === 'undefined' ? this : globalThis, function (Family) {
  'use strict';

  const panels = new WeakMap();

  const measureNulls = new Map([
    ['HR', 1], ['HAZARD RATIO', 1], ['RR', 1], ['RISK RATIO', 1], ['OR', 1], ['ODDS RATIO', 1],
    ['RD', 0], ['RISK DIFFERENCE', 0], ['MD', 0], ['MEAN DIFFERENCE', 0], ['SMD', 0],
    ['STANDARDIZED MEAN DIFFERENCE', 0], ['RMSTD', 0], ['RMST DIFFERENCE', 0], ['RESTRICTED MEAN SURVIVAL TIME DIFFERENCE', 0],
  ]);

  // Orient an existing result for the sign without changing its scientific fit.
  function orientComparison(fit, endpoint, leftIsNumerator) {
    if (!fit || fit.valid === false || fit.available === false || !Number.isFinite(fit.estimate)
      || !['lower', 'higher'].includes(endpoint?.polarity) || typeof leftIsNumerator !== 'boolean') return null;
    const measure = String(endpoint.measure || fit.measure || '').toUpperCase().replace(/[_-]/g, ' ').trim();
    const expectedNull = measureNulls.get(measure);
    const nullValue = endpoint.nullValue ?? expectedNull;
    if (![0, 1].includes(nullValue) || (expectedNull !== undefined && expectedNull !== nullValue)) return null;
    const ratio = nullValue === 1;
    if (ratio && fit.estimate < 0) return null;
    const reverse = value => ratio ? 1 / value : -value;
    const estimate = leftIsNumerator ? fit.estimate : reverse(fit.estimate);
    if (!Number.isFinite(estimate)) return null;
    let lower = fit.ci_lower, upper = fit.ci_upper;
    if (fit.ci_valid === false || fit.ci_95_unavailable || !Number.isFinite(lower) || !Number.isFinite(upper)
      || lower >= upper || lower > fit.estimate || upper < fit.estimate || (ratio && lower < 0)) {
      lower = upper = null;
    } else if (!leftIsNumerator) {
      [lower, upper] = [reverse(upper), reverse(lower)];
      if (!Number.isFinite(lower) || !Number.isFinite(upper)) lower = upper = null;
    }
    return { estimate, lower, upper, nullValue, higherFavorsLeft: endpoint.polarity === 'higher' };
  }

  function comparisonSign(result) {
    if (!result) return null;
    const { estimate, lower, upper, nullValue, higherFavorsLeft } = result;
    if (!Number.isFinite(estimate) || ![0, 1].includes(nullValue) || typeof higherFavorsLeft !== 'boolean') return null;
    if (nullValue === 1 && estimate < 0) return null;
    if (estimate === nullValue) return { symbol: '–', filled: false, caption: 'At the null' };

    const symbol = (estimate > nullValue) === higherFavorsLeft ? '>' : '<';
    const hasInterval = Number.isFinite(lower) && Number.isFinite(upper) && lower < upper
      && (nullValue === 0 || lower >= 0);
    if (!hasInterval) return { symbol, filled: false, caption: 'CI unavailable' };
    const filled = upper < nullValue || lower > nullValue;
    return { symbol, filled, caption: filled ? 'Statistically significant' : 'Point estimate' };
  }

  function renderSign(view, host, sign, left, right) {
    host.replaceChildren();
    host.hidden = !sign;
    if (!sign) {
      host.removeAttribute('data-symbol');
      host.removeAttribute('data-filled');
      return;
    }
    const { symbol, caption, filled } = sign;
    const svg = view.svgElement('svg', { viewBox: '0 0 60 60', class: 'rb-comparison-symbol', 'aria-hidden': 'true' }, host);
    if (symbol === '–') {
      view.svgElement('path', { d: 'M12 30H48', fill: 'none', stroke: 'currentColor', 'stroke-width': 5 }, svg);
    } else {
      view.svgElement('path', {
        d: 'M12 6L50 26V34L12 54V43L38 30L12 17Z',
        transform: symbol === '<' ? 'translate(60 0) scale(-1 1)' : '',
        fill: filled ? 'currentColor' : 'none', stroke: 'currentColor',
        'stroke-width': 2, 'stroke-linejoin': 'round',
      }, svg);
    }
    host.setAttribute('data-symbol', symbol);
    host.setAttribute('data-filled', String(filled));
    const description = symbol === '–' ? 'Neither regimen is favored.' : 'Favors ' + (symbol === '>' ? left : right) + '.';
    view.make('span', 'rb-reader-only', host, description + ' ');
    view.make('span', 'rb-sign-caption', host, caption);
  }

  function build(view, host) {
    host.replaceChildren();
    const workspace = view.make('div', 'rb-comparison-workspace', host);
    workspace.tabIndex = 0;
    workspace.setAttribute('role', 'region');
    workspace.setAttribute('aria-label', 'Treatment family and comparators');
    const grid = view.make('div', 'rb-comparison-grid', workspace);
    const selected = view.make('div', 'rb-selection', grid);
    view.make('span', 'rb-panel-label', selected, 'Selected regimen');
    const title = view.make('h3', 'rb-regimen-name', selected);
    const counts = view.make('p', 'rb-regimen-counts', selected);
    const family = view.make('div', 'rb-family-host', grid);
    const sign = view.make('div', 'rb-comparison-sign', grid);
    sign.setAttribute('role', 'status');
    sign.setAttribute('aria-atomic', 'true');
    const sidebar = view.make('section', 'rb-comparators', grid);
    view.make('h3', 'rb-panel-label', sidebar, 'Comparators');
    const list = view.make('div', 'rb-comparator-list', sidebar);
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Comparator regimens');
    list.setAttribute('aria-orientation', 'vertical');
    const message = view.make('p', 'rb-list-status', sidebar);
    message.setAttribute('role', 'status');
    const legendHost = view.make('ul', 'rb-family-legend', host);
    const panel = { workspace, title, counts, family, sign, list, message, legendHost, buttons: new Map(), choices: [] };
    panels.set(host, panel);
    return panel;
  }

  function choiceKey(choice) { return choice.kind + '|' + choice.id; }

  function updateList(view, panel, options, active) {
    const { comparators, loading, selected, mode, onComparator } = options;
    const list = panel.list;
    panel.onComparator = onComparator;
    const scopeChanged = panel.scope !== selected.id + '|' + mode;
    const changed = scopeChanged || comparators.length !== panel.choices.length || comparators.some((c, i) => {
      const old = panel.choices[i];
      return c.id !== old.id || c.kind !== old.kind || c.label !== old.label;
    });
    const focusKey = view.doc.activeElement?.getAttribute?.('data-choice');
    const hadFocus = !!focusKey && panel.buttons.get(focusKey) === view.doc.activeElement;
    const activeKey = active && choiceKey(active);
    if (changed) {
      const scroll = scopeChanged ? 0 : list.scrollTop;
      list.replaceChildren();
      panel.buttons = new Map();
      panel.choices = comparators.slice();
      for (const [index, c] of comparators.entries()) {
        const key = choiceKey(c);
        const button = view.make('button', 'rb-comparator', list);
        button.type = 'button';
        button.setAttribute('role', 'option');
        button.setAttribute('data-choice', key);
        button.setAttribute('data-comparator-id', c.id);
        button.setAttribute('data-kind', c.kind);
        view.make('span', 'rb-comparator-kind', button, c.kind);
        view.make('span', 'rb-comparator-name', button, c.label);
        button.addEventListener('click', () => panel.onComparator(c.id, c.kind));
        button.addEventListener('keydown', event => {
          const last = comparators.length - 1;
          const indices = { ArrowDown: Math.min(last, index + 1), ArrowUp: Math.max(0, index - 1), Home: 0, End: last };
          if (!Object.hasOwn(indices, event.key)) return;
          event.preventDefault();
          const next = comparators[indices[event.key]];
          const target = panel.buttons.get(choiceKey(next));
          target.focus({ preventScroll: true });
          reveal(list, target);
          panel.onComparator(next.id, next.kind);
        });
        panel.buttons.set(key, button);
      }
      list.scrollTop = scroll || 0;
    }
    for (const [key, button] of panel.buttons) {
      button.setAttribute('aria-selected', String(key === activeKey));
      button.tabIndex = key === (activeKey || panel.buttons.keys().next().value) ? 0 : -1;
    }
    if (changed && hadFocus) {
      (panel.buttons.get(focusKey) || panel.buttons.get(activeKey) || panel.buttons.values().next().value)?.focus({ preventScroll: true });
    }
    if (active && (scopeChanged || activeKey !== panel.activeKey)) reveal(list, panel.buttons.get(activeKey));
    panel.activeKey = activeKey;
    panel.scope = selected.id + '|' + mode;
    list.hidden = !comparators.length;
    list.setAttribute('aria-busy', String(!!loading));
    panel.message.hidden = !!comparators.length && !loading;
    panel.message.textContent = loading ? 'Checking eligible comparators…' : !comparators.length ? 'No eligible comparators for this selection.' : '';
  }

  function reveal(scroller, item) {
    if (!item || !scroller.clientHeight || !item.getBoundingClientRect) return;
    const viewport = scroller.getBoundingClientRect(), row = item.getBoundingClientRect();
    if (row.top < viewport.top) scroller.scrollTop -= viewport.top - row.top;
    else if (row.bottom > viewport.bottom) scroller.scrollTop += row.bottom - viewport.bottom;
  }

  function render(view, host, options) {
    let panel = panels.get(host);
    if (!panel || panel.workspace.parentNode !== host) panel = build(view, host);
    const { selected, comparators, activeId, mode, comparison, onRegimen, studyLabel, countLabel } = options;
    const matches = comparators.filter(c => c.id === activeId);
    const active = matches.length === 1 ? matches[0] : matches.find(c => c.kind.toLowerCase() === mode?.toLowerCase());

    panel.title.textContent = selected.label;
    panel.counts.textContent = [studyLabel, countLabel].filter(Boolean).join(' · ');
    panel.counts.hidden = !panel.counts.textContent;
    panel.onRegimen = onRegimen;
    if (panel.selectedId !== selected.id || panel.tree !== view.tree || panel.advanced !== view.advanced ||
      panel.branchId !== view.branchId || panel.availableRegimens !== options.availableRegimens) {
      Family.render(view, panel.family, selected.id, id => panel.onRegimen(id), options.availableRegimens, panel.legendHost);
      panel.availableRegimens = options.availableRegimens;
      panel.selectedId = selected.id;
      panel.tree = view.tree;
      panel.advanced = view.advanced;
      panel.branchId = view.branchId;
    }
    updateList(view, panel, options, active);
    renderSign(view, panel.sign, active ? comparisonSign(comparison) : null, selected.label, active?.label);
  }

  return Object.freeze({ render, comparisonSign, orientComparison });
});

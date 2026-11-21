/* About-page review of discrepancies that still need adjudication. */
(function(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MetaComplementaryReview = api;
})(typeof window === 'undefined' ? null : window, function() {
  'use strict';
  const pageSize = 10;
  const definitions = [
    {key:'paper_conflicts', title:'Inconsistencies within papers', first:'source_a', second:'source_b', labels:['First passage','Second passage']},
    {key:'model_disagreements', title:'GPT and Opus discrepancies', first:'gpt', second:'opus', labels:['GPT extraction','Opus review']}
  ];
  function escape(value) {
    return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
  }
  function orderedRows(payload, definition) {
    const rows = payload?.[definition.key];
    if (payload?.schema_version !== 1 || !Array.isArray(rows)) throw Error('Could not read the saved review.');
    const fields = ['group','field',definition.first,definition.second,'recommendation'];
    for (const row of rows) {
      if (!row || !/^\d+$/.test(row.pmid) || fields.some(key => typeof row[key] !== 'string' || !row[key].trim()))
        throw Error('Incomplete saved review finding.');
    }
    return [...rows].sort((a,b) => a.group.localeCompare(b.group) || Number(a.pmid)-Number(b.pmid) || a.field.localeCompare(b.field));
  }
  function pageOf(rows, group, query, requested) {
    const matches = rows.filter(row => (!group || group === row.group) && String(row.pmid).includes(query.trim()));
    const pages = Math.ceil(matches.length/pageSize);
    const page = Math.max(0,Math.min(requested,pages-1));
    return {rows:matches.slice(page*pageSize,(page+1)*pageSize), total:matches.length, pages, page};
  }
  function tableHTML(rows, definition) {
    let previousGroup;
    const groups = [];
    for (const row of rows) {
      if (row.group !== previousGroup) {
        groups.push({group:row.group, body:[]});
        previousGroup = row.group;
      }
      const pmid = escape(row.pmid);
      const selected=row.main_text_side;
      const values = [row.field,row[definition.first],row[definition.second],selected?(row.main_text_value||'Use the main-text result.'):row.recommendation];
      groups[groups.length-1].body.push(`<tr><td><a href="https://pubmed.ncbi.nlm.nih.gov/${pmid}/" target="_blank" rel="noopener noreferrer">${pmid}</a></td>${values.map((value,i) => '<td>'+(!row.main_text_value&&((i===1&&selected===definition.first)||(i===2&&selected===definition.second))?'<strong>'+escape(value)+'</strong>':escape(value))+'</td>').join('')}</tr>`);
    }
    const bodies = groups.map(({group,body}) => `<tbody><tr><th scope="rowgroup" colspan="5">${escape(group)}</th></tr>${body.join('')}</tbody>`).join('');
    return `<table class="review-evidence-table" aria-label="${definition.title}"><thead><tr>${['PMID','Field',...definition.labels,definition.key==='paper_conflicts'?'Decision or review note':'Recommendation'].map(label => '<th scope="col">'+label+'</th>').join('')}</tr></thead>${bodies}</table>`;
  }
  function drawSection(section, definition, rows, previous) {
    const groups = [...new Set(rows.map(row => row.group))];
    section.className = 'panel evidence-review-section';
    const titleId = 'review-'+definition.key;
    section.setAttribute('aria-labelledby',titleId);
    section.innerHTML = `<h2 id="${titleId}">${definition.title}</h2>`;
    if (definition.key==='model_disagreements') section.insertAdjacentHTML('beforeend','<p>GPT values remain in use pending adjudication.</p>');
    if (!rows.length) {
      section.insertAdjacentHTML('beforeend','<p role="status">No findings awaiting review.</p>');
      return;
    }
    section.insertAdjacentHTML('beforeend',`<div class="review-controls"><label>Group <select><option value="">All groups</option>${groups.map(group => '<option>'+escape(group)+'</option>').join('')}</select></label><label>Find PMID <input type="search" inputmode="numeric" autocomplete="off"></label></div>
      <p class="review-count" role="status"></p><div class="published-review-scroll" role="region" aria-label="${definition.title} table" tabindex="0"></div>
      <div class="review-pagination"><button class="secondary-button" type="button" data-move="-1">Previous</button><button class="secondary-button" type="button" data-move="1">Next</button></div>`);
    const group = section.querySelector('select'), search = section.querySelector('input');
    const count = section.querySelector('.review-count'), table = section.querySelector('[role="region"]');
    const navigation = section.querySelector('.review-pagination');
    const buttons = [...navigation.querySelectorAll('button')];
    let page = previous?.page || 0;
    if (previous) {
      group.value = groups.includes(previous.group) ? previous.group : '';
      search.value = previous.query;
    }
    function render(requested) {
      const view = pageOf(rows,group.value,search.value,requested);
      page = view.page;
      const n = view.total.toLocaleString('en-US');
      const range = view.pages > 1 ? ' · '+(page*pageSize+1).toLocaleString('en-US')+'–'+(page*pageSize+view.rows.length).toLocaleString('en-US')+' shown' : '';
      count.textContent = view.total ? n+' '+(view.total===1?'finding':'findings')+range : 'No findings match this selection.';
      table.innerHTML = view.total ? tableHTML(view.rows,definition) : '';
      table.hidden = !view.total;
      navigation.hidden = view.pages <= 1;
      buttons[0].disabled = page === 0;
      buttons[1].disabled = page+1 >= view.pages;
    }
    group.addEventListener('change',()=>render(0));
    search.addEventListener('input',()=>render(0));
    for (const button of buttons) button.addEventListener('click',()=>render(page+Number(button.dataset.move)));
    render(page);
    return () => ({group:group.value, query:search.value, page});
  }
  function create(host) {
    let loaded = false, pending, previous = [];
    async function load(force=false) {
      if (pending || (loaded && !force)) return pending;
      pending = (async () => {
        try {
          const response = await fetch('./data/complementary_review.json',{cache:'no-cache'});
          if (!response.ok) throw Error('Saved review unavailable.');
          const payload = await response.json();
          const tables = definitions.map(def => orderedRows(payload,def));
          const sections = definitions.map(() => host.ownerDocument.createElement('section'));
          previous = definitions.map((def,i) => drawSection(sections[i],def,tables[i],previous[i]?.()));
          host.replaceChildren(...sections);
          loaded = true;
        } catch {
          // The article screening counts and contact remain usable independently.
          let message = host.querySelector('.review-load-error');
          if (!message) {
            message = host.ownerDocument.createElement('p');
            message.className = 'review-load-error';
            message.setAttribute('role','status');
            if (loaded) host.prepend(message); else host.replaceChildren(message);
          }
          message.innerHTML = 'The saved review tables could not be loaded. <button class="secondary-button" type="button">Try again</button>';
          message.querySelector('button').addEventListener('click',()=>load(true));
        } finally {
          pending = null;
        }
      })();
      return pending;
    }
    return {load};
  }
  return {create,orderedRows,pageOf,tableHTML,definitions};
});

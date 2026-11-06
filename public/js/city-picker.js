import { state, cityLabel, regionLabel } from './state.js';
import { openDialog, esc } from './ui.js';
import { t, getLang } from './i18n.js';
import { icon } from './icons.js';

const LAT = { а: 'a', ә: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', қ: 'k', л: 'l', м: 'm', н: 'n', ң: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ұ: 'u', ү: 'u', ф: 'f', х: 'kh', һ: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', і: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е').trim();
const translit = (s) => [...norm(s)].map((c) => LAT[c] ?? c).join('');
const collator = () => new Intl.Collator(getLang() === 'en' ? 'en' : getLang() === 'ru' ? 'ru' : 'kk');

/** Қаланы іздеу: қазақша, орысша және латынша (мысалы, «Oskemen», «Усть-Каменогорск», «Өскемен»). */
export function matchCities(q, region = '') {
  const n = norm(q);
  const tr = translit(q);
  return state.cities.filter((c) => {
    if (region && c.region_code !== region) return false;
    if (!n) return true;
    return c.search_text.includes(n) || c.search_text.includes(tr) || translit(c.search_text).includes(tr);
  });
}

/** Облыстар: алдымен республикалық маңызы бар қалалар, қалғаны таңдалған тілдегі әліпбимен */
export function regions() {
  const codes = [...new Set(state.cities.map((c) => c.region_code))];
  const col = collator();
  return codes.sort((a, b) => (a === 'rep' ? -1 : b === 'rep' ? 1 : col.compare(regionLabel(a), regionLabel(b))));
}

/** Қаланың екінші жолы: басқа тілдегі атауы немесе облысы */
function cityAlt(c) {
  const lang = getLang();
  const alt = lang === 'kk' ? c.name_ru : c.name_kk;
  return alt && alt !== cityLabel(c) ? alt : regionLabel(c.region_code);
}

/**
 * Қала таңдау терезесі.
 * @param {object} o
 * @param {number|null} o.current
 * @param {boolean} o.allowAll «Бүкіл Қазақстан» нұсқасы
 * @param {(id:number|null)=>void} o.onPick
 */
export function openCityPicker({ current = state.cityId, allowAll = true, onPick, title = null }) {
  let region = '';
  const { dlg, close } = openDialog({
    title: title || t('city.pickTitle'),
    className: 'city-dlg',
    body: `
      <div class="city-search">${icon('search')}
        <label class="sr-only" for="city-q">${esc(t('city.search'))}</label>
        <input class="input" id="city-q" type="search" autocomplete="off" placeholder="${esc(t('city.searchPlaceholder'))}" />
      </div>
      <div class="region-row" role="group" aria-label="${esc(t('city.byRegion'))}">
        <button type="button" class="chip is-active" data-region="" aria-pressed="true">${esc(t('city.allRegions'))}</button>
        ${regions().map((r) => `<button type="button" class="chip" data-region="${esc(r)}" aria-pressed="false">${esc(regionLabel(r))}</button>`).join('')}
      </div>
      <div class="city-list" aria-live="polite"></div>`,
  });
  const input = dlg.querySelector('#city-q');
  const list = dlg.querySelector('.city-list');

  function draw() {
    const col = collator();
    const items = matchCities(input.value, region).sort((a, b) => col.compare(cityLabel(a), cityLabel(b)));
    const groups = new Map();
    for (const c of items) {
      if (!groups.has(c.region_code)) groups.set(c.region_code, []);
      groups.get(c.region_code).push(c);
    }
    const order = regions().filter((r) => groups.has(r));
    const all = allowAll && !input.value && !region
      ? `<button type="button" class="city-all" data-id="all" aria-current="${current === null}">
          <span class="kz">${icon('globe')}</span><span class="grow">${esc(t('city.all'))}<br><small class="muted">${esc(t('city.allHint'))}</small></span></button>`
      : '';
    list.innerHTML = all + (items.length
      ? order.map((r) => `<section class="city-group"><h3>${esc(regionLabel(r))}</h3><div class="city-opts">
          ${groups.get(r).map((c) => `<button type="button" class="city-opt" data-id="${c.id}" aria-current="${c.id === current}">
            <span><span class="cn">${esc(cityLabel(c))}</span><span class="cr" data-i18n-skip>${esc(cityAlt(c))}</span></span>
            ${c.active_count ? `<span class="cnt" title="${esc(t('city.activeCount'))}">${c.active_count}</span>` : ''}
          </button>`).join('')}</div></section>`).join('')
      : `<div class="state"><div class="state-icon">${icon('search')}</div><h3>${esc(t('city.notFound'))}</h3><p>${esc(t('city.notFoundHint'))}</p></div>`);
  }
  draw();
  input.addEventListener('input', draw);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      list.querySelector('.city-opt, .city-all')?.click();
    }
  });
  dlg.querySelector('.region-row').addEventListener('click', (e) => {
    const b = e.target.closest('[data-region]');
    if (!b) return;
    region = b.dataset.region;
    dlg.querySelectorAll('[data-region]').forEach((x) => {
      x.classList.toggle('is-active', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
    draw();
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    const id = b.dataset.id === 'all' ? null : Number(b.dataset.id);
    close();
    onPick(id);
  });
  setTimeout(() => input.focus(), 30);
}

/** Формаларға арналған қала өрісі: облыс бойынша топтастырылған select. */
export function citySelect(name, selected, { required = true, id = null } = {}) {
  const col = collator();
  const byRegion = new Map();
  for (const c of [...state.cities].sort((a, b) => col.compare(cityLabel(a), cityLabel(b)))) {
    if (!byRegion.has(c.region_code)) byRegion.set(c.region_code, []);
    byRegion.get(c.region_code).push(c);
  }
  return `<select class="select" id="${id || `f-${name}`}" name="${name}" ${required ? 'required' : ''} aria-describedby="e-${name}">
    <option value="">${esc(t('city.choose'))}</option>
    ${regions().map((r) => `<optgroup label="${esc(regionLabel(r))}">${byRegion.get(r).map((c) => `<option value="${c.id}" ${c.id === Number(selected) ? 'selected' : ''}>${esc(cityLabel(c))}</option>`).join('')}</optgroup>`).join('')}
  </select>`;
}

/** Облыс өрісі (апат оқиғасы үшін) */
export function regionOptions(selected = []) {
  return regions().filter((r) => r !== 'rep').map((r) => `<option value="${esc(r)}" ${selected.includes(r) ? 'selected' : ''}>${esc(regionLabel(r))}</option>`).join('');
}

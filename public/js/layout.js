import { state, on, cityName, setCity, clearSession } from './state.js';
import { icon } from './icons.js';
import { esc, avatar, toast, $, catLabel } from './ui.js';
import { t, getLang, LANGS } from './i18n.js';
import { api } from './api.js';
import { navigate, withCity } from './router.js';
import { openCityPicker } from './city-picker.js';
import { connectRealtime } from './realtime.js';
import { changeLanguage } from './lang.js';
import { appPath, STATIC } from './base.js';

function navItems() {
  const items = [
    { href: '/', key: 'nav.home', match: (p) => p === '/', mobileOnly: true },
    { href: '/map', key: 'nav.map', match: (p) => p.startsWith('/map') },
    { href: '/incidents', key: 'nav.incidents', match: (p) => p.startsWith('/incidents') },
    { href: '/disasters', key: 'nav.disasters', match: (p) => p.startsWith('/disasters') || p.startsWith('/events') },
    { href: '/requests/new', key: 'nav.ask', match: (p) => p === '/requests/new' },
    { href: '/about', key: 'nav.about', match: (p) => p.startsWith('/about') },
  ];
  if (state.user?.is_coordinator) items.push({ href: '/coordinator', key: 'nav.coordinator', match: (x) => x.startsWith('/coordinator') });
  if (state.user?.orgs?.length) items.push({ href: '/org', key: 'nav.org', match: (x) => x.startsWith('/org') });
  return items;
}

function langSwitch(cls = '') {
  const cur = getLang();
  return `<div class="lang-switch ${cls}" role="group" aria-label="${esc(t('lang.label'))}" data-i18n-skip>
    ${LANGS.map((l) => `<button type="button" class="lang-btn" data-lang="${l.code}" lang="${l.code}" aria-pressed="${l.code === cur}" title="${esc(l.native)}">
      <span class="lang-short">${l.short}</span><span class="lang-native">${esc(l.native)}</span></button>`).join('')}
  </div>`;
}

/** GitHub Pages нұсқасында: бұл — оқу деректері бар статикалық демо екенін әр бетте көрсетеміз */
function renderStaticBanner() {
  if (!STATIC) return;
  let el = document.getElementById('static-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'static-banner';
    el.className = 'static-banner';
    el.setAttribute('role', 'note');
    document.getElementById('site-header').after(el);
  }
  const repo = document.querySelector('meta[name="qm-repo"]')?.getAttribute('content');
  const measure = () => document.documentElement.style.setProperty('--static-h', `${el.offsetHeight}px`);
  if (!el.dataset.measured) { el.dataset.measured = '1'; window.addEventListener('resize', measure); }
  requestAnimationFrame(measure);
  el.innerHTML = `<div class="container">${icon('info')}<span class="sb-long">${esc(t('staticDemo.banner'))}</span><span class="sb-short">${esc(t('staticDemo.short'))}</span>${repo ? `<a href="${esc(repo)}#readme" target="_blank" rel="noopener" data-external><span class="sb-long">${esc(t('staticDemo.more'))}</span><span class="sb-short">${esc(t('staticDemo.moreShort'))}</span></a>` : ''}</div>`;
}

export function renderHeader() {
  renderStaticBanner();
  const skip = document.querySelector('.skip-link');
  if (skip) skip.textContent = t('nav.skip');
  const el = document.getElementById('site-header');
  const u = state.user;
  const p = appPath();
  const link = (n) => `<a href="${withCity(n.href)}" ${n.match(p) ? 'aria-current="page"' : ''}>${esc(t(n.key))}</a>`;
  const links = navItems().map(link).join('');
  const deskLinks = navItems().filter((n) => !n.mobileOnly).map(link).join('');
  el.innerHTML = `
  <div class="container">
    <a class="brand" href="${withCity('/')}" aria-label="${esc(t('nav.brandAria'))}">
      <span class="brand-mark">${icon('heartPin')}</span><span class="brand-text">Qamqor<b>Map</b></span>
    </a>
    <nav class="main-nav" aria-label="${esc(t('nav.mainAria'))}">${deskLinks}</nav>
    <div class="header-tools">
      ${langSwitch('lang-desktop')}
      <button class="city-btn" type="button" id="city-btn" aria-haspopup="dialog" title="${esc(t('city.change'))}">
        <span class="pin">${icon('pin')}</span><span class="name">${esc(cityName())}</span>${icon('chevDown', 'chev')}
      </button>
      ${u ? `
        <a class="icon-btn" href="${withCity('/dashboard?tab=notifications')}" aria-label="${esc(state.unread ? t('nav.notificationsUnread', { count: state.unread }) : t('nav.notifications'))}" id="bell">
          ${icon('bell')}${state.unread ? `<span class="dot-count">${state.unread > 99 ? '99+' : state.unread}</span>` : ''}
        </a>
        <div class="user-menu">
          <button class="user-btn" type="button" id="user-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="user-pop">
            ${avatar(u.full_name)}<span class="uname" data-ugc>${esc(u.full_name.split(' ')[0])}</span>
          </button>
          <div class="menu-pop" id="user-pop" role="menu">
            <div class="menu-head"><strong data-ugc>${esc(u.full_name)}</strong><small data-ugc>${esc(u.email)}</small>
              ${u.is_coordinator ? `<span class="badge badge-assigned" style="margin-top:6px">${esc(t('role.coordinator'))}</span>` : ''}</div>
            <a role="menuitem" href="${withCity('/dashboard')}">${icon('grid')}${esc(t('nav.dashboard'))}</a>
            <a role="menuitem" href="${withCity('/dashboard?tab=requests')}">${icon('inbox')}${esc(t('dash.tabs.requests'))}</a>
            <a role="menuitem" href="${withCity('/dashboard?tab=tasks')}">${icon('hand')}${esc(t('dash.tabs.tasks'))}</a>
            <a role="menuitem" href="${withCity('/dashboard?tab=profile')}">${icon('user')}${esc(t('dash.tabs.profile'))}</a>
            ${u.is_coordinator ? `<a role="menuitem" href="${withCity('/coordinator')}">${icon('shield')}${esc(t('nav.coordPanel'))}</a>` : ''}
            ${u.orgs?.length ? `<a role="menuitem" href="${withCity('/org')}" id="menu-org">${icon('users')}${esc(t('nav.org'))}</a>` : ''}
            <button role="menuitem" type="button" id="logout-btn">${icon('logout')}${esc(t('nav.logout'))}</button>
          </div>
        </div>` : `
        <div class="row auth-links" style="gap:8px">
          <a class="btn btn-ghost" href="${withCity('/login')}">${esc(t('nav.login'))}</a>
          <a class="btn btn-primary" href="${withCity('/register')}">${esc(t('nav.register'))}</a>
        </div>`}
      <button class="icon-btn burger" type="button" id="burger" aria-label="${esc(t('nav.openMenu'))}" aria-expanded="false" aria-controls="mobile-nav">${icon('menu')}</button>
    </div>
  </div>
  <nav class="mobile-nav" id="mobile-nav" aria-label="${esc(t('nav.mobileAria'))}">
    <div class="mobile-lang"><span class="label">${esc(t('lang.label'))}</span>${langSwitch('lang-mobile')}</div>
    ${links}
    ${u ? `<a href="${withCity('/dashboard')}">${esc(t('nav.dashboard'))}</a>` : `<a class="btn btn-primary btn-lg" href="${withCity('/register')}">${esc(t('nav.register'))}</a><a class="btn btn-lg" href="${withCity('/login')}">${esc(t('nav.login'))}</a>`}
  </nav>`;

  $('#city-btn', el).addEventListener('click', () => openCityPicker({ onPick: (id) => setCity(id) }));
  el.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
    $('#mobile-nav', el).classList.remove('is-open');
    changeLanguage(b.dataset.lang);
  }));
  const burger = $('#burger', el);
  const mnav = $('#mobile-nav', el);
  burger.addEventListener('click', () => {
    const open = !mnav.classList.contains('is-open');
    mnav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', t(open ? 'nav.closeMenu' : 'nav.openMenu'));
    burger.innerHTML = icon(open ? 'x' : 'menu');
  });
  mnav.addEventListener('click', (e) => { if (e.target.closest('a')) mnav.classList.remove('is-open'); });

  const ub = $('#user-btn', el);
  if (ub) {
    const pop = $('#user-pop', el);
    const setOpen = (open) => {
      pop.classList.toggle('is-open', open);
      ub.setAttribute('aria-expanded', String(open));
      if (open) pop.querySelector('a,button')?.focus();
    };
    ub.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!pop.classList.contains('is-open')); });
    pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setOpen(false); ub.focus(); } });
    pop.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    $('#logout-btn', el).addEventListener('click', async () => {
      try {
        await api('/auth/logout', { method: 'POST' });
      } catch { /* сессия бәрібір тазаланады */ }
      clearSession();
      connectRealtime();
      toast(t('auth.loggedOut'), { type: 'success' });
      navigate('/');
    });
  }
}

export function renderFooter() {
  const el = document.getElementById('site-footer');
  const everyday = state.categories.filter((c) => c.direction !== 'disaster');
  el.innerHTML = `
  <div class="container">
    <div class="footer-top">
      <div class="footer-brand">
        <a class="brand" href="${withCity('/')}"><span class="brand-mark">${icon('heartPin')}</span>Qamqor<b>Map</b></a>
        <p>${esc(t('footer.about'))}</p>
        <div class="footer-cta">
          <a class="btn btn-coral" href="${withCity('/requests/new')}">${icon('plus')}${esc(t('home.ctaAsk'))}</a>
          <a class="btn btn-light" href="${withCity('/map')}">${esc(t('home.ctaHelp'))}</a>
        </div>
      </div>
      <div><h3>${esc(t('footer.platform'))}</h3>
        <a href="${withCity('/map')}">${esc(t('nav.map'))}</a><a href="${withCity('/requests/new')}">${esc(t('footer.newRequest'))}</a>
        <a href="${withCity('/dashboard?tab=profile')}">${esc(t('footer.beVolunteer'))}</a><a href="${withCity('/dashboard')}">${esc(t('nav.dashboard'))}</a></div>
      <div><h3>${esc(t('footer.helpTypes'))}</h3>
        ${everyday.map((c) => `<a href="${withCity(`/map?category=${c.id}`)}">${esc(catLabel(c.code))}</a>`).join('')}
        <a href="${withCity('/disasters')}">${esc(t('dir.disaster'))}</a></div>
      <div><h3>${esc(t('footer.project'))}</h3>
        <a href="${withCity('/about')}">${esc(t('nav.about'))}</a><a href="${withCity('/about#privacy')}">${esc(t('footer.privacy'))}</a>
        <a href="${withCity('/about#architecture')}">${esc(t('footer.architecture'))}</a></div>
    </div>
    <div class="footer-bottom">
      <span>© ${new Date().getFullYear()} QamqorMap · ${esc(t('footer.demoNote'))}</span>
      <span>${esc(t('footer.mapData'))}: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a></span>
    </div>
  </div>`;
}

export function initLayout() {
  renderHeader();
  renderFooter();
  on('auth', () => renderHeader());
  on('city', () => { renderHeader(); renderFooter(); });
  on('unread', () => renderHeader());
  on('lang', () => { renderHeader(); renderFooter(); });
  document.addEventListener('routechange', () => renderHeader());
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-menu')) document.getElementById('user-pop')?.classList.remove('is-open');
  });
}

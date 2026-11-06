import { icon } from '../icons.js';
import { withCity } from '../router.js';
import { state } from '../state.js';
import { esc } from '../ui.js';
import { t, th } from '../i18n.js';

export default async function about(ctx) {
  document.title = `${t('nav.about')} — QamqorMap`;
  const feat = (ico, key, params) => `<div class="feature"><span class="fi">${icon(ico)}</span><h3>${esc(t(`about.f.${key}.title`))}</h3><p>${esc(t(`about.f.${key}.text`, params))}</p></div>`;
  ctx.root.innerHTML = `
  <div class="container">
    <section class="about-hero reveal">
      <span class="eyebrow">${esc(t('nav.about'))}</span>
      <h1 style="margin-top:12px">${esc(t('about.title'))}</h1>
      <p class="lead" style="margin-top:20px;max-width:60ch">${esc(t('about.lead'))}</p>
      <div class="team-card" style="margin-top:32px">
        <span class="tc-ico">${icon('users')}</span>
        <p>${th('about.team', { names: t('about.names') }, { ugc: ['names'] })}</p>
      </div>
    </section>

    <section class="section" aria-labelledby="f-h">
      <div class="section-head"><div><span class="eyebrow">${esc(t('about.featuresEyebrow'))}</span><h2 id="f-h">${esc(t('about.featuresTitle'))}</h2></div></div>
      <div class="features-grid">
        ${feat('map', 'map', { count: state.cities.length })}
        ${feat('shield', 'moderation')}
        ${feat('target', 'matching')}
        ${feat('chat', 'chat')}
        ${feat('checkCircle', 'confirm')}
        ${feat('bell', 'realtime')}
        ${feat('globe', 'languages')}
        ${feat('alert', 'disasters')}
        ${feat('lock', 'privacy')}
      </div>
    </section>

    <section class="section" id="architecture" aria-labelledby="a-h" style="padding-top:0">
      <div class="about-teaser">
        <div><span class="eyebrow">${esc(t('footer.architecture'))}</span><h2 id="a-h" style="margin-top:10px">${esc(t('about.archTitle'))}</h2>
          <p class="lead" style="margin-top:14px">${esc(t('about.archLead'))}</p></div>
        <div class="arch" aria-label="${esc(t('about.archAria'))}">
          <div class="arch-box"><span class="ab-ico">${icon('code')}</span><div><strong>HTML + CSS + JavaScript</strong><small>${esc(t('about.arch1'))}</small></div></div>
          <span class="arch-arrow">${icon('chevDown')}</span>
          <div class="arch-box"><span class="ab-ico">${icon('globe')}</span><div><strong>HTTP / REST API</strong><small>${esc(t('about.arch2'))}</small></div></div>
          <span class="arch-arrow">${icon('chevDown')}</span>
          <div class="arch-box"><span class="ab-ico">${icon('server')}</span><div><strong>Node.js + Express</strong><small>${esc(t('about.arch3'))}</small></div></div>
          <span class="arch-arrow">${icon('chevDown')}</span>
          <div class="arch-box"><span class="ab-ico">${icon('database')}</span><div><strong>PostgreSQL</strong><small>${esc(t('about.arch4'))}</small></div></div>
        </div>
      </div>
    </section>

    <section class="section" id="privacy" aria-labelledby="p-h" style="padding-top:0">
      <div class="card card-pad">
        <span class="eyebrow">${esc(t('about.privacyEyebrow'))}</span><h2 id="p-h" style="margin-top:10px">${esc(t('about.privacyTitle'))}</h2>
        <ul class="privacy-list" style="margin-top:20px;font-size:var(--fs-md)">
          <li>${icon('lock')}<span>${th('about.p1')}</span></li>
          <li>${icon('map')}<span>${esc(t('about.p2'))}</span></li>
          <li>${icon('users')}<span>${esc(t('about.p3'))}</span></li>
          <li>${icon('image')}<span>${esc(t('about.p4'))}</span></li>
          <li>${icon('shield')}<span>${esc(t('about.p5'))}</span></li>
          <li>${icon('globe')}<span>${esc(t('about.p6'))}</span></li>
        </ul>
      </div>
    </section>

    <section aria-labelledby="d-h">
      <div class="alert alert-warn">${icon('info')}<div><strong id="d-h">${esc(t('about.demoTitle'))}</strong>${esc(t('about.demoText'))}</div></div>
      <div class="hero-actions" style="margin-top:28px">
        <a class="btn btn-primary btn-lg" href="${withCity('/requests/new')}">${icon('plus')}${esc(t('home.ctaAsk'))}</a>
        <a class="btn btn-lg" href="${withCity('/map?status=open')}">${icon('hand')}${esc(t('home.ctaHelp'))}</a>
      </div>
    </section>
  </div>`;
  if (location.hash) setTimeout(() => document.querySelector(location.hash)?.scrollIntoView(), 50);
}

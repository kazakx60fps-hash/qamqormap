import { appPath, STATIC } from '../base.js';
import { api } from '../api.js';
import { state, setSession } from '../state.js';
import { icon } from '../icons.js';
import { esc, field, showErrors, clearErrors, withBusy, toast, formData, $ } from '../ui.js';
import { t, getLang } from '../i18n.js';
import { navigate, withCity } from '../router.js';
import { citySelect } from '../city-picker.js';
import { connectRealtime } from '../realtime.js';
import { syncLangAfterLogin } from '../lang.js';

export default async function auth(ctx) {
  const isLogin = appPath() === '/login';
  const next = ctx.query.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
  document.title = `${t(isLogin ? 'nav.login' : 'nav.register')} — QamqorMap`;

  if (state.user) {
    navigate(safeNext || '/dashboard', { replace: true });
    return;
  }
  const nextQ = safeNext ? `?next=${encodeURIComponent(safeNext)}` : '';

  ctx.root.innerHTML = `
  <div class="auth-wrap">
    <aside class="auth-art">
      <span class="eyebrow" style="color:#8FA8FF">QamqorMap</span>
      <h2 style="margin-top:14px">${esc(t(isLogin ? 'auth.artLoginTitle' : 'auth.artRegisterTitle'))}</h2>
      <p>${esc(t(isLogin ? 'auth.artLoginText' : 'auth.artRegisterText'))}</p>
    </aside>
    <div class="auth-form-wrap">
      <div class="auth-card reveal">
        <h1>${esc(t(isLogin ? 'auth.loginTitle' : 'nav.register'))}</h1>
        <p class="muted" style="margin-top:8px">${isLogin
          ? `${esc(t('auth.noAccount'))} <a href="${withCity('/register' + nextQ)}">${esc(t('auth.registerLink'))}</a>`
          : `${esc(t('auth.haveAccount'))} <a href="${withCity('/login' + nextQ)}">${esc(t('auth.loginLink'))}</a>`}</p>
        ${STATIC ? `<div class="alert alert-info" style="margin-top:18px" id="static-auth-note">${icon('info')}<div>${esc(t('errors.STATIC_DEMO'))}</div></div>` : ''}
        <form class="stack" id="auth-form" novalidate style="margin-top:26px">
          ${isLogin ? '' : field({ name: 'full_name', label: t('auth.fullName'), required: true, control: `<input class="input" id="f-full_name" name="full_name" autocomplete="name" maxlength="80" placeholder="${esc(t('auth.fullNamePh'))}" aria-describedby="e-full_name">` })}
          ${field({ name: 'email', label: 'Email', required: true, control: '<input class="input" id="f-email" name="email" type="email" autocomplete="email" maxlength="120" placeholder="name@example.kz" aria-describedby="e-email">' })}
          ${isLogin ? '' : field({ name: 'city_id', label: t('auth.yourCity'), control: citySelect('city_id', state.cityId, { required: false }) })}
          ${isLogin ? '' : field({ name: 'phone', label: t('auth.phone'), hint: t('auth.phoneHint'), control: '<input class="input" id="f-phone" name="phone" type="tel" autocomplete="tel" placeholder="+7 7__ ___ __ __" aria-describedby="h-phone e-phone">' })}
          ${field({ name: 'password', label: t('auth.password'), required: true, hint: isLogin ? '' : t('auth.passwordHint'), control: `<input class="input" id="f-password" name="password" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" aria-describedby="${isLogin ? '' : 'h-password '}e-password">` })}
          ${isLogin ? '' : field({ name: 'password_confirm', label: t('auth.passwordConfirm'), required: true, control: '<input class="input" id="f-password_confirm" name="password_confirm" type="password" autocomplete="new-password" aria-describedby="e-password_confirm">' })}
          <div class="form-alert" tabindex="-1"></div>
          <button class="btn btn-primary btn-lg btn-block" type="submit">${esc(t(isLogin ? 'nav.login' : 'auth.createAccount'))}${icon('arrowRight')}</button>
        </form>
        ${isLogin ? `<div class="demo-accounts">
          <strong>${esc(t('auth.demoTitle'))}</strong> — ${esc(t('auth.demoPassword'))}: <code>Demo12345</code>
          <div class="row">
            <button type="button" class="btn btn-sm" data-demo="aigerim@demo.qamqormap.kz">${esc(t('auth.demoAuthor'))}</button>
            <button type="button" class="btn btn-sm" data-demo="daniyar@demo.qamqormap.kz">${esc(t('auth.demoVolunteer'))}</button>
            <button type="button" class="btn btn-sm" data-demo="coordinator@demo.qamqormap.kz">${esc(t('role.coordinator'))}</button>
            <button type="button" class="btn btn-sm" data-demo="kzo.coord@demo.qamqormap.kz">${esc(t('auth.demoOrgCoord'))}</button>
            <button type="button" class="btn btn-sm" data-demo="kzo.vol1@demo.qamqormap.kz">${esc(t('auth.demoOrgVolunteer'))}</button>
            <button type="button" class="btn btn-sm" data-demo="kzo.recipient@demo.qamqormap.kz">${esc(t('auth.demoRecipient'))}</button>
          </div></div>` : ''}
      </div>
    </div>
  </div>`;

  const form = $('#auth-form', ctx.root);
  if (!ctx.restoring) form.querySelector('input')?.focus();
  ctx.root.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => {
    form.email.value = b.dataset.demo;
    form.password.value = 'Demo12345';
    form.requestSubmit();
  }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    const d = formData(form);
    const local = {};
    if (!d.email) local.email = { code: 'REQUIRED' };
    if (!d.password) local.password = { code: 'REQUIRED' };
    if (!isLogin) {
      if (!d.full_name || d.full_name.trim().length < 2) local.full_name = { code: d.full_name ? 'MIN_LENGTH' : 'REQUIRED', params: { min: 2 } };
      if (d.password && d.password.length < 8) local.password = { code: 'MIN_LENGTH', params: { min: 8 } };
      if (d.password !== d.password_confirm) local.password_confirm = { code: 'PASSWORD_MISMATCH' };
    }
    if (Object.keys(local).length) return showErrors(form, { message: t('errors.VALIDATION'), fields: local });
    await withBusy(form.querySelector('[type=submit]'), async () => {
      try {
        const res = await api(isLogin ? '/auth/login' : '/auth/register', {
          method: 'POST',
          body: isLogin ? { email: d.email, password: d.password } : { ...d, city_id: d.city_id || null, lang: getLang() },
        });
        setSession(res);
        await syncLangAfterLogin();
        connectRealtime();
        toast(isLogin ? t('auth.welcomeBack', { name: res.user.full_name.split(' ')[0] }) : t('auth.welcomeNew'), { type: 'success' });
        const volunteer = ctx.query.get('volunteer');
        navigate(safeNext || (volunteer && !isLogin ? '/dashboard?tab=profile' : '/dashboard'), { replace: true });
      } catch (err) {
        showErrors(form, err);
      }
    });
  });
}

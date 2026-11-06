// Бірыңғай компоненттер жүйесі: мәтін, батырмалар, чиптер, белгілер, өрістер, күй көріністері.
import React from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { C, F, HIT, R, S, shadow } from '../theme';
import { Icon } from './Icon';
import { useI18n } from '../i18n';

type TxtProps = { v?: keyof typeof F; color?: string; style?: StyleProp<TextStyle>; children: React.ReactNode; numberOfLines?: number; selectable?: boolean; accessibilityRole?: 'header' | 'text'; testID?: string; ugc?: boolean };
/** ugc — қолданушы жазған мәтін (аударылмайды); веб-нұсқада data-ugc белгісі қойылады */
export function Txt({ v = 'md', color = C.ink, style, children, numberOfLines, selectable, accessibilityRole, testID, ugc }: TxtProps) {
  const extra = ugc ? ({ dataSet: { ugc: '1' } } as object) : {};
  return (
    <Text style={[F[v], { color }, style]} numberOfLines={numberOfLines} selectable={selectable} accessibilityRole={accessibilityRole} maxFontSizeMultiplier={1.6} testID={testID} {...extra}>
      {children}
    </Text>
  );
}

export const H1 = (p: Omit<TxtProps, 'v'>) => <Txt v="h1" accessibilityRole="header" {...p} />;
export const H2 = (p: Omit<TxtProps, 'v'>) => <Txt v="h2" accessibilityRole="header" {...p} />;
export const H3 = (p: Omit<TxtProps, 'v'>) => <Txt v="h3" accessibilityRole="header" {...p} />;

type BtnKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'disaster' | 'success';
const BTN: Record<BtnKind, { bg: string; fg: string; border?: string }> = {
  primary: { bg: C.primary, fg: C.white },
  secondary: { bg: C.surface, fg: C.primaryDark, border: C.borderStrong },
  ghost: { bg: 'transparent', fg: C.primaryDark },
  danger: { bg: C.surface, fg: C.red, border: '#EDB6BA' },
  disaster: { bg: C.disaster, fg: C.white },
  success: { bg: C.green, fg: C.white },
};

type BtnProps = Omit<PressableProps, 'children' | 'style'> & {
  title: string; kind?: BtnKind; icon?: string; loading?: boolean; small?: boolean; full?: boolean; style?: StyleProp<ViewStyle>; testID?: string;
};
export function Btn({ title, kind = 'primary', icon, loading, small, full, disabled, style, ...rest }: BtnProps) {
  const k = BTN[kind];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      accessibilityLabel={title}
      disabled={off}
      hitSlop={small ? 6 : 0}
      style={({ pressed }) => [
        s.btn, small && s.btnSmall, full && { alignSelf: 'stretch' },
        { backgroundColor: k.bg, borderColor: k.border ?? k.bg, opacity: off ? 0.55 : pressed ? 0.85 : 1 },
        kind === 'ghost' && { borderColor: 'transparent' },
        style,
      ]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={k.fg} size="small" /> : icon ? <Icon name={icon} size={small ? 18 : 20} color={k.fg} /> : null}
      <Text style={[small ? F.sm : F.lg, { color: k.fg, fontWeight: '700', textAlign: 'center', flexShrink: 1 }]} maxFontSizeMultiplier={1.4}>{title}</Text>
    </Pressable>
  );
}

export function IconBtn({ icon, label, onPress, color = C.ink, bg = C.surface, size = HIT, badge, testID, style }: {
  icon: string; label: string; onPress: () => void; color?: string; bg?: string; size?: number; badge?: number; testID?: string; style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={label} onPress={onPress} testID={testID}
      style={({ pressed }) => [s.iconBtn, { width: size, height: size, backgroundColor: bg, opacity: pressed ? 0.8 : 1 }, style]}
    >
      <Icon name={icon} size={22} color={color} />
      {badge ? <View style={s.badgeDot}><Text style={s.badgeDotText}>{badge > 99 ? '99+' : badge}</Text></View> : null}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon, color, testID, count }: {
  label: string; selected?: boolean; onPress?: () => void; icon?: string; color?: string; testID?: string; count?: number;
}) {
  const accent = color ?? C.primary;
  return (
    <Pressable
      accessibilityRole="button" accessibilityState={{ selected: !!selected }} aria-selected={!!selected} accessibilityLabel={label} onPress={onPress} testID={testID}
      style={({ pressed }) => [s.chip, selected ? { backgroundColor: accent, borderColor: accent } : null, pressed && { opacity: 0.85 }]}
    >
      {icon ? <Icon name={icon} size={18} color={selected ? C.white : accent} /> : null}
      <Text style={[F.sm, { color: selected ? C.white : C.ink, fontWeight: '700' }]} numberOfLines={1}>{label}</Text>
      {count != null ? <Text style={[F.xs, { color: selected ? C.white : C.muted }]}>{count}</Text> : null}
    </Pressable>
  );
}

export function Badge({ label, fg, bg, icon, testID }: { label: string; fg: string; bg: string; icon?: string; testID?: string }) {
  return (
    <View style={[s.badge, { backgroundColor: bg }]} testID={testID}>
      {icon ? <Icon name={icon} size={14} color={fg} stroke={2.4} /> : null}
      <Text style={[F.xs, { color: fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function Card({ children, style, onPress, selected, testID, accessibilityLabel }: {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; selected?: boolean; testID?: string; accessibilityLabel?: string;
}) {
  const body = [s.card, selected && s.cardSelected, style];
  if (!onPress) return <View style={body} testID={testID}>{children}</View>;
  return (
    <Pressable onPress={onPress} testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [...body, pressed && { opacity: 0.92 }]}>
      {children}
    </Pressable>
  );
}

type AlertKind = 'info' | 'warn' | 'danger' | 'success' | 'disaster' | 'demo';
const AL: Record<AlertKind, { fg: string; bg: string; border: string; icon: string }> = {
  info: { fg: C.primaryDark, bg: C.primary50, border: C.primary100, icon: 'info' },
  warn: { fg: C.amber, bg: C.amber50, border: '#F3DDAE', icon: 'alert' },
  danger: { fg: C.red, bg: C.red50, border: '#F2C3C6', icon: 'alert' },
  success: { fg: C.green, bg: C.green50, border: '#BFE6CD', icon: 'checkCircle' },
  disaster: { fg: C.disasterDark, bg: C.disaster50, border: C.disaster100, icon: 'siren' },
  demo: { fg: C.demo, bg: C.demo50, border: '#F1DD9A', icon: 'flag' },
};
export function Alert({ kind = 'info', title, text, children, testID }: { kind?: AlertKind; title?: string; text?: string; children?: React.ReactNode; testID?: string }) {
  const a = AL[kind];
  return (
    <View style={[s.alert, { backgroundColor: a.bg, borderColor: a.border }]} testID={testID} accessibilityRole={kind === 'danger' ? 'alert' : undefined}>
      <Icon name={a.icon} size={20} color={a.fg} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <Text style={[F.sm, { color: a.fg, fontWeight: '800' }]}>{title}</Text> : null}
        {text ? <Text style={[F.sm, { color: C.ink2, fontWeight: '500' }]}>{text}</Text> : null}
        {children}
      </View>
    </View>
  );
}

type FieldProps = TextInputProps & { label: string; hint?: string; error?: string; optional?: boolean; testID?: string };
export const Field = React.forwardRef<React.ComponentRef<typeof TextInput>, FieldProps>(function Field({ label, hint, error, optional, style, multiline, testID, ...rest }, ref) {
  const { t } = useI18n();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[F.sm, { color: C.ink, fontWeight: '700' }]}>
        {label}{optional ? <Text style={{ color: C.muted, fontWeight: '500' }}> · {t('common.optional')}</Text> : null}
      </Text>
      <TextInput
        ref={ref}
        testID={testID}
        accessibilityLabel={label}
        placeholderTextColor={C.subtle}
        multiline={multiline}
        style={[s.input, multiline && { minHeight: 110, textAlignVertical: 'top', paddingTop: 12 }, error ? { borderColor: C.red } : null, style]}
        {...rest}
      />
      {error ? <Text style={[F.sm, { color: C.red }]} accessibilityLiveRegion="polite">{error}</Text> : hint ? <Text style={[F.xs, { color: C.muted, fontWeight: '500' }]}>{hint}</Text> : null}
    </View>
  );
});

export function Segmented<T extends string>({ options, value, onChange, testID }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; testID?: string }) {
  return (
    <View style={s.seg} accessibilityRole="tablist" testID={testID}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: on }} aria-selected={on} accessibilityLabel={o.label}
            testID={testID ? `${testID}-${o.value}` : undefined}
            style={[s.segItem, on && s.segItemOn]}>
            <Text style={[F.sm, { color: on ? C.primaryDark : C.muted, fontWeight: '800', textAlign: 'center' }]} numberOfLines={2}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Check({ label, value, onChange, testID, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; testID?: string; hint?: string }) {
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="checkbox" accessibilityState={{ checked: value }} aria-checked={value} accessibilityLabel={label} testID={testID} style={s.check}>
      <View style={[s.box, value && { backgroundColor: C.primary, borderColor: C.primary }]}>
        {value ? <Icon name="check" size={16} color={C.white} stroke={3} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[F.md, { color: C.ink, fontWeight: '600' }]}>{label}</Text>
        {hint ? <Text style={[F.xs, { color: C.muted, fontWeight: '500' }]}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

export function Loading({ text }: { text?: string }) {
  const { t } = useI18n();
  return (
    <View style={s.state} accessibilityLiveRegion="polite" testID="state-loading">
      <ActivityIndicator size="large" color={C.primary} />
      <Txt v="sm" color={C.muted}>{text ?? t('common.loading')}</Txt>
    </View>
  );
}

export function Empty({ icon = 'inbox', title, text, action }: { icon?: string; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <View style={s.state} testID="state-empty">
      <View style={s.stateIcon}><Icon name={icon} size={30} color={C.primary} /></View>
      <Txt v="h3" style={{ textAlign: 'center' }}>{title}</Txt>
      {text ? <Txt v="sm" color={C.muted} style={{ textAlign: 'center' }}>{text}</Txt> : null}
      {action}
    </View>
  );
}

export function ErrorView({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <View style={s.state} testID="state-error" accessibilityRole="alert">
      <View style={[s.stateIcon, { backgroundColor: C.red50 }]}><Icon name="alert" size={30} color={C.red} /></View>
      <Txt v="h3" style={{ textAlign: 'center' }}>{t('state.error')}</Txt>
      <Txt v="sm" color={C.ink2} style={{ textAlign: 'center' }}>{text}</Txt>
      {onRetry ? <Btn title={t('common.retry')} icon="refresh" kind="secondary" onPress={onRetry} testID="retry" /> : null}
    </View>
  );
}

export function Section({ title, children, right, style }: { title?: string; children: React.ReactNode; right?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.section, style]}>
      {title ? (
        <View style={s.sectionHead}>
          <Txt v="h3" accessibilityRole="header" style={{ flex: 1 }}>{title}</Txt>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Row({ children, style, gap = 8, wrap }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, wrap && { flexWrap: 'wrap' }, style]}>{children}</View>;
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: C.border, marginVertical: S[2] }} />;
}

/** Автордың мәтіні: аударылмайды, тілі көрсетіледі */
export function UgcNote({ contentLang }: { contentLang?: string | null }) {
  const { t, lang } = useI18n();
  if (!contentLang || contentLang === lang) return null;
  return (
    <Row gap={4}>
      <Icon name="globe" size={14} color={C.muted} />
      <Txt v="xs" color={C.muted}>{t('ugc.original', { lang: t(`langName.${contentLang}`) })}</Txt>
    </Row>
  );
}

export const s = StyleSheet.create({
  btn: { minHeight: HIT, paddingHorizontal: S[5], borderRadius: R.md, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnSmall: { minHeight: 40, paddingHorizontal: S[3], borderRadius: R.sm },
  iconBtn: { borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', ...shadow(1) },
  badgeDot: { position: 'absolute', top: 2, right: 2, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: C.white },
  badgeDotText: { color: C.white, fontSize: 11, fontWeight: '800' },
  chip: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: R.pill, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: R.pill, alignSelf: 'flex-start' },
  card: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S[4], gap: S[2] },
  cardSelected: { borderColor: C.primary, borderWidth: 2, ...shadow(2) },
  alert: { flexDirection: 'row', gap: S[3], padding: S[3], borderRadius: R.md, borderWidth: 1, alignItems: 'flex-start' },
  input: { minHeight: HIT, borderWidth: 1.5, borderColor: C.borderStrong, borderRadius: R.md, paddingHorizontal: S[3], fontSize: 16, color: C.ink, backgroundColor: C.surface },
  seg: { flexDirection: 'row', backgroundColor: C.surface2, borderRadius: R.md, padding: 4, gap: 4 },
  segItem: { flex: 1, minHeight: 40, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segItemOn: { backgroundColor: C.surface, ...shadow(1) },
  check: { flexDirection: 'row', alignItems: 'center', gap: S[3], minHeight: HIT },
  box: { width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  state: { alignItems: 'center', justifyContent: 'center', gap: S[3], padding: S[6], minHeight: 220 },
  stateIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.primary50, alignItems: 'center', justifyContent: 'center' },
  section: { gap: S[3] },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: S[2] },
});

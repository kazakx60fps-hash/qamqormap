// Қалқымалы элементтер: хабарлама (toast), төменгі модаль, таңдау тізімі, себеп сұрайтын диалог.
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, HIT, R, S, shadow } from '../theme';
import { Icon } from './Icon';
import { Btn, Field, H3, Txt } from './ui';
import { useI18n } from '../i18n';

type ToastKind = 'success' | 'error' | 'info';
const ToastCtx = createContext<(text: string, kind?: ToastKind) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; kind: ToastKind } | null>(null);
  const op = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const show = useCallback((text: string, kind: ToastKind = 'success') => {
    setMsg({ text, kind });
    Animated.timing(op, { toValue: 1, duration: 160, useNativeDriver: Platform.OS !== 'web' }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.timing(op, { toValue: 0, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start(() => setMsg(null));
    }, kind === 'error' ? 5200 : 3200);
  }, [op]);
  const color = msg?.kind === 'error' ? C.red : msg?.kind === 'info' ? C.primaryDark : C.green;
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg ? (
        <Animated.View pointerEvents="box-none" style={[st.toastWrap, { top: insets.top + 8, opacity: op }]}>
          <Pressable onPress={() => setMsg(null)} style={[st.toast, { borderLeftColor: color }]} accessibilityRole="alert" accessibilityLiveRegion="assertive" testID="toast">
            <Icon name={msg.kind === 'error' ? 'alert' : msg.kind === 'info' ? 'info' : 'checkCircle'} color={color} size={22} />
            <Text style={[F.sm, { color: C.ink, flex: 1, fontWeight: '600' }]}>{msg.text}</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Төменнен ашылатын модаль (сүзгілер, таңдау, диалогтар) */
export function BottomModal({ visible, onClose, title, children, footer, testID, full }: {
  visible: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; testID?: string; full?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={st.backdrop} onPress={onClose} accessibilityLabel={t('common.close')} accessibilityRole="button" />
        <View style={[st.sheet, full && { height: '92%' }, { paddingBottom: Math.max(insets.bottom, 12) }]} testID={testID} accessibilityViewIsModal>
          <View style={st.sheetHead}>
            <H3 style={{ flex: 1 }}>{title}</H3>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} style={st.close} testID="modal-close">
              <Icon name="x" size={22} color={C.ink2} />
            </Pressable>
          </View>
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ padding: S[4], gap: S[3] }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={st.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export type Option<T> = { value: T; label: string; hint?: string; icon?: string; color?: string };

/** Таңдау өрісі: басқанда тізім ашылады */
export function SelectField<T extends string | number | null>({ label, value, options, onChange, placeholder, error, testID, optional }: {
  label: string; value: T; options: Option<T>[]; onChange: (v: T) => void; placeholder?: string; error?: string; testID?: string; optional?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const cur = options.find((o) => o.value === value);
  return (
    <View style={{ gap: 6 }}>
      <Text style={[F.sm, { color: C.ink, fontWeight: '700' }]}>
        {label}{optional ? <Text style={{ color: C.muted, fontWeight: '500' }}> · {t('common.optional')}</Text> : null}
      </Text>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${label}: ${cur?.label ?? placeholder ?? ''}`} testID={testID}
        style={[st.select, error ? { borderColor: C.red } : null]}>
        {cur?.icon ? <Icon name={cur.icon} size={20} color={cur.color ?? C.primary} /> : null}
        <Text style={[F.md, { flex: 1, color: cur ? C.ink : C.subtle }]} numberOfLines={2}>{cur?.label ?? placeholder ?? '—'}</Text>
        <Icon name="chevDown" size={20} color={C.muted} />
      </Pressable>
      {error ? <Text style={[F.sm, { color: C.red }]}>{error}</Text> : null}
      <OptionSheet visible={open} title={label} options={options} value={value} onClose={() => setOpen(false)}
        onPick={(v) => { onChange(v); setOpen(false); }} testID={testID ? `${testID}-sheet` : undefined} />
    </View>
  );
}

export function OptionSheet<T>({ visible, title, options, value, onPick, onClose, testID }: {
  visible: boolean; title: string; options: Option<T>[]; value: T; onPick: (v: T) => void; onClose: () => void; testID?: string;
}) {
  return (
    <BottomModal visible={visible} onClose={onClose} title={title} testID={testID}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable key={i} onPress={() => onPick(o.value)} accessibilityRole="radio" accessibilityState={{ checked: on }} aria-checked={on} accessibilityLabel={o.label}
            testID={testID ? `${testID}-opt-${String(o.value)}` : undefined}
            style={[st.opt, on && { borderColor: C.primary, backgroundColor: C.primary50 }]}>
            {o.icon ? <Icon name={o.icon} size={20} color={o.color ?? C.primary} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={[F.md, { color: C.ink, fontWeight: on ? '800' : '600' }]}>{o.label}</Text>
              {o.hint ? <Text style={[F.xs, { color: C.muted, fontWeight: '500' }]}>{o.hint}</Text> : null}
            </View>
            {on ? <Icon name="check" size={20} color={C.primary} stroke={3} /> : null}
          </Pressable>
        );
      })}
    </BottomModal>
  );
}

/** Себеп/түсініктеме сұрайтын диалог (қайтару, тоқтату, дау) */
export function ReasonDialog({ visible, title, text, label, placeholder, okLabel, onClose, onSubmit, required = true, danger, testID, min = 5 }: {
  visible: boolean; title: string; text?: string; label: string; placeholder?: string; okLabel: string; onClose: () => void;
  onSubmit: (reason: string) => Promise<void> | void; required?: boolean; danger?: boolean; testID?: string; min?: number;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    if (required && value.trim().length < min) { setErr(t('fieldErrors.MIN_LENGTH', { min })); return; }
    setBusy(true);
    try {
      await onSubmit(value.trim());
      setValue('');
      setErr('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <BottomModal visible={visible} onClose={onClose} title={title} testID={testID}
      footer={<View style={{ flexDirection: 'row', gap: S[2] }}>
        <Btn title={t('common.cancel')} kind="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Btn title={okLabel} kind={danger ? 'danger' : 'primary'} onPress={submit} loading={busy} style={{ flex: 1.4 }} testID={testID ? `${testID}-ok` : undefined} />
      </View>}>
      {text ? <Txt v="sm" color={C.ink2}>{text}</Txt> : null}
      <Field label={label} value={value} onChangeText={(v) => { setValue(v); if (err) setErr(''); }} placeholder={placeholder} multiline error={err}
        optional={!required} testID={testID ? `${testID}-input` : undefined} />
    </BottomModal>
  );
}

/** Растау диалогы */
export function ConfirmDialog({ visible, title, text, okLabel, onClose, onConfirm, danger, testID, children }: {
  visible: boolean; title: string; text: string; okLabel: string; onClose: () => void; onConfirm: () => Promise<void> | void; danger?: boolean; testID?: string; children?: React.ReactNode;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <BottomModal visible={visible} onClose={onClose} title={title} testID={testID}
      footer={<View style={{ flexDirection: 'row', gap: S[2] }}>
        <Btn title={t('common.cancel')} kind="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Btn title={okLabel} kind={danger ? 'danger' : 'primary'} loading={busy} style={{ flex: 1.4 }} testID={testID ? `${testID}-ok` : undefined}
          onPress={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }} />
      </View>}>
      <Txt v="md" color={C.ink2}>{text}</Txt>
      {children}
    </BottomModal>
  );
}

const st = StyleSheet.create({
  toastWrap: { position: 'absolute', left: 12, right: 12, zIndex: 1000, alignItems: 'center' },
  toast: { maxWidth: 560, width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: R.md, padding: S[3], borderLeftWidth: 5, ...shadow(2) },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: C.overlay },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '92%', backgroundColor: C.surface, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, ...shadow(3) },
  sheetHead: { flexDirection: 'row', alignItems: 'center', paddingLeft: S[4], paddingRight: S[2], paddingTop: S[3], paddingBottom: S[2], borderBottomWidth: 1, borderBottomColor: C.border },
  close: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: S[4], paddingTop: S[3], borderTopWidth: 1, borderTopColor: C.border },
  select: { minHeight: HIT, borderWidth: 1.5, borderColor: C.borderStrong, borderRadius: R.md, paddingHorizontal: S[3], flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface },
  opt: { minHeight: HIT, flexDirection: 'row', alignItems: 'center', gap: 12, padding: S[3], borderRadius: R.md, borderWidth: 1.5, borderColor: C.border },
});

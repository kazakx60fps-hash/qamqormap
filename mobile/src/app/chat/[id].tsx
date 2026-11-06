// Өтініш бойынша чат: тек автор, таңдалған орындаушы және координатор (сервер тексереді).
// Хабарламалар автордың тілінде көрсетіледі (аударылмайды). Оқылу күйі PostgreSQL-де сақталады.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, FlatList, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, HIT, R, S } from '../../theme';
import { Header } from '../../components/Screen';
import { Btn, Empty, ErrorView, IconBtn, Loading, Row, Txt } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/overlays';
import { useI18n } from '../../i18n';
import { useAuth } from '../../lib/auth';
import { useFmt } from '../../lib/fmt';
import { ApiError, api } from '../../lib/api';
import type { Message } from '../../lib/types';

const POLL = 4000;

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const rid = Number(id);
  const { t } = useI18n();
  const fmt = useFmt();
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refreshSummary } = useAuth();
  const [title, setTitle] = useState('');
  const [items, setItems] = useState<Message[]>([]);
  const [othersRead, setOthersRead] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<unknown>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const lastId = useRef(0);
  const list = useRef<FlatList>(null);
  const markedTo = useRef(0);

  const markRead = useCallback((upTo: number) => {
    if (upTo <= markedTo.current) return;
    markedTo.current = upTo;
    api(`/requests/${rid}/messages/read`, { method: 'POST', body: { last_id: upTo } }).then(() => refreshSummary()).catch(() => {});
  }, [rid, refreshSummary]);

  const poll = useCallback(async (initial = false) => {
    try {
      const r = await api<{ items: Message[]; others_read_id: number }>(`/requests/${rid}/messages`, { query: { after: initial ? 0 : lastId.current } });
      if (r.items.length) {
        lastId.current = Number(r.items[r.items.length - 1].id);
        setItems((cur) => {
          const seen = new Set(cur.map((m) => m.id));
          return [...cur, ...r.items.filter((m) => !seen.has(m.id))];
        });
        markRead(lastId.current);
      }
      setOthersRead(Number(r.others_read_id));
      setState('ready');
    } catch (e) {
      if (initial) { setError(e); setState('error'); }
    }
  }, [rid, markRead]);

  useEffect(() => {
    if (!user) return;
    api<{ request: { title: string } }>(`/requests/${rid}`).then((d) => setTitle(d.request.title)).catch(() => {});
    poll(true);
    const timer = setInterval(() => { if (AppState.currentState === 'active') poll(); }, POLL);
    return () => clearInterval(timer);
  }, [rid, user, poll]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      await api(`/requests/${rid}/messages`, { method: 'POST', body: { body } });
      setText('');
      await poll();
      setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
    } catch (e) {
      toast(fmt.errText(e), 'error');
    } finally {
      setSending(false);
    }
  };

  const forbidden = error instanceof ApiError && error.status === 403;
  return (
    <View style={st.wrap} testID="chat-screen">
      <Header title={t('chat.title')} right={<IconBtn icon="info" label={t('common.more')} onPress={() => router.push(`/request/${rid}`)} bg={C.bg} />} />
      {title ? <Txt v="sm" color={C.ink2} style={{ paddingHorizontal: S[4], marginTop: -4, marginBottom: 6 }} numberOfLines={2} ugc>{title}</Txt> : null}
      <Row gap={6} style={{ paddingHorizontal: S[4], paddingBottom: S[2] }}>
        <Icon name="lock" size={14} color={C.green} /><Txt v="xs" color={C.muted} style={{ flex: 1 }}>{t('chat.who')}</Txt>
      </Row>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 60}>
        {state === 'loading' ? <Loading text={t('chat.loading')} /> : state === 'error' ? (
          forbidden ? <Empty icon="lock" title={t('state.noAccess')} text={fmt.errText(error)} /> : <ErrorView text={fmt.errText(error)} onRetry={() => { setState('loading'); poll(true); }} />
        ) : (
          <FlatList
            ref={list}
            data={items}
            keyExtractor={(m) => String(m.id)}
            contentContainerStyle={{ padding: S[4], gap: S[2], flexGrow: 1 }}
            onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={<Empty icon="chat" title={t('chat.emptyTitle')} text={t('chat.emptyText')} />}
            renderItem={({ item }) => {
              const mine = item.sender_id === user?.id;
              return (
                <View style={[st.msg, mine ? st.mine : st.theirs]} testID={mine ? 'msg-mine' : 'msg-theirs'}>
                  {!mine ? <Txt v="xs" color={C.violet} ugc>{item.sender_name} · {t(`role.${item.sender_role}`)}</Txt> : null}
                  <Txt v="md" color={mine ? C.white : C.ink} selectable ugc>{item.body}</Txt>
                  <Row gap={4} style={{ alignSelf: 'flex-end' }}>
                    <Txt v="xs" color={mine ? '#DCE4FF' : C.muted}>{fmt.time(item.created_at)}</Txt>
                    {mine ? <Txt v="xs" color={mine ? '#DCE4FF' : C.muted} testID={item.id <= othersRead ? 'msg-read' : 'msg-sent'}>
                      {item.id <= othersRead ? `✓✓ ${t('m.chat.read')}` : `✓ ${t('m.chat.sent')}`}</Txt> : null}
                  </Row>
                </View>
              );
            }}
          />
        )}
        {state === 'ready' ? (
          <View style={[st.composer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            <TextInput value={text} onChangeText={setText} placeholder={t('chat.placeholder')} placeholderTextColor={C.subtle} multiline maxLength={2000}
              style={st.input} accessibilityLabel={t('chat.message')} testID="chat-input" />
            <Btn title={t('common.send')} icon="send" onPress={send} loading={sending} disabled={!text.trim()} testID="chat-send" />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  msg: { maxWidth: '84%', padding: S[3], borderRadius: R.lg, gap: 4 },
  mine: { alignSelf: 'flex-end', backgroundColor: C.primary, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderBottomLeftRadius: 4 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: S[3], paddingTop: S[2], backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border },
  input: { flex: 1, minHeight: HIT, maxHeight: 120, borderWidth: 1.5, borderColor: C.borderStrong, borderRadius: R.md, paddingHorizontal: S[3], paddingVertical: 10, ...F.md, color: C.ink },
});

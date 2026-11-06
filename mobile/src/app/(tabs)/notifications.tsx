// «Хабарламалар»: ішкі хабарламалар (алушының тілінде) және өтініштер бойынша чаттар (оқылу күйімен).
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { C, R, S } from '../../theme';
import { Header } from '../../components/Screen';
import { Btn, Empty, ErrorView, Loading, Row, Segmented, Txt } from '../../components/ui';
import { Icon, categoryIcon } from '../../components/Icon';
import { LoginPrompt } from '../../components/LoginPrompt';
import { useToast } from '../../components/overlays';
import { useI18n } from '../../i18n';
import { useAuth } from '../../lib/auth';
import { useFmt } from '../../lib/fmt';
import { useLoad } from '../../lib/useLoad';
import { api } from '../../lib/api';
import type { ChatItem, Notification } from '../../lib/types';

const NOTIF_ICON: Record<string, string> = {
  approved: 'checkCircle', rejected: 'edit', duplicate: 'copy', application: 'hand', assigned: 'user', assigned_author: 'user',
  started: 'clock', completion_submitted: 'checkCircle', completed: 'heart', disputed: 'alert', cancelled: 'ban', message: 'chat',
  review_needed: 'shield', resubmitted: 'refresh', report_new: 'siren', event_linked: 'siren', report_accepted: 'check', report_dismissed: 'info',
};

export default function NotificationsTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const router = useRouter();
  const toast = useToast();
  const { user, summary, refreshSummary } = useAuth();
  const [seg, setSeg] = useState<'notifications' | 'chats'>('notifications');

  const notifs = useLoad(() => api<{ items: Notification[]; unread: number }>('/me/notifications'), [user?.id], { enabled: !!user && seg === 'notifications' });
  const chats = useLoad(() => api<{ items: ChatItem[]; unread: number }>('/me/chats'), [user?.id], { enabled: !!user && seg === 'chats' });
  useFocusEffect(useCallback(() => {
    if (!user) return;
    if (seg === 'notifications') notifs.silent(); else chats.silent();
  }, [user, seg])); // eslint-disable-line react-hooks/exhaustive-deps

  const openNotif = async (n: Notification) => {
    if (!n.read_at) {
      api('/me/notifications/read', { method: 'POST', body: { ids: [n.id] } }).then(() => { notifs.silent(); refreshSummary(); }).catch(() => {});
    }
    if (n.request_id) router.push(n.type === 'message' ? `/chat/${n.request_id}` : `/request/${n.request_id}`);
    else if (n.params?.event_id) router.push(`/event/${n.params.event_id}`);
    else if (n.type === 'report_new') router.push('/coordinator?view=reports');
  };
  const readAll = async () => {
    try {
      await api('/me/notifications/read', { method: 'POST', body: {} });
      toast(t('dash.readAllDone'));
      notifs.silent();
      refreshSummary();
    } catch (e) { toast(fmt.errText(e), 'error'); }
  };

  const unreadN = summary?.unread ?? 0;
  const unreadC = summary?.unread_chats ?? 0;

  return (
    <View style={st.wrap} testID="notifications-screen">
      <Header title={t('m.tabs.notifications')} back={false} />
      {!user ? <LoginPrompt text={t('m.notif.loginText')} /> : (
        <>
          <View style={{ paddingHorizontal: S[4], paddingBottom: S[2], gap: S[2] }}>
            <Segmented value={seg} onChange={setSeg} testID="notif-seg" options={[
              { value: 'notifications', label: `${t('m.notif.seg.notifications')}${unreadN ? ` · ${unreadN}` : ''}` },
              { value: 'chats', label: `${t('m.notif.seg.chats')}${unreadC ? ` · ${unreadC}` : ''}` },
            ]} />
            {seg === 'notifications' && unreadN > 0 ? <Btn title={t('dash.readAll')} kind="ghost" small icon="check" onPress={readAll} testID="read-all" style={{ alignSelf: 'flex-end' }} /> : null}
          </View>
          {seg === 'notifications' ? (
            notifs.loading ? <Loading /> : notifs.error ? <ErrorView text={fmt.errText(notifs.error)} onRetry={notifs.reload} /> : (
              <FlatList
                data={notifs.data?.items ?? []}
                keyExtractor={(n) => String(n.id)}
                contentContainerStyle={{ padding: S[4], gap: S[2], paddingBottom: S[8] }}
                refreshControl={<RefreshControl refreshing={notifs.refreshing} onRefresh={notifs.refresh} tintColor={C.primary} />}
                ListEmptyComponent={<Empty icon="bell" title={t('dash.empty.notifications')} text={t('dash.empty.notificationsText')} />}
                renderItem={({ item }) => {
                  const tx = fmt.notifText(item);
                  return (
                    <Pressable onPress={() => openNotif(item)} style={[st.item, !item.read_at && st.unread]} accessibilityRole="button"
                      accessibilityLabel={`${item.read_at ? '' : t('m.notif.unread') + ': '}${tx.title}`} testID={`notif-${item.type}`}>
                      <View style={[st.ico, !item.read_at && { backgroundColor: C.primary }]}>
                        <Icon name={NOTIF_ICON[item.type] ?? 'bell'} size={20} color={item.read_at ? C.primary : C.white} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Txt v="sm" style={{ fontWeight: item.read_at ? '600' : '800' }} ugc>{tx.title}</Txt>
                        {tx.body ? <Txt v="sm" color={C.ink2} numberOfLines={3} ugc>{tx.body}</Txt> : null}
                        <Txt v="xs" color={C.muted}>{fmt.rel(item.created_at)}</Txt>
                      </View>
                      {!item.read_at ? <View style={st.dot} /> : null}
                    </Pressable>
                  );
                }}
              />
            )
          ) : chats.loading ? <Loading /> : chats.error ? <ErrorView text={fmt.errText(chats.error)} onRetry={chats.reload} /> : (
            <FlatList
              data={chats.data?.items ?? []}
              keyExtractor={(c) => String(c.id)}
              contentContainerStyle={{ padding: S[4], gap: S[2], paddingBottom: S[8] }}
              refreshControl={<RefreshControl refreshing={chats.refreshing} onRefresh={chats.refresh} tintColor={C.primary} />}
              ListEmptyComponent={<Empty icon="chat" title={t('m.notif.noChats')} text={t('m.notif.noChatsText')} />}
              renderItem={({ item }) => (
                <Pressable onPress={() => router.push(`/chat/${item.id}`)} style={[st.item, item.unread > 0 && st.unread]} accessibilityRole="button"
                  accessibilityLabel={item.title} testID={`chat-item-${item.id}`}>
                  <View style={[st.ico, { backgroundColor: item.category_color }]}><Icon name={categoryIcon(item.category_code)} size={20} color={C.white} /></View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt v="sm" style={{ fontWeight: '800' }} numberOfLines={2} ugc>{item.title}</Txt>
                    <Txt v="sm" color={C.ink2} numberOfLines={2} ugc>
                      {item.last_body ? `${item.last_mine ? t('chat.you') + ': ' : ''}${item.last_body}` : t('chat.emptyText')}
                    </Txt>
                    <Row gap={6}>
                      <Txt v="xs" color={C.muted}>{item.last_at ? fmt.rel(item.last_at) : t(`status.${item.status}`)}</Txt>
                      <Txt v="xs" color={C.muted}>· {item.i_am_author ? t('request.yours') : t('request.youAssignee')}</Txt>
                    </Row>
                  </View>
                  {item.unread > 0 ? <View style={st.count}><Txt v="xs" color={C.white}>{item.unread}</Txt></View> : null}
                </Pressable>
              )}
            />
          )}
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  item: { flexDirection: 'row', gap: S[3], padding: S[3], backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, alignItems: 'flex-start', minHeight: 64 },
  unread: { borderColor: C.primary100, backgroundColor: '#F8F9FF' },
  ico: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary50, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary, marginTop: 6 },
  count: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});

// Мәртебе белгілері: түс әрқашан мәтінмен және иконкамен бірге.
import { C, MODERATION_COLOR, STATUS_COLOR } from '../theme';
import { Badge } from './ui';
import { categoryIcon, disasterIcon } from './Icon';
import { useI18n } from '../i18n';

const STATUS_ICON: Record<string, string> = {
  open: 'heart', assigned: 'user', in_progress: 'clock', awaiting_confirmation: 'checkCircle', completed: 'check', cancelled: 'ban',
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const c = STATUS_COLOR[status] ?? STATUS_COLOR.open;
  return <Badge label={t(`status.${status}`)} fg={c.fg} bg={c.bg} icon={STATUS_ICON[status]} testID={`status-${status}`} />;
}

export function ModerationBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const c = MODERATION_COLOR[status] ?? MODERATION_COLOR.draft;
  const icon = status === 'approved' ? 'shield' : status === 'rejected' ? 'edit' : status === 'pending' ? 'clock' : 'edit';
  return <Badge label={t(`moderation.${status}`)} fg={c.fg} bg={c.bg} icon={icon} testID={`moderation-${status}`} />;
}

export function UrgencyBadge({ urgency }: { urgency: string }) {
  const { t } = useI18n();
  if (urgency !== 'high') return null;
  return <Badge label={t('urgency.high')} fg={C.red} bg={C.red50} icon="alert" />;
}

export function CategoryBadge({ code, color }: { code: string; color?: string }) {
  const { t } = useI18n();
  return <Badge label={t(`catShort.${code}`)} fg={color ?? C.primary} bg={C.surface2} icon={categoryIcon(code)} />;
}

export function VerifyBadge({ status }: { status: string }) {
  const { t } = useI18n();
  return status === 'verified'
    ? <Badge label={t('verify.verified')} fg={C.green} bg={C.green50} icon="shield" testID="verify-verified" />
    : <Badge label={t('verify.unverified')} fg={C.amber} bg={C.amber50} icon="alert" testID="verify-unverified" />;
}

export function ActivityBadge({ status }: { status: string }) {
  const { t } = useI18n();
  return status === 'active'
    ? <Badge label={t('activity.active')} fg={C.disasterDark} bg={C.disaster50} icon="siren" />
    : <Badge label={t('activity.resolved')} fg={C.muted} bg={C.surface2} icon="check" />;
}

export function DisasterTypeBadge({ code }: { code: string }) {
  const { t } = useI18n();
  return <Badge label={t(`dtype.${code}`)} fg={C.white} bg={C.disaster} icon={disasterIcon(code)} />;
}

export function DemoBadge({ event }: { event?: boolean }) {
  const { t } = useI18n();
  return <Badge label={t(event ? 'demo.eventBadge' : 'demo.badge')} fg={C.demo} bg={C.demo50} icon="flag" testID="demo-badge" />;
}

// Тіркелген сурет: жеке суреттер Bearer токенімен жүктеледі (рұқсатты сервер тексереді).
import { useState } from 'react';
import { Image, View } from 'react-native';
import { C, R } from '../theme';
import { attachmentUrl, authHeaders } from '../lib/api';
import { Icon } from './Icon';

export function Photo({ id, alt, size = 140 }: { id: number; alt: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <View style={{ width: size, height: size, borderRadius: R.md, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}><Icon name="image" color={C.muted} /></View>;
  }
  return (
    <Image
      source={{ uri: attachmentUrl(id), headers: authHeaders() }}
      accessibilityLabel={alt}
      onError={() => setFailed(true)}
      style={{ width: size, height: size, borderRadius: R.md, backgroundColor: C.surface2 }}
      resizeMode="cover"
    />
  );
}

// Веб-нұсқа (тексеру үшін): сол карта беті iframe ішінде.
import React, { forwardRef, useCallback, useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { buildMapHtml } from './mapHtml';
import { useBridge } from './useBridge';
import type { MapHandle, MapProps } from './types';

export const QMap = forwardRef<MapHandle, MapProps>(function QMap(props, ref) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const post = useCallback((msg: object) => {
    frame.current?.contentWindow?.postMessage({ __qmIn: JSON.stringify(msg) }, '*');
  }, []);
  const { onMessage } = useBridge(props, ref, post);
  useEffect(() => {
    const h = (ev: MessageEvent) => {
      if (ev.source === frame.current?.contentWindow && ev.data && typeof ev.data.__qm === 'string') onMessage(ev.data.__qm);
    };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, [onMessage]);
  const html = useMemo(() => buildMapHtml(props.demoLabel), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={props.style} testID={props.testID} accessibilityLabel={props.accessibilityLabel}>
      {React.createElement('iframe', {
        ref: frame,
        srcDoc: html,
        title: props.accessibilityLabel ?? 'map',
        'data-testid': props.testID ? `${props.testID}-frame` : undefined,
        style: { border: 0, width: '100%', height: '100%', display: 'block', background: '#E8ECF4' },
      })}
    </View>
  );
});

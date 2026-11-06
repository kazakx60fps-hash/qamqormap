// Android / iOS: карта react-native-webview ішінде.
import React, { forwardRef, useCallback, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { WebView as RNWebView } from 'react-native-webview';

// react-native-webview типтері RN 0.88-пен толық үйлеспейді, сондықтан компонент жалпы түрмен қолданылады
const WebView = RNWebView as unknown as React.ComponentType<any>;
import { buildMapHtml } from './mapHtml';
import { useBridge } from './useBridge';
import type { MapHandle, MapProps } from './types';

export const QMap = forwardRef<MapHandle, MapProps>(function QMap(props, ref) {
  const web = useRef<{ injectJavaScript: (js: string) => void } | null>(null);
  const post = useCallback((msg: object) => {
    web.current?.injectJavaScript(`window.__qm && window.__qm(${JSON.stringify(JSON.stringify(msg))});true;`);
  }, []);
  const { onMessage } = useBridge(props, ref, post);
  // HTML бір рет құрылады (тіл ауысса да карта қайта жүктелмейді)
  const html = useMemo(() => buildMapHtml(props.demoLabel), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={props.style} testID={props.testID} accessibilityLabel={props.accessibilityLabel}>
      <WebView
        ref={web}
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://qamqormap.app/' }}
        onMessage={(e: { nativeEvent: { data: string } }) => onMessage(e.nativeEvent.data)}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback={false}
        overScrollMode="never"
        bounces={false}
        scrollEnabled={false}
        style={{ flex: 1, backgroundColor: '#E8ECF4' }}
      />
    </View>
  );
});

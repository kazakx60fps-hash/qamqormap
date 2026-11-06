// QamqorMap мобильді логотипі: көк-күлгін градиенттегі белгі, ішінде жүрек пен екі «қол» доғасы.
import { View, Text, StyleSheet } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { C } from '../theme';

export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="q" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2F56F0"/><stop offset="1" stop-color="#7A4DF2"/></linearGradient></defs>
<rect width="64" height="64" rx="18" fill="url(#q)"/>
<path d="M32 53s-15-12.6-15-24.2a15 15 0 0 1 30 0C47 40.4 32 53 32 53Z" fill="none" stroke="#fff" stroke-width="4.2" stroke-linejoin="round"/>
<path d="M32 36.2l-5-4.8a3.4 3.4 0 0 1 5-4.6 3.4 3.4 0 0 1 5 4.6Z" fill="#fff"/>
<circle cx="47.5" cy="16.5" r="5" fill="#FF8A3D" stroke="#fff" stroke-width="2.5"/>
</svg>`;

export function Logo({ size = 36, withText = false, light = false }: { size?: number; withText?: boolean; light?: boolean }) {
  return (
    <View style={s.row} accessibilityRole="image" accessibilityLabel="QamqorMap">
      <SvgXml xml={LOGO_SVG} width={size} height={size} />
      {withText ? (
        <Text style={[s.text, { fontSize: size * 0.56, color: light ? C.white : C.ink }]}>
          Qamqor<Text style={{ color: light ? '#C9D4FF' : C.primary }}>Map</Text>
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  text: { fontWeight: '800', letterSpacing: -0.4 },
});

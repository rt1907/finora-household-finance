import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { Colors } from '@/constants/theme';

interface FinoraBrandIconProps {
  size?: number;
  showCurrency?: boolean;
}

/**
 * Finora Brand Emblem
 * Captures "Shared Household Financial Space" by fusing:
 * 1. A welcoming household roof structure
 * 2. Shared collaborative partner pillars
 * 3. A central financial currency coin token
 */
export function FinoraBrandIcon({
  size = 36,
  showCurrency = true,
}: FinoraBrandIconProps) {
  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.28),
        },
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="finoraGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#0D9488" />
            <Stop offset="100%" stopColor="#115E59" />
          </LinearGradient>
          <LinearGradient id="coinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#FBBF24" />
            <Stop offset="100%" stopColor="#D97706" />
          </LinearGradient>
        </Defs>

        {/* Background rounded container */}
        <Rect
          x="0"
          y="0"
          width="100"
          height="100"
          rx="28"
          fill="url(#finoraGrad)"
        />

        {/* Roof of Household */}
        <Path
          d="M 50 14 L 84 40 L 76 40 L 50 20 L 24 40 L 16 40 Z"
          fill="#CCFBF1"
        />

        {/* Partner A (Left silhouette) */}
        <Circle cx="32" cy="52" r="8" fill="#E6FFFA" />
        <Path
          d="M 22 74 C 22 64 42 64 42 74 Z"
          fill="#E6FFFA"
          opacity="0.9"
        />

        {/* Partner B (Right silhouette) */}
        <Circle cx="68" cy="52" r="8" fill="#E6FFFA" />
        <Path
          d="M 58 74 C 58 64 78 64 78 74 Z"
          fill="#E6FFFA"
          opacity="0.9"
        />

        {/* Central Financial Currency / Shared Coin */}
        {showCurrency && (
          <>
            <Circle
              cx="50"
              cy="62"
              r="15"
              fill="url(#coinGrad)"
              stroke="#FFFFFF"
              strokeWidth="2.5"
            />
            <SvgText
              x="50"
              y="68"
              fill="#FFFFFF"
              fontSize="16"
              fontWeight="900"
              textAnchor="middle"
            >
              ₹
            </SvgText>
          </>
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
});

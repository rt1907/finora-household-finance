import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Colors, Spacing } from '@/constants/theme';

interface KpiRadialGaugeProps {
  percentage: number;
  label?: string;
  subLabel?: string;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
}

export function KpiRadialGauge({
  percentage,
  label = 'Share',
  subLabel,
  size = 130,
  strokeWidth = 11,
  color = Colors.primary,
  trackColor = Colors.border,
}: KpiRadialGaugeProps) {
  const clampedPct = Math.min(Math.max(percentage, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedPct / 100) * circumference;
  const center = size / 2;

  return (
    <View style={styles.container}>
      <View style={[styles.gaugeWrapper, { width: size, height: size }]}>
        <Svg width={size} height={size}>
          <G rotation="-90" origin={`${center}, ${center}`}>
            {/* Background Track Circle */}
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke={trackColor}
              strokeWidth={strokeWidth}
              fill="none"
            />
            {/* Foreground Animated Progress Circle */}
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke={color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="none"
            />
          </G>
        </Svg>

        {/* Center Content */}
        <View style={styles.centerOverlay}>
          <Text
            style={styles.percentageText}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {clampedPct}%
          </Text>
          {label ? (
            <Text
              style={styles.labelText}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {label}
            </Text>
          ) : null}
        </View>
      </View>

      {subLabel ? (
        <Text style={styles.subLabelText} numberOfLines={2}>
          {subLabel}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
  },
  gaugeWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: '75%',
    height: '75%',
  },
  percentageText: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  labelText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  subLabelText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
});


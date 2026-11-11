import React, { useState } from 'react';
import {
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { BorderRadius, Colors, Spacing } from '@/constants/theme';
import { formatCurrencyAmount } from '@/utils/date';

export interface PieSlice {
  id: string;
  label: string;
  value: number;
  color: string;
  subtitle?: string;
}

interface ResponsivePieChartProps {
  slices: PieSlice[];
  currency?: string;
  centerLabel?: string;
  centerValue?: string;
  showLegend?: boolean;
  donut?: boolean;
  emptyMessage?: string;
  maxChartSize?: number;
}

/**
 * Calculates SVG Path string for a pie or donut slice arc.
 */
function createArcPath(
  cx: number,
  cy: number,
  radius: number,
  innerRadius: number,
  startAngleDeg: number,
  endAngleDeg: number
): string {
  // Clamp angle delta so it does not exceed 359.999 to prevent SVG arc degenerate loops
  const angleDelta = Math.min(endAngleDeg - startAngleDeg, 359.999);
  const effectiveEndAngle = startAngleDeg + angleDelta;

  const startRad = ((startAngleDeg - 90) * Math.PI) / 180;
  const endRad = ((effectiveEndAngle - 90) * Math.PI) / 180;

  const x1 = cx + radius * Math.cos(startRad);
  const y1 = cy + radius * Math.sin(startRad);
  const x2 = cx + radius * Math.cos(endRad);
  const y2 = cy + radius * Math.sin(endRad);

  const largeArcFlag = angleDelta > 180 ? 1 : 0;

  if (innerRadius <= 0) {
    return `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
  }

  const ix1 = cx + innerRadius * Math.cos(endRad);
  const iy1 = cy + innerRadius * Math.sin(endRad);
  const ix2 = cx + innerRadius * Math.cos(startRad);
  const iy2 = cy + innerRadius * Math.sin(startRad);

  return [
    `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `L ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${ix2.toFixed(2)} ${iy2.toFixed(2)}`,
    'Z',
  ].join(' ');
}

export function ResponsivePieChart({
  slices,
  currency = 'INR',
  centerLabel,
  centerValue,
  showLegend = true,
  donut = true,
  emptyMessage = 'No expenditure recorded yet',
  maxChartSize = 220,
}: ResponsivePieChartProps) {
  const [containerWidth, setContainerWidth] = useState<number>(300);

  const onLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (width > 0 && Math.abs(width - containerWidth) > 5) {
      setContainerWidth(width);
    }
  };

  // Filter valid non-negative slices
  const validSlices = slices.filter((s) => s.value > 0);
  const total = validSlices.reduce((acc, curr) => acc + curr.value, 0);

  // Responsive chart size: max out at maxChartSize or 75% of container
  const chartSize = Math.max(160, Math.min(maxChartSize, containerWidth - Spacing.lg * 2));
  const cx = chartSize / 2;
  const cy = chartSize / 2;
  const radius = chartSize / 2 - 8;
  const innerRadius = donut ? radius * 0.6 : 0;

  const sliceArcs = validSlices.reduce<{
    arcs: (PieSlice & { percentage: number; path: string })[];
    angle: number;
  }>(
    (acc, slice) => {
      const fraction = slice.value / total;
      const sweep = fraction * 360;
      const startAngle = acc.angle;
      const endAngle = acc.angle + sweep;
      const path = createArcPath(cx, cy, radius, innerRadius, startAngle, endAngle);
      const pct = Math.round(fraction * 100);

      acc.arcs.push({
        ...slice,
        percentage: pct,
        path,
      });
      acc.angle = endAngle;
      return acc;
    },
    { arcs: [], angle: 0 }
  ).arcs;

  return (
    <View style={styles.container} onLayout={onLayout}>
      {total <= 0 ? (
        <View style={[styles.emptyContainer, { height: chartSize }]}>
          <Svg width={chartSize} height={chartSize}>
            <Circle
              cx={cx}
              cy={cy}
              r={radius}
              stroke={Colors.border}
              strokeWidth={donut ? 18 : 2}
              fill={donut ? 'none' : Colors.background}
              strokeDasharray="6,6"
            />
          </Svg>
          <View style={styles.emptyOverlay}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={styles.emptyText}>{emptyMessage}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.chartWrapper}>
          <View style={[styles.svgWrapper, { width: chartSize, height: chartSize }]}>
            <Svg width={chartSize} height={chartSize}>
              <G>
                {sliceArcs.map((slice) => (
                  <Path
                    key={slice.id}
                    d={slice.path}
                    fill={slice.color}
                    stroke={Colors.surface}
                    strokeWidth={2}
                  />
                ))}
              </G>
            </Svg>

            {/* Donut Center Display */}
            {donut && (
              <View
                style={[
                  styles.centerDisplay,
                  {
                    width: innerRadius * 2 - 8,
                    height: innerRadius * 2 - 8,
                    borderRadius: innerRadius,
                  },
                ]}
              >
                <Text
                  style={styles.centerLabelText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {centerLabel ?? 'Total'}
                </Text>
                <Text
                  style={styles.centerValueText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {centerValue ?? formatCurrencyAmount(total, currency)}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Responsive Legend Breakdown */}
      {showLegend && validSlices.length > 0 && (
        <View style={styles.legendContainer}>
          {sliceArcs.map((slice) => (
            <View key={slice.id} style={styles.legendItem}>
              <View style={styles.legendLeft}>
                <View style={[styles.legendDot, { backgroundColor: slice.color }]} />
                <View style={styles.legendTextCol}>
                  <Text style={styles.legendLabel} numberOfLines={1}>
                    {slice.label}
                  </Text>
                  {slice.subtitle ? (
                    <Text style={styles.legendSubtitle} numberOfLines={1}>
                      {slice.subtitle}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.legendRight}>
                <Text style={styles.legendAmount}>
                  {formatCurrencyAmount(slice.value, currency)}
                </Text>
                <View
                  style={[
                    styles.legendBadge,
                    { backgroundColor: `${slice.color}15` },
                  ]}
                >
                  <Text style={[styles.legendPercentage, { color: slice.color }]}>
                    {slice.percentage}%
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
  chartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.sm,
  },
  svgWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerDisplay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.xs,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  centerLabelText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  centerValueText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  emptyContainer: {
    position: 'relative',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  emptyIcon: {
    fontSize: 28,
    marginBottom: Spacing.xs,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
    textAlign: 'center',
  },
  legendContainer: {
    width: '100%',
    marginTop: Spacing.md,
    gap: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs + 2,
  },
  legendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: Spacing.sm,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
  },
  legendTextCol: {
    flex: 1,
  },
  legendLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  legendSubtitle: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  legendRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  legendAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  legendBadge: {
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  legendPercentage: {
    fontSize: 11,
    fontWeight: '800',
  },
});

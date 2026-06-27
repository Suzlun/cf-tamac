'use client';

import * as React from 'react';
import * as RechartsPrimitive from 'recharts';

import { cn } from '@cf-tamac/client/lib/utils';

const THEMES = { light: '', dark: '.dark' } as const;

/**
 * Chart component 群へ渡す series 設定。
 *
 * key は Recharts payload の `dataKey` や `name` に対応し、label/icon/color/theme を
 * UI 表示用に解決します。戻り値を持つ型ではなく、ChartContainer と Tooltip/Legend が
 * 同じ表示設定を共有するための入力契約です。
 */
export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
>;

interface ChartContextProps {
  config: ChartConfig;
}

interface ChartPayloadItem {
  source: Record<string, unknown>;
  payload?: Record<string, unknown>;
  type?: string;
  dataKey?: string;
  name?: string;
  value?: React.ReactNode;
  color?: string;
}

interface ChartTooltipContentProps extends React.ComponentProps<'div'> {
  active?: boolean;
  payload?: unknown;
  label?: unknown;
  labelFormatter?: (value: React.ReactNode, payload: ChartPayloadItem[]) => React.ReactNode;
  formatter?: (
    value: React.ReactNode,
    name: string,
    item: ChartPayloadItem,
    index: number,
    payload: Record<string, unknown> | undefined
  ) => React.ReactNode;
  hideLabel?: boolean;
  hideIndicator?: boolean;
  indicator?: 'line' | 'dot' | 'dashed';
  color?: string;
  nameKey?: string;
  labelKey?: string;
  labelClassName?: string;
}

interface ChartLegendContentProps extends React.ComponentProps<'div'> {
  payload?: unknown;
  verticalAlign?: string;
  hideIcon?: boolean;
  nameKey?: string;
}

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);

  if (context === null) {
    throw new Error('useChart must be used within a <ChartContainer />');
  }

  return context;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringFromUnknown(value: unknown): string | undefined {
  if (typeof value === 'string' && value !== '') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function reactNodeFromUnknown(value: unknown): React.ReactNode {
  if (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    React.isValidElement(value)
  ) {
    return value;
  }

  return null;
}

function normalizePayload(payload: unknown): ChartPayloadItem[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const nestedPayload = isRecord(item.payload) ? item.payload : undefined;

    return [
      {
        source: item,
        payload: nestedPayload,
        type: stringFromUnknown(item.type),
        dataKey: stringFromUnknown(item.dataKey),
        name: stringFromUnknown(item.name),
        value: reactNodeFromUnknown(item.value),
        color: stringFromUnknown(item.color),
      },
    ];
  });
}

function hasOwn(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function readStringField(
  record: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  if (record == null || !hasOwn(record, key)) {
    return undefined;
  }

  return stringFromUnknown(record[key]);
}

function getConfigEntry(config: ChartConfig, key: string) {
  return Object.prototype.hasOwnProperty.call(config, key) ? config[key] : undefined;
}

function getPayloadConfigFromPayload(config: ChartConfig, item: ChartPayloadItem, key: string) {
  const configLabelKey =
    readStringField(item.source, key) ?? readStringField(item.payload, key) ?? key;

  return getConfigEntry(config, configLabelKey) ?? getConfigEntry(config, key);
}

function resolveThemeColor(config: ChartConfig[string], theme: keyof typeof THEMES) {
  if ('theme' in config) {
    const themeConfig = config.theme;
    return themeConfig != null ? themeConfig[theme] : undefined;
  }

  return config.color;
}

function renderValue(value: React.ReactNode) {
  if (typeof value === 'number') {
    return value.toLocaleString();
  }

  if (typeof value === 'string' && value !== '') {
    return value;
  }

  if (React.isValidElement(value)) {
    return value;
  }

  return null;
}

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    config: ChartConfig;
    children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children'];
  }
>(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, '')}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        ref={ref}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
});
ChartContainer.displayName = 'Chart';

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(([, itemConfig]) => {
    const hasColor = 'color' in itemConfig && itemConfig.color != null;
    const hasTheme = 'theme' in itemConfig && itemConfig.theme != null;
    return hasColor || hasTheme;
  });

  if (colorConfig.length === 0) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: (Object.entries(THEMES) as [keyof typeof THEMES, string][])
          .map(([theme, prefix]) => {
            const variables = colorConfig
              .map(([key, itemConfig]) => {
                const color = resolveThemeColor(itemConfig, theme);
                return color != null && color !== '' ? `  --color-${key}: ${color};` : null;
              })
              .filter((line): line is string => line !== null)
              .join('\n');

            return `\n${prefix} [data-chart=${id}] {\n${variables}\n}\n`;
          })
          .join('\n'),
      }}
    />
  );
};

const ChartTooltip = RechartsPrimitive.Tooltip;

const ChartTooltipContent = React.forwardRef<HTMLDivElement, ChartTooltipContentProps>(
  (
    {
      active,
      payload,
      className,
      indicator = 'dot',
      hideLabel = false,
      hideIndicator = false,
      label,
      labelFormatter,
      labelClassName,
      formatter,
      color,
      nameKey,
      labelKey,
    },
    ref
  ) => {
    const { config } = useChart();
    const normalizedPayload = normalizePayload(payload);

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || normalizedPayload.length === 0) {
        return null;
      }

      const item = normalizedPayload.at(0);
      if (item == null) {
        return null;
      }
      const key = labelKey ?? item.dataKey ?? item.name ?? 'value';
      const itemConfig = getPayloadConfigFromPayload(config, item, key);
      const stringLabel = stringFromUnknown(label);
      const value =
        labelKey == null && stringLabel != null
          ? (getConfigEntry(config, stringLabel)?.label ?? stringLabel)
          : itemConfig?.label;

      if (labelFormatter != null) {
        return (
          <div className={cn('font-medium', labelClassName)}>
            {labelFormatter(value ?? null, normalizedPayload)}
          </div>
        );
      }

      if (value == null || value === '') {
        return null;
      }

      return <div className={cn('font-medium', labelClassName)}>{value}</div>;
    }, [config, hideLabel, label, labelClassName, labelFormatter, labelKey, normalizedPayload]);

    if (active !== true || normalizedPayload.length === 0) {
      return null;
    }

    const nestLabel = normalizedPayload.length === 1 && indicator !== 'dot';

    return (
      <div
        ref={ref}
        className={cn(
          'grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl',
          className
        )}
      >
        {nestLabel ? null : tooltipLabel}
        <div className="grid gap-1.5">
          {normalizedPayload
            .filter((item) => item.type !== 'none')
            .map((item, index) => {
              const key = nameKey ?? item.name ?? item.dataKey ?? 'value';
              const itemConfig = getPayloadConfigFromPayload(config, item, key);
              const indicatorColor = color ?? stringFromUnknown(item.payload?.fill) ?? item.color;
              const displayName = itemConfig?.label ?? item.name ?? key;
              const renderedValue = renderValue(item.value);

              return (
                <div
                  key={`${key}-${String(index)}`}
                  className={cn(
                    'flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground',
                    indicator === 'dot' && 'items-center'
                  )}
                >
                  {formatter != null && item.value != null && item.name != null ? (
                    formatter(item.value, item.name, item, index, item.payload)
                  ) : (
                    <>
                      {itemConfig?.icon != null ? (
                        <itemConfig.icon />
                      ) : (
                        !hideIndicator && (
                          <div
                            className={cn(
                              'shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]',
                              {
                                'h-2.5 w-2.5': indicator === 'dot',
                                'w-1': indicator === 'line',
                                'w-0 border-[1.5px] border-dashed bg-transparent':
                                  indicator === 'dashed',
                                'my-0.5': nestLabel && indicator === 'dashed',
                              }
                            )}
                            style={
                              {
                                '--color-bg': indicatorColor,
                                '--color-border': indicatorColor,
                              } as React.CSSProperties
                            }
                          />
                        )
                      )}
                      <div
                        className={cn(
                          'flex flex-1 justify-between leading-none',
                          nestLabel ? 'items-end' : 'items-center'
                        )}
                      >
                        <div className="grid gap-1.5">
                          {nestLabel ? tooltipLabel : null}
                          <span className="text-muted-foreground">{displayName}</span>
                        </div>
                        {renderedValue != null ? (
                          <span className="font-mono font-medium tabular-nums text-foreground">
                            {renderedValue}
                          </span>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    );
  }
);
ChartTooltipContent.displayName = 'ChartTooltip';

const ChartLegend = RechartsPrimitive.Legend;

const ChartLegendContent = React.forwardRef<HTMLDivElement, ChartLegendContentProps>(
  ({ className, hideIcon = false, payload, verticalAlign = 'bottom', nameKey }, ref) => {
    const { config } = useChart();
    const normalizedPayload = normalizePayload(payload);

    if (normalizedPayload.length === 0) {
      return null;
    }

    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center justify-center gap-4',
          verticalAlign === 'top' ? 'pb-3' : 'pt-3',
          className
        )}
      >
        {normalizedPayload
          .filter((item) => item.type !== 'none')
          .map((item, index) => {
            const key = nameKey ?? item.dataKey ?? 'value';
            const itemConfig = getPayloadConfigFromPayload(config, item, key);

            return (
              <div
                key={`${key}-${String(index)}`}
                className="flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground"
              >
                {itemConfig?.icon != null && !hideIcon ? (
                  <itemConfig.icon />
                ) : (
                  <div
                    className="h-2 w-2 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: item.color }}
                  />
                )}
                {itemConfig?.label}
              </div>
            );
          })}
      </div>
    );
  }
);
ChartLegendContent.displayName = 'ChartLegend';

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
};

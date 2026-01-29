import React, {
  FC,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import Highcharts, {
  Options,
  Point,
  Series,
  SeriesAreaOptions
} from 'highcharts';
import HighchartsReact from 'highcharts-react-official';

import ChartIconToggle from '@/components/ChartIconToggle/ChartIconToggle';
import { CompoundEvent } from '@/shared/hooks/useEventsApi';
import { Legend } from '@/shared/hooks/useLegends';
import { cn } from '@/shared/lib/classNames/classNames';
import { Format } from '@/shared/lib/utils/numbersFormatter';
import { noop } from '@/shared/lib/utils/utils';
import Button from '@/shared/ui/Button/Button';
import Each from '@/shared/ui/Each/Each';
import Icon from '@/shared/ui/Icon/Icon';
import View from '@/shared/ui/View/View';

import 'highcharts/modules/stock';
import 'highcharts/modules/mouse-wheel-zoom';

interface LineDataItem {
  x: number;
  y: number;
}

export interface LineChartSeries {
  name: string;
  data: LineDataItem[];
}

interface LineChartProps {
  groupBy: string;
  aggregatedSeries: SeriesAreaOptions[];
  chartRef?: RefObject<HighchartsReact.RefObject | null>;
  isLegendEnabled?: boolean;
  legends?: Legend[];
  showEvents?: boolean;
  events?: CompoundEvent[];
  className?: string;
  customTooltipFormatter?: (context: Point, groupBy: string) => string;
  customOptions?: Partial<Options>;
  onSelectAllLegends?: () => void;
  onDeselectAllLegends?: () => void;
  onShowEvents?: (value: boolean) => void;
  onLegendHover?: (id: string) => void;
  onLegendLeave?: (id?: string) => void;
  onLegendClick?: (id: string) => void;
  resetZoomKey?: string;
}

const LineChart: FC<LineChartProps> = ({
  groupBy,
  aggregatedSeries,
  chartRef = useRef<HighchartsReact.RefObject | null>(null),
  isLegendEnabled = false,
  showEvents = false,
  className,
  customTooltipFormatter,
  customOptions,
  events = [],
  legends = [],
  onSelectAllLegends = noop,
  onDeselectAllLegends = noop,
  onShowEvents = noop,
  onLegendHover = noop,
  onLegendLeave = noop,
  onLegendClick = noop,
  resetZoomKey
}) => {
  const programmaticChange = useRef(false);

  const currentZoom = useRef<{ min: number; max: number } | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);

  const [canScrollLeft, setCanScrollLeft] = useState(false);

  const [canScrollRight, setCanScrollRight] = useState(false);

  const areAllSeriesHidden = legends.every(({ isDisabled }) => isDisabled);

  const updateArrows = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 1);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

  const scrollByDir = (dir: 'left' | 'right') => {
    const el = viewportRef.current;
    if (!el) return;
    const step = Math.max(el.clientWidth * 0.6, 120);
    el.scrollBy({ left: dir === 'left' ? -step : step, behavior: 'smooth' });
  };

  const isLastActiveLegend =
    legends.filter(({ isDisabled }) => !isDisabled).length === 1;

  const dataExtremes = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    aggregatedSeries.forEach((series) => {
      (series.data || []).forEach((point) => {
        const x = Array.isArray(point)
          ? Number(point[0])
          : Number((point as { x?: number }).x);
        if (!Number.isFinite(x)) return;
        min = Math.min(min, x);
        max = Math.max(max, x);
      });
    });

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return null;
    }

    return { min, max };
  }, [aggregatedSeries]);

  useEffect(() => {
    if (resetZoomKey === undefined) return;
    const chart = chartRef.current?.chart;
    if (!chart || !dataExtremes) return;

    const extremes = chart.xAxis[0].getExtremes();
    if (
      extremes.min === dataExtremes.min &&
      extremes.max === dataExtremes.max
    ) {
      return;
    }

    currentZoom.current = null;
    programmaticChange.current = true;
    chart.xAxis[0].setExtremes(dataExtremes.min, dataExtremes.max, true, false);
  }, [chartRef, dataExtremes, resetZoomKey]);

  useEffect(() => {
    const chart = chartRef.current?.chart;

    if (!chart) return;

    let highlightedSeries: Series | null = null;

    let isNeedRedraw = false;

    for (const legend of legends) {
      const series = chart?.series.find(({ name }) => name === legend.name);

      if (!series) continue;

      if (series.visible !== !legend.isDisabled) {
        series.setVisible(!legend.isDisabled, false);

        isNeedRedraw = true;
      }

      if (!legend.isDisabled && legend.isHighlighted) {
        highlightedSeries = series;
      }
    }

    if (isNeedRedraw) {
      chart.redraw();
    }

    if (!highlightedSeries) return;

    for (const series of chart?.series ?? []) {
      const config = { opacity: 0 };

      if (highlightedSeries === series) {
        config.opacity = 1;

        //@ts-expect-error wrong Highcharts types
        series.group?.attr(config);

        //@ts-expect-error wrong Highcharts types
        series.markerGroup?.attr?.(config);

        //@ts-expect-error wrong Highcharts types
        series.dataLabelsGroup?.attr?.(config);

        //@ts-expect-error wrong Highcharts types
        series.group?.toFront();
      } else {
        config.opacity = 0.25;

        //@ts-expect-error wrong Highcharts types
        series.group?.attr(config);

        //@ts-expect-error wrong Highcharts types
        series.markerGroup?.attr?.(config);

        //@ts-expect-error wrong Highcharts types
        series.dataLabelsGroup?.attr?.(config);
      }
    }
  }, [legends]);

  const defaultTooltipFormatter = useCallback(
    (context: any) => {
      const header = `<div style="font-weight: 500; margin-bottom: 12px; font-size: 11px; font-family: 'Haas Grot Text R', sans-serif;">${Highcharts.dateFormat('%B %e, %Y', context.x as number)}</div>`;

      if (groupBy === 'none') {
        const point = context.points?.find(
          (p: { series: { type: string } }) => p.series.type === 'area'
        );
        if (!point) return '';
        return `${header}<div style="display: flex; justify-content: space-between; align-items: center; gap: 16px;"><div style="display: flex; align-items: center; gap: 8px;"><span style="background-color:${point.series.color}; width: 8px; height: 8px; display: inline-block; border-radius: 2px;"></span><span style="font-size: 11px; font-family: 'Haas Grot Text R', sans-serif;">${point.series.name}</span></div><span style="font-weight: 400; font-size: 11px; font-family: 'Haas Grot Text R', sans-serif;">${Highcharts.numberFormat(point.y ?? 0, 0, '.', ',')}</span></div>`;
      }

      const dataPoints = (context.points || []).filter(
        (p: { series: { type: string } }) => p.series.type !== 'scatter'
      );
      const sortedPoints = [...dataPoints].sort(
        (a, b) => (b.y ?? 0) - (a.y ?? 0)
      );
      let total = 0;
      sortedPoints.forEach((point) => {
        total += point.y ?? 0;
      });
      let body = '';
      if (groupBy === 'Market') {
        const midPoint = Math.ceil(sortedPoints.length / 2);
        const col1Points = sortedPoints.slice(0, midPoint);
        const col2Points = sortedPoints.slice(midPoint);
        const renderColumn = (points: Highcharts.Point[]) =>
          points
            .map(
              (point) =>
                `<div style="display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px;"><span style="background-color:${point.series.color}; width: 10px; height: 10px; display: inline-block; border-radius: 2px;"></span><span style="white-space: nowrap; font-size: 11px; font-family: 'Haas Grot Text R', sans-serif;">${point.series.name}</span><span style="font-weight: 400; text-align: right; font-size: 11px; font-family: 'Haas Grot Text R', sans-serif;">${Format.price(point.y ?? 0, 'standard')}</span></div>`
            )
            .join('');
        body = `<div style="display: flex; gap: 24px;"><div style="display: flex; flex-direction: column;">${renderColumn(col1Points)}</div><div style="display: flex; flex-direction: column;">${renderColumn(col2Points)}</div></div>`;
      } else {
        body = sortedPoints
          .map(
            (point) =>
              `<div style="display: flex; justify-content: space-between; align-items: center; gap: 16px;"><div style="display: flex; align-items: center; gap: 8px;"><span style="background-color:${point.series.color}; width: 10px; height: 10px; display: inline-block; border-radius: 2px;"></span><span style="font-size: 11px; font-family: 'Haas Grot Text R', sans-serif;">${point.series.name}</span></div><span style="font-weight: 400; font-size: 11px; font-family: 'Haas Grot Text R', sans-serif;">${Format.price(point.y ?? 0, 'standard')}</span></div>`
          )
          .join('');
      }
      const footer = `<div style=" padding-top: 8px; display: flex; justify-content: space-between; align-items: center; gap: 16px;"><span style="font-weight: 400; font-size: 11px; font-family: 'Haas Grot Text R', sans-serif;">Total</span><span style="font-weight: 400; font-size: 11px; font-family: 'Haas Grot Text R', sans-serif;">${Format.price(total, 'standard')}</span></div>`;
      return header + body + footer;
    },
    [groupBy]
  );

  const options: Highcharts.Options = useMemo(() => {
    const yPositions = [40, 60, 80, 100, 120, 140, 160, 180];

    let eventPlotLines: Highcharts.XAxisPlotLinesOptions[] = [];

    if (showEvents) {
      eventPlotLines = events.map((event, index) => ({
        color: '#7A8A99',
        width: 1,
        value: event.date * 1000,
        dashStyle: 'Dash',
        zIndex: 3,
        label: {
          text: event.name,
          rotation: 0,
          align: 'right',
          verticalAlign: 'top',
          y: yPositions[index % yPositions.length],
          x: -5,
          style: {
            color: 'var(--color-primary-11)',
            fontSize: '11px',
            fontFamily: 'Haas Grot Text R, sans-serif'
          }
        }
      }));
    }

    const bringMarkersToFront = (chart: Highcharts.Chart) => {
      chart.series.forEach((s: any) => {
        s.markerGroup?.toFront?.();
        s.dataLabelsGroup?.toFront?.();
      });
    };

    const baseOptions: Highcharts.Options = {
      chart: {
        type: 'area',
        backgroundColor: 'transparent',
        plotBorderWidth: 0,
        plotShadow: false,
        animation: false,
        panning: { enabled: true, type: 'x' },
        zooming: {
          mouseWheel: {
            enabled: true,
            type: 'x',
            preventDefault: true
          },
          pinchType: 'x',
          resetButton: { theme: { display: 'none' } }
        },
        events: {
          load: function () {
            if (currentZoom.current) {
              this.xAxis[0].setExtremes(
                currentZoom.current.min,
                currentZoom.current.max,
                false
              );
            }

            bringMarkersToFront(this as Highcharts.Chart);
          },
          render: function () {
            bringMarkersToFront(this as Highcharts.Chart);
          }
        }
      },
      credits: { enabled: false },
      title: { text: '' },
      xAxis: {
        type: 'datetime',
        gridLineWidth: 0,
        startOnTick: false,
        endOnTick: false,
        minPadding: 0,
        maxPadding: 0,
        tickPixelInterval: 75,
        plotLines: eventPlotLines,
        labels: {
          style: {
            color: '#7A8A99',
            fontSize: '11px',
            fontFamily: 'Haas Grot Text R, sans-serif'
          },
          rotation: 0
        },
        dateTimeLabelFormats: {
          day: '%b %d',
          week: '%b %d',
          month: "%b '%y",
          year: '%Y'
        },
        lineColor: '#7A8A99',
        tickColor: '#7A8A99',
        crosshair: {
          width: 1,
          color: '#7A8A99',
          dashStyle: 'Dash'
        },
        events: {
          setExtremes: function () {
            if (programmaticChange.current) {
              programmaticChange.current = false;
              return;
            }
          },
          afterSetExtremes: function (e) {
            if (e.min !== undefined && e.max !== undefined) {
              currentZoom.current = { min: e.min, max: e.max };
            }
          }
        }
      },
      yAxis: {
        title: { text: '' },
        gridLineWidth: 1,
        gridLineColor: 'var(--color-secondary-13)',
        gridLineDashStyle: 'Dash',
        labels: {
          style: {
            color: '#7A8A99',
            fontSize: '11px',
            fontFamily: 'Haas Grot Text R, sans-serif'
          },
          formatter(this: Highcharts.AxisLabelsFormatterContextObject) {
            return Format.token(this.value, 'compact');
          }
        }
      },
      tooltip: {
        useHTML: true,
        backgroundColor: 'rgba(18, 24, 47, 0.55)',
        borderWidth: 0,
        shadow: false,
        borderRadius: 8,
        padding: 12,
        style: {
          color: 'var(--color-white-10)',
          fontFamily: 'Haas Grot Text R, sans-serif'
        },
        shared: true,
        formatter: function () {
          if (customTooltipFormatter) {
            return customTooltipFormatter(this, groupBy);
          }
          return defaultTooltipFormatter(this);
        }
      },
      legend: { enabled: false },
      plotOptions: {
        series: {
          animation: false,
          turboThreshold: 0
        },
        area: {
          marker: {
            enabled: false,
            symbol: 'circle',
            radius: 5,
            states: { hover: { enabled: true, radius: 5 } }
          },
          lineWidth: 2,
          states: { hover: { lineWidthPlus: 0 } },
          threshold: null,
          fillOpacity: 0.1,
          findNearestPointBy: 'x'
        }
      },
      series: aggregatedSeries,
      navigator: { enabled: false },
      scrollbar: { enabled: false },
      rangeSelector: { enabled: false }
    };

    return customOptions
      ? Highcharts.merge(baseOptions, customOptions)
      : baseOptions;
  }, [
    aggregatedSeries,
    groupBy,
    events,
    showEvents,
    customTooltipFormatter,
    defaultTooltipFormatter,
    customOptions
  ]);

  useEffect(() => {
    updateArrows();

    const onResize = () => updateArrows();

    window.addEventListener('resize', onResize);

    return () => window.removeEventListener('resize', onResize);
  }, [aggregatedSeries.length, updateArrows]);

  return (
    <div
      className={cn(
        'highcharts-container relative flex h-full flex-col',
        className
      )}
    >
      <div className='relative min-h-[400px] flex-grow'>
        <div className='absolute top-1/2 left-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 opacity-40'>
          <Icon
            name='logo-gray'
            className='h-[27px] w-[121px]'
            color='primary-11'
            isRound={false}
          />
        </div>
        <HighchartsReact
          ref={chartRef}
          highcharts={Highcharts}
          options={options}
          allowChartUpdate
          containerProps={{
            style: {
              display: 'block',
              width: '100%',
              height: '100%',
              touchAction: 'none',
              overscrollBehaviorX: 'contain'
            }
          }}
        />
      </div>
      <div className='absolute right-0 block'>
        <div className='hidden items-center gap-2 lg:flex'>
          <View.Condition
            if={Boolean(isLegendEnabled && aggregatedSeries.length > 1)}
          >
            <ChartIconToggle
              active={areAllSeriesHidden}
              onClick={() => {
                if (areAllSeriesHidden) {
                  onSelectAllLegends();
                } else {
                  onDeselectAllLegends();
                }
              }}
              onIcon='eye'
              offIcon='eye-closed'
              ariaLabel='Toggle all series visibility'
            />
          </View.Condition>
          <View.Condition if={Boolean(events?.length > 0)}>
            <ChartIconToggle
              active={!showEvents}
              onClick={() => onShowEvents(!showEvents)}
              onIcon='calendar-check'
              offIcon='calendar-uncheck'
              ariaLabel='Toggle events'
            />
          </View.Condition>
        </div>
      </div>
      <View.Condition if={isLegendEnabled && aggregatedSeries.length > 1}>
        <div className='mx-5 block md:mx-0 lg:hidden'>
          <div
            className={cn(
              'bg-secondary-35 shadow-13 relative mx-auto h-[38px] max-w-fit overflow-hidden rounded-lg',
              'before:pointer-events-none before:absolute before:top-[1px] before:left-[1px] before:z-[2] before:h-full before:w-20 before:rounded-sm before:opacity-0',
              'after:pointer-events-none after:absolute after:top-[1px] after:right-[1px] after:h-full after:w-20 after:rounded-r-sm after:opacity-0',
              {
                'before:max-h-[36px] before:rotate-180 before:bg-[linear-gradient(270deg,#f8f8f8_55.97%,rgba(112,113,129,0)_99.41%)] before:opacity-100 dark:before:bg-[linear-gradient(90deg,rgba(122,138,153,0)_19.83%,#17212b_63.36%)]':
                  canScrollLeft,
                'after:max-h-[36px] after:bg-[linear-gradient(270deg,#f8f8f8_55.97%,rgba(112,113,129,0)_99.41%)] after:opacity-100 dark:after:bg-[linear-gradient(90deg,rgba(122,138,153,0)_19.83%,#17212b_63.36%)]':
                  canScrollRight
              }
            )}
          >
            <View.Condition if={canScrollLeft}>
              <Button
                className={cn(
                  'bg-secondary-36 absolute top-1/2 left-1.5 z-[2] grid h-[26px] w-[26px] -translate-y-1/2 place-items-center rounded-sm'
                )}
                onClick={() => {
                  onLegendLeave();
                  scrollByDir('left');
                }}
              >
                <Icon
                  name='arrow-triangle'
                  className='h-[6px] w-[6px]'
                />
              </Button>
            </View.Condition>
            <div
              ref={viewportRef}
              onScroll={() => {
                updateArrows();
                onLegendLeave();
              }}
              className={cn(
                'hide-scrollbar mx-0.5 flex h-full max-w-[99%] items-center gap-4 overflow-x-auto scroll-smooth rounded-lg p-1.5'
              )}
            >
              <Each
                data={legends}
                render={({ id, name, color, isDisabled }) => (
                  <Button
                    key={id}
                    className={cn(
                      'text-primary-14 flex shrink-0 gap-1.5 text-[11px] leading-none font-normal',
                      {
                        'line-through opacity-30': isDisabled,
                        'cursor-not-allowed': isLastActiveLegend && !isDisabled
                      }
                    )}
                    onMouseEnter={() => onLegendHover(id)}
                    onMouseLeave={() => onLegendLeave(id)}
                    onClick={() => onLegendClick(id)}
                  >
                    <span
                      className='inline-block h-3 w-3 rounded-full'
                      style={{ backgroundColor: color }}
                    />
                    {name}
                  </Button>
                )}
              />
            </div>
            <View.Condition if={canScrollRight}>
              <Button
                className={cn(
                  'bg-secondary-36 absolute top-1/2 right-1.5 z-[2] grid h-[26px] w-[26px] -translate-y-1/2 place-items-center rounded-sm'
                )}
                onClick={() => {
                  onLegendLeave();
                  scrollByDir('right');
                }}
              >
                <Icon
                  name='arrow-triangle'
                  className='h-[6px] w-[6px] rotate-180'
                />
              </Button>
            </View.Condition>
          </div>
        </div>
        <View.Condition if={legends.length > 1}>
          <div className='mx-auto hidden max-w-[902px] flex-wrap justify-center gap-5 px-[15px] py-2 lg:flex'>
            <Each
              data={legends}
              render={({ id, name, color, isDisabled }) => (
                <Button
                  key={id}
                  className={cn(
                    'text-primary-14 flex shrink-0 gap-1.5 text-[11px] leading-none font-normal',
                    {
                      'line-through opacity-30': isDisabled,
                      'cursor-not-allowed': isLastActiveLegend && !isDisabled
                    }
                  )}
                  onMouseEnter={() => onLegendHover(id)}
                  onMouseLeave={() => onLegendLeave(id)}
                  onClick={() => onLegendClick(id)}
                >
                  <span
                    className='inline-block h-3 w-3 rounded-full'
                    style={{ backgroundColor: color }}
                  />
                  {name}
                </Button>
              )}
            />
          </div>
        </View.Condition>
      </View.Condition>
    </div>
  );
};

export default LineChart;

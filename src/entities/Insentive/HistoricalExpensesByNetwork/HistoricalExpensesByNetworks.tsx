import React, { useMemo, useState } from 'react';

import Line from '@/components/Charts/Line/Line';
import NoDataPlaceholder from '@/components/NoDataPlaceholder/NoDataPlaceholder';
import { HistoricalExpensesMobileActions } from '@/entities/Insentive/HistoricalExpensesByNetwork/HistoricalExpensesMobileActions';
import {
  customChartOptions,
  customTooltipFormatter
} from '@/entities/Insentive/HistoricalExpensesByNetwork/lib/customTooltipFormatter';
import { useHistoricalExpensesChartSeries } from '@/entities/Insentive/HistoricalExpensesByNetwork/lib/useHistoricalExpensesChartSeries';
import { useChartControls } from '@/shared/hooks/useChartControls';
import { useFilterSyncSingle } from '@/shared/hooks/useFiltersSync';
import { useLegends } from '@/shared/hooks/useLegends';
import { useLineChart } from '@/shared/hooks/useLineChart';
import { getCsvFileName } from '@/shared/lib/utils/getCsvFileName';
import { getSummarizedCsvData } from '@/shared/lib/utils/getSummarizedCsvData';
import { CombinedIncentivesData } from '@/shared/types/Incentive/types';
import Card from '@/shared/ui/Card/Card';
import CSVDownloadButton from '@/shared/ui/CSVDownloadButton/CSVDownloadButton';
import DateRangePicker, {
  DateRangeValue
} from '@/shared/ui/DateRangePicker/DateRangePicker';
import TabsGroup from '@/shared/ui/TabsGroup/TabsGroup';

interface HistoricalExpensesByNetworksProps {
  isLoading: boolean;
  isError: boolean;
  data: CombinedIncentivesData[];
  onCopyLink?: (id: string) => void;
}

const toUtcDateSeconds = (dateString: string, isEndOfDay = false) => {
  const [year, month, day] = dateString.split('-').map(Number);

  if (!year || !month || !day) return null;

  const startMs = Date.UTC(year, month - 1, day);

  if (!isEndOfDay) {
    return Math.floor(startMs / 1000);
  }

  const endMs = Date.UTC(year, month - 1, day + 1) - 1;
  return Math.floor(endMs / 1000);
};

const formatDateInputValue = (timestampSeconds: number) => {
  return new Date(timestampSeconds * 1000).toISOString().split('T')[0];
};

const HistoricalExpensesByNetworks = (
  props: HistoricalExpensesByNetworksProps
) => {
  const { data, isError, isLoading } = props;
  const [activeModeTab, setActiveModeTab] = useState<
    'Lend' | 'Borrow' | 'Total'
  >('Total');
  const [activeViewTab, setActiveViewTab] = useState<'COMP' | 'USD'>('COMP');
  const { barSize, onBarSizeChange } = useChartControls({
    initialBarSize: 'D'
  });
  const [dateRange, setDateRange] = useState<DateRangeValue>({
    startDate: '',
    endDate: ''
  });
  const groupBy = 'Network';

  const dateBounds = useMemo(() => {
    if (!data.length) return { min: '', max: '' };

    let min = data[0].date;
    let max = data[0].date;

    data.forEach((item) => {
      if (item.date < min) min = item.date;
      if (item.date > max) max = item.date;
    });

    return {
      min: formatDateInputValue(min),
      max: formatDateInputValue(max)
    };
  }, [data]);

  const filteredData = useMemo(() => {
    const hasRange = Boolean(dateRange.startDate || dateRange.endDate);
    if (!hasRange) return data;

    const startSeconds = dateRange.startDate
      ? toUtcDateSeconds(dateRange.startDate)
      : null;
    const endSeconds = dateRange.endDate
      ? toUtcDateSeconds(dateRange.endDate, true)
      : null;

    if (startSeconds === null && endSeconds === null) return data;

    const normalizedStart = startSeconds;
    const normalizedEnd =
      startSeconds !== null && endSeconds !== null && startSeconds > endSeconds
        ? null
        : endSeconds;

    return data.filter((item) => {
      if (normalizedStart !== null && item.date < normalizedStart) return false;
      if (normalizedEnd !== null && item.date > normalizedEnd) return false;
      return true;
    });
  }, [data, dateRange]);

  const { chartSeries, hasData } = useHistoricalExpensesChartSeries({
    rawData: filteredData,
    mode: activeModeTab,
    view: activeViewTab
  });

  const { aggregatedSeries, isLegendEnabled } = useLineChart({
    groupBy,
    data: chartSeries,
    barSize,
    isAggregate: true
  });

  const {
    legends,
    toggle: onLegendToggle,
    activateAll: onSelectAllLegends,
    deactivateAll: onDeselectAllLegends,
    highlight: onLegendHover,
    unhighlight: onLegendUnhover
  } = useLegends(aggregatedSeries, ({ name, color }) => ({
    id: `${name}`,
    name: `${name}`,
    isDisabled: false,
    isHighlighted: false,
    color: `${color}`
  }));

  const isSeriesHidden = legends.every((l) => l.isDisabled);

  useFilterSyncSingle(
    'historicalExpByNetworkMode',
    activeModeTab,
    setActiveModeTab
  );

  useFilterSyncSingle(
    'historicalExpByNetworkView',
    activeViewTab,
    setActiveViewTab
  );

  useFilterSyncSingle('historicalExpByNetworkPeriod', barSize, onBarSizeChange);

  const csvData = getSummarizedCsvData(aggregatedSeries);

  const onEyeClick = () => {
    if (isSeriesHidden) {
      onSelectAllLegends();
    } else {
      onDeselectAllLegends();
    }
  };

  return (
    <Card
      isLoading={isLoading}
      isError={isError}
      title='Historical expenses by networks'
      id='historical-expenses-by-networks'
      className={{
        loading: 'min-h-[inherit]',
        container: 'min-h-143 rounded-lg',
        content: 'flex flex-col gap-3 px-0 pt-0 pb-5 md:px-5 lg:px-10 lg:pb-10'
      }}
    >
      <div className='flex flex-col justify-end gap-2 px-5 py-3 sm:flex-row md:px-0'>
        <div className='hidden items-center justify-end gap-2 sm:flex'>
          <TabsGroup
            className={{
              container: 'w-full sm:w-auto',
              list: 'w-auto'
            }}
            tabs={['COMP', 'USD']}
            value={activeViewTab}
            onTabChange={setActiveViewTab}
          />
          <TabsGroup
            className={{
              container: 'w-full sm:w-auto',
              list: 'w-full sm:w-auto'
            }}
            tabs={['Lend', 'Borrow', 'Total']}
            value={activeModeTab}
            onTabChange={setActiveModeTab}
            disabled={isLoading}
          />
          <div className='flex items-center gap-2'>
            <TabsGroup
              className={{
                container: 'w-auto',
                list: 'w-auto'
              }}
              tabs={['D', 'W', 'M']}
              value={barSize}
              onTabChange={onBarSizeChange}
              disabled={isLoading}
            />
            <DateRangePicker
              value={dateRange}
              min={dateBounds.min}
              max={dateBounds.max}
              onChange={setDateRange}
              disabled={isLoading}
              variant='popover'
              showLabels
              showClear
              className='flex-col items-stretch gap-3'
              inputClassName='w-full'
            />
            <HistoricalExpensesMobileActions
              csvData={csvData}
              activeModeTab={activeModeTab}
              activeViewTab={activeViewTab}
              barSize={barSize}
              areAllSeriesHidden={isSeriesHidden}
              onEyeClick={onEyeClick}
            />
            {/*TODO: fix download button style applying*/}
            <span className={'mt-1 hidden lg:block'}>
              <CSVDownloadButton
                data={csvData}
                tooltipContent={
                  'CSV with the entire historical data can be downloaded'
                }
                filename={getCsvFileName('historical_expenses_by_networks', {
                  view: activeViewTab,
                  mode: activeModeTab,
                  timeFrame: barSize
                })}
              />
            </span>
          </div>
        </div>
        <div className='flex flex-wrap items-center justify-end gap-2 sm:hidden'>
          <TabsGroup
            className={{
              container: 'w-full sm:w-auto',
              list: 'w-full sm:w-auto'
            }}
            tabs={['Lend', 'Borrow', 'Total']}
            value={activeModeTab}
            onTabChange={setActiveModeTab}
            disabled={isLoading}
          />
          <div className={'flex w-full items-center gap-2 sm:w-auto'}>
            <TabsGroup
              className={{
                container: 'w-full sm:w-auto',
                list: 'w-auto'
              }}
              tabs={['COMP', 'USD']}
              value={activeViewTab}
              onTabChange={setActiveViewTab}
            />
            <TabsGroup
              className={{
                container: 'w-full',
                list: 'w-full'
              }}
              tabs={['D', 'W', 'M']}
              value={barSize}
              onTabChange={onBarSizeChange}
              disabled={isLoading}
            />
            <DateRangePicker
              value={dateRange}
              min={dateBounds.min}
              max={dateBounds.max}
              onChange={setDateRange}
              disabled={isLoading}
              variant='popover'
              showLabels
              showClear
              className='flex-col items-stretch gap-3'
              inputClassName='w-full'
            />
            <HistoricalExpensesMobileActions
              csvData={csvData}
              activeModeTab={activeModeTab}
              activeViewTab={activeViewTab}
              barSize={barSize}
              areAllSeriesHidden={isSeriesHidden}
              onEyeClick={onEyeClick}
            />
          </div>
        </div>
      </div>
      {!isLoading && !isError && !hasData ? (
        <NoDataPlaceholder isHideButton={true} />
      ) : (
        <Line
          key={groupBy}
          groupBy={groupBy}
          aggregatedSeries={aggregatedSeries}
          className='max-h-fit'
          legends={legends}
          isLegendEnabled={isLegendEnabled}
          resetZoomKey={`${barSize}-${dateRange.startDate}-${dateRange.endDate}`}
          onSelectAllLegends={onSelectAllLegends}
          onDeselectAllLegends={onDeselectAllLegends}
          onLegendLeave={onLegendUnhover}
          onLegendHover={onLegendHover}
          onLegendClick={onLegendToggle}
          customOptions={customChartOptions(activeViewTab)}
          // @ts-expect-error TODO: fix customTooltip types
          customTooltipFormatter={customTooltipFormatter(activeViewTab)}
        />
      )}
    </Card>
  );
};

export default HistoricalExpensesByNetworks;

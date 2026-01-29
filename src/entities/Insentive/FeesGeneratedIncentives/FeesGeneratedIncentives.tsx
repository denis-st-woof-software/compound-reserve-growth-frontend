import { useCallback, useMemo, useState } from 'react';

import Line from '@/components/Charts/Line/Line';
import NoDataPlaceholder from '@/components/NoDataPlaceholder/NoDataPlaceholder';
import { FeesGeneratedIncentivesMobileFilters } from '@/entities/Insentive/FeesGeneratedIncentives/FeesGeneratedIncentivesMobileFilters';
import {
  customChartOptions,
  customTooltipFormatter
} from '@/entities/Insentive/FeesGeneratedIncentives/lib/customTooltipFormatter';
import { getGeneratedIncentivesChartSeries } from '@/entities/Insentive/FeesGeneratedIncentives/lib/getGeneratedIncentivesChartSeries';
import { getSummarizedCsvData } from '@/shared/lib/utils/getSummarizedCsvData';
import { useChainMarketFilters } from '@/entities/Insentive/useChainMarketFilters';
import { useChartControls } from '@/shared/hooks/useChartControls';
import {
  useFiltersSync,
  useFilterSyncSingle
} from '@/shared/hooks/useFiltersSync';
import { useLineChart } from '@/shared/hooks/useLineChart';
import { getCsvFileName } from '@/shared/lib/utils/getCsvFileName';
import { CombinedIncentivesData } from '@/shared/types/Incentive/types';
import { MultiSelect } from '@/shared/ui/AnimationProvider/MultiSelect/MultiSelect';
import Card from '@/shared/ui/Card/Card';
import CSVDownloadButton from '@/shared/ui/CSVDownloadButton/CSVDownloadButton';
import DateRangePicker, {
  DateRangeValue
} from '@/shared/ui/DateRangePicker/DateRangePicker';
import Switch from '@/shared/ui/Switch/Switch';
import TabsGroup from '@/shared/ui/TabsGroup/TabsGroup';

interface FeesGeneratedIncentivesProps {
  data: CombinedIncentivesData[];
  isLoading: boolean;
  isError: boolean;
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

const FeesGeneratedIncentives = (props: FeesGeneratedIncentivesProps) => {
  const { data, isLoading, isError } = props;
  const [isRevenueOnly, setIsRevenueOnly] = useState(false);
  const [dateRange, setDateRange] = useState<DateRangeValue>({
    startDate: '',
    endDate: ''
  });
  const groupBy = 'None';

  const { barSize, onBarSizeChange } = useChartControls({
    initialBarSize: 'D'
  });

  const {
    chainOptions,
    deploymentOptionsFilter,
    selectedOptions,
    setSelectedOptions,
    onSelectChain,
    onSelectMarket,
    filteredData,
    clearAllFilters,
    mobileFilterOptions: mobileFilterOptionsFromHook
  } = useChainMarketFilters(data, { filterByLatestDate: false });

  useFiltersSync(selectedOptions, setSelectedOptions, 'fgvsi', [
    'chain',
    'deployment'
  ]);

  useFilterSyncSingle(
    'FeesGeneratedIncentivesPeriod',
    barSize,
    onBarSizeChange
  );
  useFilterSyncSingle(
    'FeesGeneratedRevenueOnly',
    isRevenueOnly,
    setIsRevenueOnly
  );

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

  const filteredDataByDate = useMemo(() => {
    const hasRange = Boolean(dateRange.startDate || dateRange.endDate);
    if (!hasRange) return filteredData;

    const startSeconds = dateRange.startDate
      ? toUtcDateSeconds(dateRange.startDate)
      : null;
    const endSeconds = dateRange.endDate
      ? toUtcDateSeconds(dateRange.endDate, true)
      : null;

    if (startSeconds === null && endSeconds === null) return filteredData;

    const normalizedStart = startSeconds;
    const normalizedEnd =
      startSeconds !== null && endSeconds !== null && startSeconds > endSeconds
        ? null
        : endSeconds;

    return filteredData.filter((item) => {
      if (normalizedStart !== null && item.date < normalizedStart) return false;
      if (normalizedEnd !== null && item.date > normalizedEnd) return false;
      return true;
    });
  }, [dateRange, filteredData]);

  const chartSeries = getGeneratedIncentivesChartSeries(filteredDataByDate);

  const displaySeries = isRevenueOnly
    ? chartSeries.filter((series) => series.name === 'Revenue')
    : chartSeries;

  const { aggregatedSeries } = useLineChart({
    groupBy,
    data: displaySeries,
    barSize,
    isAggregate: true
  });

  const csvData = getSummarizedCsvData(aggregatedSeries);

  const handleClearAll = useCallback(() => {
    clearAllFilters();
    setDateRange({ startDate: '', endDate: '' });
  }, [clearAllFilters]);

  const mobileFilterOptions = useCallback(
    () => [
      {
        id: 'dateRange',
        placeholder: 'Date range',
        total: dateRange.startDate || dateRange.endDate ? 1 : 0,
        selectedOptions: [],
        options: [],
        disableSelectAll: true,
        type: 'dateRange' as const,
        dateRange,
        minDate: dateBounds.min,
        maxDate: dateBounds.max,
        onDateRangeChange: setDateRange
      },
      ...mobileFilterOptionsFromHook()
    ],
    [dateBounds.max, dateBounds.min, dateRange, mobileFilterOptionsFromHook]
  );

  return (
    <Card
      isLoading={isLoading}
      isError={isError}
      title='Revenue vs Incentives'
      id='fees-generated-vs-incentives'
      className={{
        loading: 'min-h-[inherit]',
        container: 'min-h-[571px] rounded-lg',
        content: 'flex flex-col gap-3 px-0 pt-0 pb-5 md:px-5 lg:px-10 lg:pb-10'
      }}
    >
      <FeesGeneratedIncentivesMobileFilters
        barSize={barSize}
        onBarSizeChange={onBarSizeChange}
        filterOptions={mobileFilterOptions}
        onClearAll={handleClearAll}
        csvData={csvData}
        isRevenueOnly={isRevenueOnly}
        setIsRevenueOnly={setIsRevenueOnly}
      />
      <div className='hidden lg:block'>
        <div className='flex items-center justify-end gap-2 px-0 py-3'>
          <TabsGroup
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
          <MultiSelect
            options={chainOptions || []}
            value={selectedOptions.chain}
            onChange={onSelectChain}
            placeholder='Chain'
            disabled={isLoading}
          />
          <MultiSelect
            options={deploymentOptionsFilter}
            value={selectedOptions.deployment}
            onChange={onSelectMarket}
            placeholder='Market'
            disabled={isLoading || !Boolean(deploymentOptionsFilter.length)}
          />
          <Switch
            label='Revenue Only'
            positionLabel='left'
            checked={isRevenueOnly}
            onCheckedChange={setIsRevenueOnly}
            className={{ title: '!text-[11px]' }}
          />
          <CSVDownloadButton
            data={csvData}
            filename={getCsvFileName('fees_generated_vs_incentives')}
            tooltipContent='CSV with the entire historical data can be downloaded'
          />
        </div>
      </div>
      {chartSeries.length === 0 ? (
        <NoDataPlaceholder onButtonClick={clearAllFilters} />
      ) : (
        <Line
          className='max-h-fit'
          key={groupBy}
          isLegendEnabled={false}
          groupBy={groupBy}
          aggregatedSeries={aggregatedSeries}
          resetZoomKey={`${barSize}-${dateRange.startDate}-${dateRange.endDate}`}
          customOptions={customChartOptions}
          customTooltipFormatter={customTooltipFormatter}
        />
      )}
    </Card>
  );
};

export default FeesGeneratedIncentives;

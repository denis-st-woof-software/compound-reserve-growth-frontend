import React, { useCallback, useMemo, useReducer, useState } from 'react';
import { CSVLink } from 'react-csv';

import ChartIconToggle from '@/components/ChartIconToggle/ChartIconToggle';
import LineChart from '@/components/Charts/Line/Line';
import Filter from '@/components/Filter/Filter';
import NoDataPlaceholder from '@/components/NoDataPlaceholder/NoDataPlaceholder';
import {
  customChartOptions,
  customTooltipFormatter
} from '@/entities/Revenue/CompoundCumulativeRevenue/customChartOptions';
import { useChartControls } from '@/shared/hooks/useChartControls';
import { useChartDataProcessor } from '@/shared/hooks/useChartDataProcessor';
import { useEventsApi } from '@/shared/hooks/useEventsApi';
import { useFiltersSync } from '@/shared/hooks/useFiltersSync';
import { useLegends } from '@/shared/hooks/useLegends';
import { useLineChart } from '@/shared/hooks/useLineChart';
import { useModal } from '@/shared/hooks/useModal';
import { RevenuePageProps } from '@/shared/hooks/useRevenue';
import { filterForRange } from '@/shared/lib/utils/chart';
import { getCsvFileName } from '@/shared/lib/utils/getCsvFileName';
import {
  ChartDataItem,
  extractFilterOptions,
  filterAndSortMarkets
} from '@/shared/lib/utils/utils';
import { BarSize, OptionType } from '@/shared/types/types';
import { MultiSelect } from '@/shared/ui/AnimationProvider/MultiSelect/MultiSelect';
import Button from '@/shared/ui/Button/Button';
import Card from '@/shared/ui/Card/Card';
import CSVDownloadButton from '@/shared/ui/CSVDownloadButton/CSVDownloadButton';
import DateRangePicker, {
  DateRangeValue
} from '@/shared/ui/DateRangePicker/DateRangePicker';
import Drawer from '@/shared/ui/Drawer/Drawer';
import Icon from '@/shared/ui/Icon/Icon';
import TabsGroup from '@/shared/ui/TabsGroup/TabsGroup';
import Text from '@/shared/ui/Text/Text';
import View from '@/shared/ui/View/View';

interface FiltersProps {
  chainOptions: OptionType[];

  deploymentOptionsFilter: OptionType[];

  assetTypeOptions: OptionType[];

  symbolOptions: OptionType[];

  barSize: BarSize;

  isLoading: boolean;

  showEvents: boolean;

  isShowCalendarIcon: boolean;

  csvFilename: string;

  csvData: Record<string, string | number>[];

  dateRange: DateRangeValue;

  minDate?: string;

  maxDate?: string;

  selectedOptions: {
    chain: OptionType[];

    assetType: OptionType[];

    deployment: OptionType[];

    symbol: OptionType[];
  };

  isShowEyeIcon: boolean;

  areAllSeriesHidden: boolean;

  onSelectChain: (chain: OptionType[]) => void;

  onSelectAssetType: (assetType: OptionType[]) => void;

  onSelectMarket: (deployment: OptionType[]) => void;

  onSelectSymbol: (symbol: OptionType[]) => void;

  onBarSizeChange: (value: string) => void;

  onDateRangeChange: (next: DateRangeValue) => void;

  onClearAll: () => void;

  onShowEvents: (value: boolean) => void;

  onSelectAll: () => void;

  onDeselectAll: () => void;
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

const CompoundCumulativeRevenue = ({
  revenueData,
  isLoading,
  isError
}: RevenuePageProps) => {
  const [selectedOptions, setSelectedOptions] = useReducer(
    (prev, next) => ({
      ...prev,
      ...next
    }),
    {
      chain: [] as OptionType[],
      assetType: [] as OptionType[],
      deployment: [] as OptionType[],
      symbol: [] as OptionType[]
    }
  );

  useFiltersSync(selectedOptions, setSelectedOptions, 'ccr', [
    'chain',
    'assetType',
    'deployment',
    'symbol'
  ]);

  const { barSize, onBarSizeChange } = useChartControls({
    initialBarSize: 'D'
  });

  const [dateRange, setDateRange] = useState<DateRangeValue>({
    startDate: '',
    endDate: ''
  });

  const rawData: ChartDataItem[] = useMemo(() => {
    return [...revenueData].sort((a, b) => a.date - b.date);
  }, [revenueData]);

  const dateBounds = useMemo(() => {
    if (!rawData.length) return { min: '', max: '' };

    return {
      min: formatDateInputValue(rawData[0].date),
      max: formatDateInputValue(rawData[rawData.length - 1].date)
    };
  }, [rawData]);

  const filteredRawData = useMemo(() => {
    const hasRange = Boolean(dateRange.startDate || dateRange.endDate);
    if (!hasRange) return rawData;

    const startSeconds = dateRange.startDate
      ? toUtcDateSeconds(dateRange.startDate)
      : null;
    const endSeconds = dateRange.endDate
      ? toUtcDateSeconds(dateRange.endDate, true)
      : null;

    if (startSeconds === null && endSeconds === null) return rawData;

    const normalizedStart = startSeconds;
    const normalizedEnd =
      startSeconds !== null && endSeconds !== null && startSeconds > endSeconds
        ? null
        : endSeconds;

    return rawData.filter((item) => {
      if (normalizedStart !== null && item.date < normalizedStart) return false;
      if (normalizedEnd !== null && item.date > normalizedEnd) return false;
      return true;
    });
  }, [dateRange, rawData]);

  const filterOptionsConfig = useMemo(
    () => ({
      chain: { path: 'source.network' },
      deployment: { path: 'source.market' },
      symbol: { path: 'source.asset.symbol' },
      assetType: { path: 'source.asset.type' }
    }),
    []
  );

  const { chainOptions, deploymentOptions, symbolOptions, assetTypeOptions } =
    useMemo(
      () => extractFilterOptions(rawData, filterOptionsConfig),
      [rawData, filterOptionsConfig]
    );

  const deploymentOptionsFilter = useMemo(() => {
    return filterAndSortMarkets(
      deploymentOptions,
      selectedOptions.chain.map((o) => o.id)
    );
  }, [deploymentOptions, selectedOptions]);

  const groupBy = useMemo(() => {
    if (selectedOptions.deployment.length > 0) return 'market';
    if (selectedOptions.chain.length > 0) return 'network';
    return 'none';
  }, [selectedOptions]);

  const { chartSeries } = useChartDataProcessor({
    rawData: filteredRawData,
    filters: {
      network: selectedOptions.chain.map((opt) => opt.id),
      market: selectedOptions.deployment.map((opt) => opt.id),
      symbol: selectedOptions.symbol.map((opt) => opt.id),
      assetType: selectedOptions.assetType.map((opt) => opt.id)
    },
    filterPaths: {
      network: 'source.network',
      market: 'source.market',
      symbol: 'source.asset.symbol',
      assetType: 'source.asset.type'
    },
    groupBy,
    groupByKeyPath: groupBy === 'none' ? null : `source.${groupBy}`,
    defaultSeriesName: 'Daily Revenue'
  });

  const cumulativeChartSeries = useMemo(() => {
    if (!chartSeries || chartSeries.length === 0) {
      return [];
    }

    return chartSeries.map((series) => {
      if (!series.data || series.data.length === 0) {
        return { ...series, data: [] };
      }

      const dailyTotals = new Map<number, number>();
      for (const point of series.data) {
        const date = new Date(point.x);
        date.setUTCHours(0, 0, 0, 0);
        const dayStartTimestamp = date.getTime();
        const currentTotal = dailyTotals.get(dayStartTimestamp) || 0;
        const valueToAdd = point.y < 0 ? 0 : point.y;
        dailyTotals.set(dayStartTimestamp, currentTotal + valueToAdd);
      }

      const sortedDailyPoints = Array.from(dailyTotals.entries())
        .map(([x, y]) => ({ x, y }))
        .sort((a, b) => a.x - b.x);

      if (sortedDailyPoints.length === 0) {
        return { ...series, data: [] };
      }

      const cumulativeData: { x: number; y: number }[] = [];
      const minDate = sortedDailyPoints[0].x;
      const maxDate = sortedDailyPoints[sortedDailyPoints.length - 1].x;
      const oneDay = 24 * 60 * 60 * 1000;

      let cumulativeSum = 0;
      let dataIndex = 0;

      for (let d = minDate; d <= maxDate; d += oneDay) {
        if (
          dataIndex < sortedDailyPoints.length &&
          sortedDailyPoints[dataIndex].x === d
        ) {
          cumulativeSum += sortedDailyPoints[dataIndex].y;
          dataIndex++;
        }
        cumulativeData.push({ x: d, y: cumulativeSum });
      }

      return {
        ...series,
        name: series.name.replace('Daily', 'Cumulative'),
        data: cumulativeData
      };
    });
  }, [chartSeries]);

  const csvData = filterForRange({
    data: cumulativeChartSeries[0]?.data ?? [],
    getDate: (item) => new Date(item.x),
    transform: (item) => ({
      Date: new Date(item.x).toISOString().split('T')[0],
      'Cumulative revenue': item.y
    }),
    range: barSize
  });

  const { isLegendEnabled, aggregatedSeries } = useLineChart({
    groupBy,
    data: cumulativeChartSeries,
    barSize
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

  const [isShowEvents, setIsShowEvents] = useState<boolean>(true);

  const { data: events } = useEventsApi();

  const hasData = useMemo(() => {
    return (
      cumulativeChartSeries.length > 0 &&
      cumulativeChartSeries.some((s) => s.data.length > 0)
    );
  }, [cumulativeChartSeries]);

  const noDataMessage =
    selectedOptions.chain.length > 0 ||
    selectedOptions.deployment.length > 0 ||
    selectedOptions.symbol.length > 0 ||
    selectedOptions.assetType.length > 0 ||
    dateRange.startDate ||
    dateRange.endDate
      ? 'No data for selected filters'
      : 'No data available';

  const getGroupByForChart = () => {
    if (groupBy === 'none') {
      return 'none';
    }
    return groupBy === 'market' ? 'Market' : 'Chain';
  };

  const onSelectChain = useCallback(
    (chain: OptionType[]) => {
      const selectedChainIds = chain.map((o) => o.id);

      const filteredDeployment = selectedOptions.deployment.filter((el) =>
        selectedChainIds.length === 0
          ? true
          : (el.chain?.some((c) => selectedChainIds.includes(c)) ?? false)
      );

      setSelectedOptions({
        chain,
        deployment: filteredDeployment
      });
    },
    [selectedOptions]
  );

  const onSelectAssetType = useCallback(
    (assetTypes: OptionType[]) => {
      setSelectedOptions({
        assetType: assetTypes
      });
    },
    [selectedOptions]
  );

  const onSelectMarket = useCallback(
    (deployments: OptionType[]) => {
      setSelectedOptions({
        deployment: deployments
      });
    },
    [selectedOptions]
  );

  const onSelectSymbol = useCallback(
    (symbols: OptionType[]) => {
      setSelectedOptions({
        symbol: symbols
      });
    },
    [selectedOptions]
  );

  const onClearSelectedOptions = useCallback(() => {
    setSelectedOptions({
      chain: [],
      assetType: [],
      deployment: [],
      symbol: []
    });
    setDateRange({ startDate: '', endDate: '' });
  }, []);

  const onDateRangeChange = useCallback((next: DateRangeValue) => {
    setDateRange(next);
  }, []);

  return (
    <Card
      title='Compound Cumulative Revenue'
      id='compound-cumulative-revenue'
      isLoading={isLoading}
      isError={isError}
      className={{
        loading: 'min-h-[inherit]',
        container: 'border-background min-h-[550px] border',
        content: 'flex flex-col gap-3 p-0 pb-5 md:px-5 lg:px-10 lg:pb-10'
      }}
    >
      <Filters
        barSize={barSize}
        csvData={csvData}
        areAllSeriesHidden={isSeriesHidden}
        isShowEyeIcon={Boolean(isLegendEnabled && aggregatedSeries.length > 1)}
        showEvents={isShowEvents}
        csvFilename={getCsvFileName('compound_cumulative_revenue')}
        chainOptions={chainOptions}
        dateRange={dateRange}
        minDate={dateBounds.min}
        maxDate={dateBounds.max}
        selectedOptions={selectedOptions}
        isShowCalendarIcon={!!events?.length}
        deploymentOptionsFilter={deploymentOptionsFilter}
        assetTypeOptions={assetTypeOptions}
        symbolOptions={symbolOptions}
        isLoading={isLoading}
        onSelectChain={onSelectChain}
        onSelectAssetType={onSelectAssetType}
        onSelectMarket={onSelectMarket}
        onSelectSymbol={onSelectSymbol}
        onBarSizeChange={onBarSizeChange}
        onDateRangeChange={onDateRangeChange}
        onClearAll={onClearSelectedOptions}
        onShowEvents={setIsShowEvents}
        onSelectAll={onSelectAllLegends}
        onDeselectAll={onDeselectAllLegends}
      />
      {!isLoading && !isError && !hasData ? (
        <NoDataPlaceholder
          onButtonClick={onClearSelectedOptions}
          text={noDataMessage}
        />
      ) : (
        <LineChart
          className='max-h-fit'
          groupBy={getGroupByForChart()}
          aggregatedSeries={aggregatedSeries}
          isLegendEnabled={isLegendEnabled}
          events={events}
          showEvents={isShowEvents}
          customOptions={customChartOptions}
          customTooltipFormatter={customTooltipFormatter}
          resetZoomKey={`${barSize}-${dateRange.startDate}-${dateRange.endDate}`}
          legends={legends}
          onSelectAllLegends={onSelectAllLegends}
          onDeselectAllLegends={onDeselectAllLegends}
          onShowEvents={setIsShowEvents}
          onLegendHover={onLegendHover}
          onLegendLeave={onLegendUnhover}
          onLegendClick={onLegendToggle}
        />
      )}
    </Card>
  );
};

const Filters = ({
  barSize,
  csvData,
  csvFilename,
  chainOptions,
  dateRange,
  minDate,
  maxDate,
  selectedOptions,
  deploymentOptionsFilter,
  isShowEyeIcon,
  areAllSeriesHidden,
  assetTypeOptions,
  symbolOptions,
  showEvents,
  isShowCalendarIcon,
  isLoading,
  onSelectChain,
  onSelectAssetType,
  onSelectMarket,
  onSelectSymbol,
  onBarSizeChange,
  onDateRangeChange,
  onClearAll,
  onShowEvents,
  onSelectAll,
  onDeselectAll
}: FiltersProps) => {
  const { isOpen, onOpenModal, onCloseModal } = useModal();

  const {
    isOpen: isMoreOpen,
    onOpenModal: onMoreOpen,
    onCloseModal: onMoreClose
  } = useModal();

  const filterOptions = useMemo(() => {
    const chainFilterOptions = {
      id: 'chain',
      placeholder: 'Chain',
      total: selectedOptions.chain.length,
      selectedOptions: selectedOptions.chain,
      options: chainOptions || [],
      onChange: onSelectChain
    };

    const marketFilterOptions = {
      id: 'market',
      placeholder: 'Market',
      total: selectedOptions.deployment.length,
      selectedOptions: selectedOptions.deployment,
      options: deploymentOptionsFilter || [],
      onChange: onSelectMarket
    };

    const assetTypeFilterOptions = {
      id: 'assetType',
      placeholder: 'Asset Type',
      total: selectedOptions.assetType.length,
      selectedOptions: selectedOptions.assetType,
      options:
        assetTypeOptions?.sort((a, b) => a.label.localeCompare(b.label)) || [],
      onChange: onSelectAssetType
    };

    const symbolFilterOptions = {
      id: 'reserveSymbol',
      placeholder: 'Reserve Symbols',
      total: selectedOptions.symbol.length,
      selectedOptions: selectedOptions.symbol,
      options:
        symbolOptions?.sort((a, b) => a.label.localeCompare(b.label)) || [],
      onChange: onSelectSymbol
    };

    const dateRangeFilterOptions = {
      id: 'dateRange',
      placeholder: 'Date range',
      total: dateRange.startDate || dateRange.endDate ? 1 : 0,
      selectedOptions: [],
      options: [],
      disableSelectAll: true,
      type: 'dateRange' as const,
      dateRange,
      minDate,
      maxDate,
      onDateRangeChange
    };

    return [
      dateRangeFilterOptions,
      chainFilterOptions,
      marketFilterOptions,
      assetTypeFilterOptions,
      symbolFilterOptions
    ];
  }, [
    assetTypeOptions,
    chainOptions,
    deploymentOptionsFilter,
    onDateRangeChange,
    onSelectAssetType,
    onSelectChain,
    onSelectMarket,
    onSelectSymbol,
    dateRange,
    maxDate,
    minDate,
    selectedOptions,
    symbolOptions
  ]);

  const onCalendarClick = () => {
    onShowEvents(!showEvents);

    onMoreClose();
  };

  const onEyeClick = () => {
    if (areAllSeriesHidden) {
      onSelectAll();
    } else {
      onDeselectAll();
    }

    onMoreClose();
  };

  return (
    <>
      <div className='hidden lg:block'>
        <div className='hidden items-center justify-end gap-2 px-0 py-3 lg:flex'>
          <TabsGroup
            tabs={['D', 'W', 'M']}
            value={barSize}
            onTabChange={onBarSizeChange}
            disabled={isLoading}
          />
          <DateRangePicker
            value={dateRange}
            min={minDate}
            max={maxDate}
            onChange={onDateRangeChange}
            disabled={isLoading}
            variant='popover'
            showLabels
            showClear
            className='flex-col items-stretch gap-3'
            inputClassName='w-full'
          />
          <div className='flex gap-2'>
            <MultiSelect
              options={chainOptions || []}
              value={selectedOptions.chain}
              onChange={onSelectChain}
              placeholder='Chain'
              disabled={isLoading}
            />
            <MultiSelect
              options={deploymentOptionsFilter || []}
              value={selectedOptions.deployment}
              onChange={onSelectMarket}
              placeholder='Market'
              disabled={isLoading || !Boolean(deploymentOptionsFilter.length)}
            />
            <MultiSelect
              options={
                assetTypeOptions?.sort((a, b) =>
                  a.label.localeCompare(b.label)
                ) || []
              }
              value={selectedOptions.assetType}
              onChange={onSelectAssetType}
              placeholder='Asset Type'
              disabled={isLoading}
            />
            <MultiSelect
              options={
                symbolOptions?.sort((a, b) => a.label.localeCompare(b.label)) ||
                []
              }
              value={selectedOptions.symbol}
              onChange={onSelectSymbol}
              placeholder='Reserve Symbols'
              disabled={isLoading}
            />
          </div>
          <CSVDownloadButton
            data={csvData}
            filename={csvFilename}
          />
        </div>
        <div className='flex flex-col items-end justify-end gap-2 px-0 py-3 lg:hidden'>
          <div className='z-[1] flex items-center gap-2'>
            <DateRangePicker
              value={dateRange}
              min={minDate}
              max={maxDate}
              onChange={onDateRangeChange}
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
              options={deploymentOptionsFilter || []}
              value={selectedOptions.deployment}
              onChange={onSelectMarket}
              placeholder='Market'
              disabled={isLoading || !Boolean(deploymentOptionsFilter.length)}
            />
            <MultiSelect
              options={
                assetTypeOptions?.sort((a, b) =>
                  a.label.localeCompare(b.label)
                ) || []
              }
              value={selectedOptions.assetType}
              onChange={onSelectAssetType}
              placeholder='Asset Type'
              disabled={isLoading}
            />
            <MultiSelect
              options={
                symbolOptions?.sort((a, b) => a.label.localeCompare(b.label)) ||
                []
              }
              value={selectedOptions.symbol}
              onChange={onSelectSymbol}
              placeholder='Reserve Symbols'
              disabled={isLoading}
            />
          </div>
          <div className='flex items-center gap-2'>
            <TabsGroup
              tabs={['D', 'W', 'M']}
              value={barSize}
              onTabChange={onBarSizeChange}
              disabled={isLoading}
            />
            <CSVDownloadButton
              data={csvData}
              filename={csvFilename}
            />
          </div>
        </div>
      </div>
      <div className='block lg:hidden'>
        <div className='flex flex-wrap justify-end gap-2 px-5 py-3 md:px-0'>
          <div className='flex w-full flex-row items-center justify-end gap-2 sm:w-auto'>
            <TabsGroup
              className={{
                container: 'w-full sm:w-auto',
                list: 'w-full sm:w-auto'
              }}
              tabs={['D', 'W', 'M']}
              value={barSize}
              onTabChange={onBarSizeChange}
              disabled={isLoading}
            />
            <Button
              onClick={onOpenModal}
              className='bg-secondary-27 text-gray-11 shadow-13 flex h-9 w-full min-w-[130px] gap-1.5 rounded-lg p-2.5 text-[11px] leading-4 font-semibold sm:w-auto md:h-8'
            >
              <Icon
                name='filters'
                className='h-[14px] w-[14px] fill-none'
              />
              Filters
            </Button>
            <Button
              onClick={onMoreOpen}
              className='bg-secondary-27 shadow-13 flex h-9 min-w-9 rounded-lg sm:w-auto md:h-8 md:min-w-8 lg:hidden'
            >
              <Icon
                name='3-dots'
                className='h-6 w-6 fill-none'
              />
            </Button>
          </div>
          <Filter
            isOpen={isOpen}
            filterOptions={filterOptions}
            onClose={onCloseModal}
            onClearAll={onClearAll}
          />
          <Drawer
            isOpen={isMoreOpen}
            onClose={onMoreClose}
          >
            <Text
              size='17'
              weight='700'
              align='center'
              className='mb-5'
            >
              Actions
            </Text>
            <div className='flex flex-col gap-1.5'>
              <div className='px-3 py-2'>
                <CSVLink
                  data={csvData}
                  filename={csvFilename}
                  onClick={onMoreClose}
                >
                  <div className='flex items-center gap-1.5'>
                    <Icon
                      name='download'
                      className='h-[26px] w-[26px]'
                    />
                    <Text
                      size='14'
                      weight='500'
                    >
                      CSV with the entire historical data
                    </Text>
                  </div>
                </CSVLink>
              </div>
              <View.Condition if={isShowEyeIcon}>
                <div className='px-3 py-2'>
                  <ChartIconToggle
                    active={areAllSeriesHidden}
                    onIcon='eye'
                    offIcon='eye-closed'
                    ariaLabel='Toggle all series visibility'
                    className={{
                      container:
                        'flex items-center gap-1.5 bg-transparent p-0 !shadow-none',
                      icon: 'h-[26px] w-[26px]',
                      iconContainer: 'h-[26px] w-[26px]'
                    }}
                    onClick={onEyeClick}
                  >
                    <Text
                      size='14'
                      weight='500'
                    >
                      {areAllSeriesHidden ? 'Select All' : 'Unselect All'}
                    </Text>
                  </ChartIconToggle>
                </div>
              </View.Condition>
              <View.Condition if={isShowCalendarIcon}>
                <div className='px-3 py-2'>
                  <ChartIconToggle
                    active={!showEvents}
                    onIcon='calendar-check'
                    offIcon='calendar-uncheck'
                    ariaLabel='Toggle events'
                    className={{
                      container:
                        'flex items-center gap-1.5 bg-transparent p-0 !shadow-none',
                      icon: 'h-[26px] w-[26px]',
                      iconContainer: 'h-[26px] w-[26px]'
                    }}
                    onClick={onCalendarClick}
                  >
                    <Text
                      size='14'
                      weight='500'
                    >
                      Hide Events
                    </Text>
                  </ChartIconToggle>
                </div>
              </View.Condition>
            </div>
          </Drawer>
        </div>
      </div>
    </>
  );
};

export default CompoundCumulativeRevenue;

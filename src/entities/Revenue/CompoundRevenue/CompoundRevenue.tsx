import React, { useCallback, useMemo, useReducer, useState } from 'react';
import { CSVLink } from 'react-csv';

import CompoundRevenueChart from '@/components/Charts/CompoundRevenue/CompoundRevenueChart';
import Filter from '@/components/Filter/Filter';
import NoDataPlaceholder from '@/components/NoDataPlaceholder/NoDataPlaceholder';
import { NOT_MARKET } from '@/shared/consts/consts';
import { useChartControls } from '@/shared/hooks/useChartControls';
import { useCompoundChartBars } from '@/shared/hooks/useCompoundChartBars';
import { useFiltersSync } from '@/shared/hooks/useFiltersSync';
import { useModal } from '@/shared/hooks/useModal';
import { type RevenuePageProps } from '@/shared/hooks/useRevenue';
import { getCsvFileName } from '@/shared/lib/utils/getCsvFileName';
import { getSummarizedCsvData } from '@/shared/lib/utils/getSummarizedCsvData';
import {
  capitalizeFirstLetter,
  ChartDataItem,
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

interface PreprocessedItem {
  date: string;
  value: number;
  chain: string;
  market: string;
  source: string;
  symbol: string;
}

interface FilterOptions {
  chainOptions: OptionType[];
  marketOptions: OptionType[];
  sourceOptions: OptionType[];
  symbolOptions: OptionType[];
}

interface PreprocessedResult {
  filterOptions: FilterOptions;
  processedItems: PreprocessedItem[];
  initialAggregatedData: { date: string; Revenue: number }[];
  sortedDates: string[];
}

interface FiltersProps {
  chainOptions: OptionType[];
  deploymentOptionsFilter: OptionType[];
  sourceOptions: OptionType[];
  symbolOptions: OptionType[];
  barSize: BarSize;
  isLoading: boolean;
  csvFilename: string;
  csvData: Record<string, string | number>[];
  dateRange: DateRangeValue;
  minDate?: string;
  maxDate?: string;
  selectedOptions: {
    chain: OptionType[];
    source: OptionType[];
    deployment: OptionType[];
    symbol: OptionType[];
  };
  onSelectChain: (chain: OptionType[]) => void;
  onSelectSource: (source: OptionType[]) => void;
  onSelectMarket: (deployment: OptionType[]) => void;
  onSelectSymbol: (symbol: OptionType[]) => void;
  onBarSizeChange: (value: string) => void;
  onDateRangeChange: (next: DateRangeValue) => void;
  onClearAll: () => void;
}

function preprocessData(rawData: ChartDataItem[]): PreprocessedResult {
  const emptyResult: PreprocessedResult = {
    filterOptions: {
      chainOptions: [],
      marketOptions: [],
      sourceOptions: [],
      symbolOptions: []
    },
    processedItems: [],
    initialAggregatedData: [],
    sortedDates: []
  };

  if (!rawData || rawData.length === 0) {
    return emptyResult;
  }

  const uniqueValues = {
    chain: new Set<string>(),
    market: new Set<string>(),
    source: new Set<string>(),
    symbol: new Set<string>()
  };

  const processedItems: PreprocessedItem[] = [];
  const dailyTotals: Record<string, number> = {};

  for (const item of rawData) {
    const chain = item.source?.network || 'N/A';
    const market =
      item.source?.market === null ? NOT_MARKET : item.source?.market || 'N/A';
    const source = item.source?.type || 'N/A';
    const symbol = item.source?.asset?.symbol || 'N/A';
    const date = new Date(item.date * 1000).toISOString().split('T')[0];

    uniqueValues.chain.add(chain);
    uniqueValues.market.add(market);
    uniqueValues.source.add(source);
    uniqueValues.symbol.add(symbol);

    processedItems.push({
      date,
      value: item.value,
      chain,
      market,
      source,
      symbol
    });
    dailyTotals[date] = (dailyTotals[date] || 0) + item.value;
  }

  const filterOptions: Partial<FilterOptions> = {};
  for (const key in uniqueValues) {
    const optionsKey = `${key}Options` as keyof FilterOptions;
    filterOptions[optionsKey] = Array.from(
      uniqueValues[key as keyof typeof uniqueValues]
    )
      .sort((a, b) => a.localeCompare(b))
      .map((value) => {
        const option: OptionType = {
          id: value,
          label: capitalizeFirstLetter(value)
        };

        if (key === 'market') {
          const matches =
            value === NOT_MARKET
              ? rawData.filter((item) => item.source?.market == null)
              : rawData.filter((item) => item.source?.market === value);

          option.marketType = matches[0]?.source.type.split(' ')[1] ?? '';

          option.chain = Array.from(
            new Set(matches.map((item) => item.source.network))
          );
        }

        return option;
      });
  }

  const sortedDates = Object.keys(dailyTotals).sort();
  const initialAggregatedData = sortedDates.map((date) => ({
    date,
    Revenue: dailyTotals[date]
  }));

  return {
    filterOptions: filterOptions as FilterOptions,
    processedItems,
    initialAggregatedData,
    sortedDates
  };
}

const createIdSet = (options: OptionType[]): Set<string> =>
  new Set(options.map((opt) => opt.id));

const CompoundRevenueBlock = ({
  revenueData: data,
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
      source: [] as OptionType[],
      deployment: [] as OptionType[],
      symbol: [] as OptionType[]
    }
  );

  useFiltersSync(selectedOptions, setSelectedOptions, 'cr', [
    'chain',
    'source',
    'deployment',
    'symbol'
  ]);

  const { barSize, onBarSizeChange } = useChartControls({
    initialBarSize: 'M'
  });

  const [dateRange, setDateRange] = useState<DateRangeValue>({
    startDate: '',
    endDate: ''
  });

  const { filterOptions, processedItems, initialAggregatedData, sortedDates } =
    useMemo(() => preprocessData(data || []), [data]);

  const { chainOptions, marketOptions, sourceOptions, symbolOptions } =
    filterOptions;

  const deploymentOptionsFilter = useMemo(() => {
    return filterAndSortMarkets(
      marketOptions,
      selectedOptions.chain.map((o) => o.id)
    );
  }, [marketOptions, selectedOptions]);

  const dateBounds = useMemo(() => {
    if (!sortedDates.length) {
      return { min: '', max: '' };
    }

    return {
      min: sortedDates[0],
      max: sortedDates[sortedDates.length - 1]
    };
  }, [sortedDates]);

  const processedChartData = useMemo(() => {
    const hasRange = Boolean(dateRange.startDate || dateRange.endDate);
    const isWithinRange = (date: string) => {
      if (dateRange.startDate && date < dateRange.startDate) return false;
      if (dateRange.endDate && date > dateRange.endDate) return false;
      return true;
    };

    const rangeFilteredItems = hasRange
      ? processedItems.filter((item) => isWithinRange(item.date))
      : processedItems;
    const rangeFilteredAggregates = hasRange
      ? initialAggregatedData.filter((item) => isWithinRange(item.date))
      : initialAggregatedData;
    const rangeFilteredDates = hasRange
      ? sortedDates.filter(isWithinRange)
      : sortedDates;

    const hasActiveFilters =
      selectedOptions.chain.length > 0 ||
      selectedOptions.deployment.length > 0 ||
      selectedOptions.source.length > 0 ||
      selectedOptions.symbol.length > 0;

    if (!hasActiveFilters) {
      return rangeFilteredAggregates;
    }

    const activeFiltersById = {
      chain: createIdSet(selectedOptions.chain),
      market: createIdSet(selectedOptions.deployment),
      source: createIdSet(selectedOptions.source),
      symbol: createIdSet(selectedOptions.symbol)
    };

    const dailyTotals: Record<string, number> = {};

    for (const item of rangeFilteredItems) {
      if (
        activeFiltersById.chain.size > 0 &&
        !activeFiltersById.chain.has(item.chain)
      )
        continue;
      if (
        activeFiltersById.market.size > 0 &&
        !activeFiltersById.market.has(item.market)
      )
        continue;
      if (
        activeFiltersById.source.size > 0 &&
        !activeFiltersById.source.has(item.source)
      )
        continue;
      if (
        activeFiltersById.symbol.size > 0 &&
        !activeFiltersById.symbol.has(item.symbol)
      )
        continue;

      dailyTotals[item.date] = (dailyTotals[item.date] || 0) + item.value;
    }

    const result: { date: string; Revenue: number }[] = [];
    for (const date of rangeFilteredDates) {
      if (dailyTotals[date] !== undefined) {
        result.push({ date, Revenue: dailyTotals[date] });
      }
    }
    return result;
  }, [
    dateRange,
    processedItems,
    initialAggregatedData,
    sortedDates,
    selectedOptions
  ]);

  const { aggregatedData, aggregatedSeries, seriesData, chartRef } =
    useCompoundChartBars({
      barSize,
      data: processedChartData,
      customBarColor: '#4DEDB5'
    });

  const barCount =
    dateRange.startDate || dateRange.endDate
      ? aggregatedData.length
      : undefined;

  const csvData = getSummarizedCsvData(aggregatedSeries);
  const hasData = processedChartData.length > 0;

  const noDataMessage =
    selectedOptions.chain.length > 0 ||
    selectedOptions.deployment.length > 0 ||
    selectedOptions.source.length > 0 ||
    selectedOptions.symbol.length > 0 ||
    dateRange.startDate ||
    dateRange.endDate
      ? 'No data for selected filters'
      : 'No data available';

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

  const onSelectSource = useCallback((selectedOptions: OptionType[]) => {
    setSelectedOptions({
      source: selectedOptions
    });
  }, []);

  const onSelectMarket = useCallback((selectedOptions: OptionType[]) => {
    setSelectedOptions({
      deployment: selectedOptions
    });
  }, []);

  const onSelectSymbol = useCallback((selectedOptions: OptionType[]) => {
    setSelectedOptions({
      symbol: selectedOptions
    });
  }, []);

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
      title='Compound Revenue'
      id='compound-revenue'
      isLoading={isLoading}
      isError={isError}
      className={{
        loading: 'min-h-[inherit]',
        container: 'border-background min-h-[567px] border',
        content: 'flex flex-col gap-3 p-0 px-0 pb-5 md:px-5 lg:pb-10'
      }}
    >
      <Filters
        barSize={barSize}
        csvData={csvData}
        csvFilename={getCsvFileName('compound_revenue')}
        chainOptions={chainOptions}
        dateRange={dateRange}
        minDate={dateBounds.min}
        maxDate={dateBounds.max}
        selectedOptions={selectedOptions}
        deploymentOptionsFilter={deploymentOptionsFilter}
        sourceOptions={sourceOptions}
        symbolOptions={symbolOptions}
        isLoading={isLoading}
        onSelectChain={onSelectChain}
        onSelectSource={onSelectSource}
        onSelectMarket={onSelectMarket}
        onSelectSymbol={onSelectSymbol}
        onBarSizeChange={onBarSizeChange}
        onDateRangeChange={onDateRangeChange}
        onClearAll={onClearSelectedOptions}
      />
      <View.Condition if={!isLoading && !isError && hasData}>
        <div className='h-[400px]'>
          <CompoundRevenueChart
            chartRef={chartRef}
            seriesData={seriesData}
            aggregatedData={aggregatedData}
            barSize={barSize}
            barCount={barCount}
          />
        </div>
      </View.Condition>
      <View.Condition if={!isLoading && !isError && !hasData}>
        <NoDataPlaceholder
          onButtonClick={onClearSelectedOptions}
          text={noDataMessage}
        />
      </View.Condition>
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
  sourceOptions,
  symbolOptions,
  isLoading,
  onSelectChain,
  onSelectSource,
  onSelectMarket,
  onSelectSymbol,
  onBarSizeChange,
  onDateRangeChange,
  onClearAll
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

    const sourceFilterOptions = {
      id: 'source',
      placeholder: 'Source',
      total: selectedOptions.source.length,
      selectedOptions: selectedOptions.source,
      options:
        sourceOptions?.sort((a, b) => a.label.localeCompare(b.label)) || [],
      onChange: onSelectSource
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
      sourceFilterOptions,
      symbolFilterOptions
    ];
  }, [
    dateRange,
    maxDate,
    minDate,
    sourceOptions,
    chainOptions,
    deploymentOptionsFilter,
    onDateRangeChange,
    onSelectSource,
    onSelectChain,
    onSelectMarket,
    selectedOptions
  ]);

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
                sourceOptions?.sort((a, b) => a.label.localeCompare(b.label)) ||
                []
              }
              value={selectedOptions.source}
              onChange={onSelectSource}
              placeholder='Source'
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
                sourceOptions?.sort((a, b) => a.label.localeCompare(b.label)) ||
                []
              }
              value={selectedOptions.source}
              onChange={onSelectSource}
              placeholder='Source'
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
        <div className='flex flex-col justify-end gap-2 px-5 py-3 md:px-0'>
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
          </div>
        </Drawer>
      </div>
    </>
  );
};

export default CompoundRevenueBlock;

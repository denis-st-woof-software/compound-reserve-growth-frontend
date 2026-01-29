import React, { memo, useCallback, useMemo, useReducer, useState } from 'react';
import { CSVLink } from 'react-csv';

import ChartIconToggle from '@/components/ChartIconToggle/ChartIconToggle';
import CompoundFeeRecievedChart from '@/components/Charts/CompoundFeeRecieved/CompoundFeeRecievedChart';
import Filter from '@/components/Filter/Filter';
import GroupDrawer from '@/components/GroupDrawer/GroupDrawer';
import NoDataPlaceholder from '@/components/NoDataPlaceholder/NoDataPlaceholder';
import {
  customChartOptions,
  customTooltipFormatter
} from '@/entities/Revenue/CompoundFeeRevenueReceived/customChartOptions';
import { NOT_MARKET } from '@/shared/consts/consts';
import { useChartControls } from '@/shared/hooks/useChartControls';
import { useCompoundChartBars } from '@/shared/hooks/useCompoundChartBars';
import { useFiltersSync } from '@/shared/hooks/useFiltersSync';
import { useModal } from '@/shared/hooks/useModal';
import { RevenuePageProps } from '@/shared/hooks/useRevenue';
import { getCsvFileName } from '@/shared/lib/utils/getCsvFileName';
import { getSummarizedCsvData } from '@/shared/lib/utils/getSummarizedCsvData';
import {
  capitalizeFirstLetter,
  filterAndSortMarkets,
  groupOptionsDto
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
import SingleDropdown from '@/shared/ui/SingleDropdown/SingleDropdown';
import TabsGroup from '@/shared/ui/TabsGroup/TabsGroup';
import Text from '@/shared/ui/Text/Text';
import View from '@/shared/ui/View/View';

interface SelectedOptionsState {
  chain: OptionType[];
  market: OptionType[];
  symbol: OptionType[];
  assetType: OptionType[];
}

const groupByOptions = ['None', 'Asset Type', 'Chain', 'Market'];

const groupByPathMapping: Record<string, string> = {
  'Asset Type': 'source.asset.type',
  Chain: 'source.network',
  Market: 'source.market'
};

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

const getValueByPath = (obj: any, path: string): any => {
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};

interface StackedChartData {
  date: string;
  [key: string]: string | number;
}

interface FiltersProps {
  chainOptions: OptionType[];

  deploymentOptionsFilter: OptionType[];

  assetTypeOptions: OptionType[];

  symbolOptions: OptionType[];

  barSize: BarSize;

  isShowEyeIcon: boolean;

  isLoading: boolean;

  openSingle: boolean;

  groupBy: string;

  csvFilename: string;

  areAllSeriesHidden: boolean;

  csvData: Record<string, string | number>[];

  dateRange: DateRangeValue;

  minDate?: string;

  maxDate?: string;

  selectedOptions: {
    chain: OptionType[];

    assetType: OptionType[];

    market: OptionType[];

    symbol: OptionType[];
  };

  onSelectChain: (chain: OptionType[]) => void;

  onSelectAssetType: (assetType: OptionType[]) => void;

  onSelectMarket: (market: OptionType[]) => void;

  onSelectSymbol: (symbol: OptionType[]) => void;

  onBarSizeChange: (value: string) => void;

  onDateRangeChange: (next: DateRangeValue) => void;

  toggleSingle: () => void;

  closeSingle: () => void;

  onClearAll: () => void;

  onSelectAll: () => void;

  onDeselectAll: () => void;

  selectSingle: (value: string) => void;
}

const CompoundFeeRevenueRecieved = ({
  revenueData: rawData,
  isLoading,
  isError
}: RevenuePageProps) => {
  const { barSize, onBarSizeChange } = useChartControls({
    initialBarSize: 'D'
  });

  const [dateRange, setDateRange] = useState<DateRangeValue>({
    startDate: '',
    endDate: ''
  });

  const [resetHiddenKey, setResetHiddenKey] = useState(0);

  const initialState: SelectedOptionsState = useMemo(
    () => ({
      chain: [],
      market: [],
      symbol: [],
      assetType: []
    }),
    []
  );

  const [selectedOptions, setSelectedOptions] = useReducer(
    (
      prev: SelectedOptionsState,
      next: Partial<SelectedOptionsState>
    ): SelectedOptionsState => ({
      ...prev,
      ...next
    }),
    initialState
  );

  useFiltersSync(selectedOptions, setSelectedOptions, 'cfrr', [
    'chain',
    'market',
    'symbol',
    'assetType'
  ]);

  const [groupBy, setGroupBy] = useState<string>('Chain');

  const {
    isOpen: isGroupByOpen,
    onOpenModal: onGroupByOpen,
    onCloseModal: onGroupByClose
  } = useModal();

  const handleSelectGroupBy = useCallback(
    (value: string) => {
      setGroupBy(value);
      onGroupByClose();
    },
    [onGroupByClose]
  );

  const {
    chainOptions,
    marketOptions,
    symbolOptions,
    assetTypeOptions,
    chartData
  } = useMemo(() => {
    if (!rawData || rawData.length === 0) {
      return {
        chainOptions: [],
        marketOptions: [],
        symbolOptions: [],
        assetTypeOptions: [],
        chartData: []
      };
    }

    const selectedChainSet = new Set(selectedOptions.chain.map((c) => c.id));
    const selectedMarketSet = new Set(selectedOptions.market.map((m) => m.id));
    const selectedSymbolSet = new Set(selectedOptions.symbol.map((s) => s.id));
    const selectedAssetTypeSet = new Set(
      selectedOptions.assetType.map((a) => a.id)
    );

    const isChainFilterActive = selectedChainSet.size > 0;
    const isMarketFilterActive = selectedMarketSet.size > 0;
    const isSymbolFilterActive = selectedSymbolSet.size > 0;
    const isAssetTypeFilterActive = selectedAssetTypeSet.size > 0;

    const uniqueChains = new Set<string>();
    const uniqueMarkets = new Set<string>();
    const uniqueSymbols = new Set<string>();
    const uniqueAssetTypes = new Set<string>();
    const groupedByDate: { [date: string]: StackedChartData } = {};
    const groupByKeyPath = groupByPathMapping[groupBy];

    const startSeconds = dateRange.startDate
      ? toUtcDateSeconds(dateRange.startDate)
      : null;
    const endSeconds = dateRange.endDate
      ? toUtcDateSeconds(dateRange.endDate, true)
      : null;

    for (const item of rawData) {
      const network = item.source.network;
      const marketName = item.source.market ?? NOT_MARKET;
      const symbolName = item.source.asset.symbol;
      const assetTypeName = item.source.asset.type;

      uniqueChains.add(network);
      uniqueMarkets.add(marketName);
      uniqueSymbols.add(symbolName);
      uniqueAssetTypes.add(assetTypeName);

      if (startSeconds !== null && item.date < startSeconds) continue;
      if (endSeconds !== null && item.date > endSeconds) continue;

      const chainMatch = !isChainFilterActive || selectedChainSet.has(network);
      if (!chainMatch) continue;

      const marketMatch =
        !isMarketFilterActive || selectedMarketSet.has(marketName);
      if (!marketMatch) continue;

      const symbolMatch =
        !isSymbolFilterActive || selectedSymbolSet.has(symbolName);
      if (!symbolMatch) continue;

      const assetTypeMatch =
        !isAssetTypeFilterActive || selectedAssetTypeSet.has(assetTypeName);
      if (!assetTypeMatch) continue;

      const date = new Date(item.date * 1000).toISOString().split('T')[0];

      let seriesKey: string;
      if (groupBy === 'None') {
        seriesKey = 'Total';
      } else {
        seriesKey = getValueByPath(item, groupByKeyPath) || NOT_MARKET;
      }

      if (!groupedByDate[date]) {
        groupedByDate[date] = { date };
      }

      groupedByDate[date][seriesKey] =
        ((groupedByDate[date][seriesKey] as number) || 0) + item.value;
    }

    const createOptions = (
      uniqueValues: Set<string>,
      key?: string
    ): OptionType[] => {
      return Array.from(uniqueValues)
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
    };

    const finalChartData = Object.values(groupedByDate).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return {
      chainOptions: createOptions(uniqueChains),
      symbolOptions: createOptions(uniqueSymbols),
      assetTypeOptions: createOptions(uniqueAssetTypes),
      marketOptions: createOptions(uniqueMarkets, 'market'),
      chartData: finalChartData
    };
  }, [dateRange, rawData, selectedOptions, groupBy]);

  const {
    chartRef,
    seriesData,
    aggregatedData,
    aggregatedSeries,
    areAllSeriesHidden,
    hiddenItems,
    setHiddenItems,
    setAreAllSeriesHidden,
    toggleSeriesByName,
    onSelectAll,
    onDeselectAll
  } = useCompoundChartBars({
    barSize,
    data: chartData
  });

  const barCount =
    dateRange.startDate || dateRange.endDate
      ? aggregatedData.length
      : undefined;

  const csvData = getSummarizedCsvData(aggregatedSeries);

  const deploymentOptionsFilter = useMemo(() => {
    return filterAndSortMarkets(
      marketOptions,
      selectedOptions.chain.map((o) => o.id)
    );
  }, [marketOptions, selectedOptions]);

  const hasData = chartData.length > 0;
  const noDataMessage =
    selectedOptions.chain.length > 0 ||
    selectedOptions.market.length > 0 ||
    selectedOptions.symbol.length > 0 ||
    selectedOptions.assetType.length > 0 ||
    dateRange.startDate ||
    dateRange.endDate
      ? 'No data for selected filters'
      : 'No data available';

  const onSelectChain = useCallback(
    (chain: OptionType[]) => {
      const selectedChainIds = chain.map((o) => o.id);

      const filteredDeployment = selectedOptions.market.filter((el) =>
        selectedChainIds.length === 0
          ? true
          : (el.chain?.some((c) => selectedChainIds.includes(c)) ?? false)
      );

      if (selectedOptions.chain.length > 0 && chain.length === 0) {
        setResetHiddenKey((k) => k + 1);
      }

      setSelectedOptions({ chain, market: filteredDeployment });
    },
    [selectedOptions]
  );

  const onSelectMarket = useCallback(
    (options: OptionType[]) => {
      if (selectedOptions.market.length > 0 && options.length === 0) {
        setResetHiddenKey((k) => k + 1);
      }

      setSelectedOptions({ market: options });
    },
    [selectedOptions]
  );

  const onSelectSymbol = useCallback(
    (options: OptionType[]) => {
      if (selectedOptions.symbol.length > 0 && options.length === 0) {
        setResetHiddenKey((k) => k + 1);
      }

      setSelectedOptions({ symbol: options });
    },
    [selectedOptions]
  );

  const onSelectAssetType = useCallback(
    (options: OptionType[]) => {
      if (selectedOptions.assetType.length > 0 && options.length === 0) {
        setResetHiddenKey((k) => k + 1);
      }

      setSelectedOptions({ assetType: options });
    },
    [selectedOptions]
  );

  const handleResetFilters = useCallback(() => {
    setSelectedOptions(initialState);

    setGroupBy('Chain');

    setResetHiddenKey((k) => k + 1);
    setDateRange({ startDate: '', endDate: '' });
  }, [initialState]);

  const dateBounds = useMemo(() => {
    if (!rawData || rawData.length === 0) {
      return { min: '', max: '' };
    }

    let min = rawData[0].date;
    let max = rawData[0].date;

    rawData.forEach((item) => {
      if (item.date < min) min = item.date;
      if (item.date > max) max = item.date;
    });

    return {
      min: formatDateInputValue(min),
      max: formatDateInputValue(max)
    };
  }, [rawData]);

  const onDateRangeChange = useCallback((next: DateRangeValue) => {
    setDateRange(next);
  }, []);

  return (
    <Card
      title='Compound Fee Revenue Received'
      id='compound-fee-revenue-received'
      isLoading={isLoading}
      isError={isError}
      className={{
        loading: 'min-h-[inherit]',
        container: 'border-background min-h-[571px] border',
        content: 'flex flex-col gap-3 p-0 pb-5 md:px-5 lg:px-10 lg:pb-10'
      }}
    >
      <Filters
        groupBy={groupBy}
        areAllSeriesHidden={areAllSeriesHidden}
        isShowEyeIcon={Boolean(seriesData.length > 1)}
        assetTypeOptions={assetTypeOptions}
        selectedOptions={selectedOptions}
        chainOptions={chainOptions}
        symbolOptions={symbolOptions}
        deploymentOptionsFilter={deploymentOptionsFilter}
        isLoading={isLoading || false}
        barSize={barSize}
        csvData={csvData}
        csvFilename={getCsvFileName('compound-fee-revenue-received')}
        dateRange={dateRange}
        minDate={dateBounds.min}
        maxDate={dateBounds.max}
        openSingle={isGroupByOpen}
        onSelectChain={onSelectChain}
        onSelectAssetType={onSelectAssetType}
        onSelectMarket={onSelectMarket}
        onSelectSymbol={onSelectSymbol}
        onBarSizeChange={onBarSizeChange}
        onDateRangeChange={onDateRangeChange}
        toggleSingle={onGroupByOpen}
        closeSingle={onGroupByClose}
        selectSingle={handleSelectGroupBy}
        onClearAll={handleResetFilters}
        onSelectAll={onSelectAll}
        onDeselectAll={onDeselectAll}
      />
      {!isLoading && !isError && !hasData ? (
        <NoDataPlaceholder
          onButtonClick={handleResetFilters}
          text={noDataMessage}
        />
      ) : (
        <CompoundFeeRecievedChart
          customTooltipFormatter={customTooltipFormatter}
          customOptions={customChartOptions}
          chartRef={chartRef}
          barCount={barCount}
          resetHiddenKey={resetHiddenKey}
          hiddenItems={hiddenItems}
          areAllSeriesHidden={areAllSeriesHidden}
          groupBy={groupBy}
          barSize={barSize}
          seriesData={seriesData}
          aggregatedData={aggregatedData}
          toggleSeriesByName={toggleSeriesByName}
          onHiddenItems={setHiddenItems}
          onAreAllSeriesHidden={setAreAllSeriesHidden}
          onSelectAll={onSelectAll}
          onDeselectAll={onDeselectAll}
        />
      )}
    </Card>
  );
};

const Filters = memo(
  ({
    barSize,
    openSingle,
    groupBy,
    csvData,
    csvFilename,
    chainOptions,
    dateRange,
    minDate,
    maxDate,
    selectedOptions,
    isShowEyeIcon,
    areAllSeriesHidden,
    deploymentOptionsFilter,
    assetTypeOptions,
    symbolOptions,
    isLoading,
    onSelectChain,
    onSelectAssetType,
    onSelectMarket,
    onSelectSymbol,
    onBarSizeChange,
    onDateRangeChange,
    toggleSingle,
    closeSingle,
    selectSingle,
    onClearAll,
    onSelectAll,
    onDeselectAll
  }: FiltersProps) => {
    const { isOpen, onOpenModal, onCloseModal } = useModal();

    const {
      isOpen: isMoreOpen,
      onOpenModal: onMoreOpen,
      onCloseModal: onMoreClose
    } = useModal();

    const {
      isOpen: isGroupOpen,
      onOpenModal: onGroupOpen,
      onCloseModal: onGroupClose
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
        total: selectedOptions.market.length,
        selectedOptions: selectedOptions.market,
        options: deploymentOptionsFilter || [],
        onChange: onSelectMarket
      };

      const assetTypeFilterOptions = {
        id: 'assetType',
        placeholder: 'Asset Type',
        total: selectedOptions.assetType.length,
        selectedOptions: selectedOptions.assetType,
        options:
          assetTypeOptions?.sort((a, b) => a.label.localeCompare(b.label)) ||
          [],
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
      dateRange,
      deploymentOptionsFilter,
      maxDate,
      minDate,
      onDateRangeChange,
      onSelectAssetType,
      onSelectChain,
      onSelectMarket,
      selectedOptions
    ]);

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
          <div className='flex items-center justify-end gap-2 px-0 py-3'>
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
            <MultiSelect
              options={chainOptions || []}
              value={selectedOptions.chain}
              onChange={onSelectChain}
              placeholder='Chain'
              disabled={isLoading}
            />
            <MultiSelect
              options={deploymentOptionsFilter}
              value={selectedOptions.market}
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
            <div className='flex items-center gap-1'>
              <Text
                tag='span'
                size='11'
                weight='600'
                lineHeight='16'
                className='text-primary-14'
              >
                Group by
              </Text>
              <SingleDropdown
                options={groupByOptions}
                isOpen={openSingle}
                selectedValue={groupBy}
                onOpen={toggleSingle}
                onClose={closeSingle}
                onSelect={selectSingle}
                disabled={isLoading}
                triggerContentClassName='p-[5px]'
              />
            </div>
            <CSVDownloadButton
              data={csvData}
              filename={csvFilename}
            />
          </div>
        </div>
        <div className='block lg:hidden'>
          <div className='flex flex-col justify-end gap-2 px-5 py-3 md:px-0'>
            <div className='flex flex-col items-center justify-end gap-2 sm:flex-row'>
              <div className='flex w-full flex-row items-center gap-2 sm:w-auto'>
                <TabsGroup
                  className={{
                    container: 'hidden w-1/2 sm:block sm:w-auto',
                    list: 'w-full sm:w-auto'
                  }}
                  tabs={['D', 'W', 'M']}
                  value={barSize}
                  onTabChange={onBarSizeChange}
                  disabled={isLoading}
                />
                <Button
                  onClick={onGroupOpen}
                  className='bg-secondary-27 text-gray-11 shadow-13 flex h-9 w-1/2 min-w-[130px] gap-1.5 rounded-lg p-2.5 text-[11px] leading-4 font-semibold sm:w-auto md:h-8 lg:hidden'
                >
                  <Icon
                    name='group-grid'
                    className='h-[14px] w-[14px] fill-none'
                  />
                  Group
                </Button>
                <Button
                  onClick={onOpenModal}
                  className='bg-secondary-27 text-gray-11 shadow-13 flex h-9 w-1/2 min-w-[130px] gap-1.5 rounded-lg p-2.5 text-[11px] leading-4 font-semibold sm:hidden sm:w-auto md:h-8'
                >
                  <Icon
                    name='filters'
                    className='h-[14px] w-[14px] fill-none'
                  />
                  Filters
                </Button>
              </div>
              <div className='flex w-full flex-row items-center gap-2 sm:w-auto'>
                <Button
                  onClick={onOpenModal}
                  className='bg-secondary-27 text-gray-11 shadow-13 hidden h-9 w-full min-w-[130px] gap-1.5 rounded-lg p-2.5 text-[11px] leading-4 font-semibold sm:flex sm:w-auto md:h-8'
                >
                  <Icon
                    name='filters'
                    className='h-[14px] w-[14px] fill-none'
                  />
                  Filters
                </Button>
                <TabsGroup
                  className={{
                    container: 'block w-full sm:hidden sm:w-auto',
                    list: 'w-full sm:w-auto'
                  }}
                  tabs={['D', 'W', 'M']}
                  value={barSize}
                  onTabChange={onBarSizeChange}
                  disabled={isLoading}
                />
                <Button
                  onClick={onMoreOpen}
                  className='bg-secondary-27 shadow-13 md:miw-w-8 flex h-9 min-w-9 rounded-lg sm:w-auto md:h-8 lg:hidden'
                >
                  <Icon
                    name='3-dots'
                    className='h-6 w-6 fill-none'
                  />
                </Button>
              </div>
            </div>
          </div>
          <Filter
            isOpen={isOpen}
            filterOptions={filterOptions}
            onClose={onCloseModal}
            onClearAll={onClearAll}
          />
          <GroupDrawer
            isOpen={isGroupOpen}
            selectedOption={groupBy}
            options={groupOptionsDto(groupByOptions)}
            onClose={onGroupClose}
            onSelect={selectSingle}
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
            </div>
          </Drawer>
        </div>
      </>
    );
  }
);

export default memo(CompoundFeeRevenueRecieved);

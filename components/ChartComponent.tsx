import React, { useState, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { ChartData } from '../types';
import {
  BarChart2,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Table as TableIcon,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  TrendingUp,
  ArrowUpDown,
  Search,
  LayoutGrid,
  FileSpreadsheet,
} from 'lucide-react';

interface ChartComponentProps {
  data: ChartData;
}

const PALETTE = [
  '#2563eb', // blue-600
  '#0d9488', // teal-600
  '#d97706', // amber-600
  '#db2777', // pink-600
  '#7c3aed', // violet-600
  '#0284c7', // sky-600
  '#ea580c', // orange-600
  '#16a34a', // green-600
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const val =
      typeof payload[0].value === 'number'
        ? payload[0].value.toLocaleString(undefined, { maximumFractionDigits: 2 })
        : payload[0].value;
    return (
      <div className="p-2.5 bg-white border border-slate-200/90 rounded-xl shadow-lg text-xs font-mono">
        <p className="font-semibold text-slate-800 font-sans">{label || payload[0].name}</p>
        <p className="text-blue-600 font-medium mt-0.5">{`Value: ${val}`}</p>
        {payload[0].payload?.share && (
          <p className="text-slate-500 text-[10px]">{`Share: ${payload[0].payload.share}%`}</p>
        )}
      </div>
    );
  }
  return null;
};

const ChartComponent: React.FC<ChartComponentProps> = ({ data }) => {
  const [activeType, setActiveType] = useState<'bar' | 'line' | 'pie'>(data.type || 'bar');
  const [viewMode, setViewMode] = useState<'chart' | 'table' | 'split'>('chart');
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tableSearch, setTableSearch] = useState('');
  const [sortField, setSortField] = useState<'name' | 'value'>('value');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const { title, data: rawChartData } = data;

  // Sync activeType if data.type changes
  useEffect(() => {
    if (data.type) setActiveType(data.type);
  }, [data.type]);

  // Handle ESC key to close full-screen modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  const rawNormalized = useMemo(() => {
    if (!rawChartData) return [];
    return rawChartData.map((d) => ({
      name: String(d.name || ''),
      value: typeof d.value === 'number' ? d.value : Number(d.value) || 0,
    }));
  }, [rawChartData]);

  // Natural Language Statistical Synthesis
  const stats = useMemo(() => {
    if (rawNormalized.length === 0) return null;

    const total = rawNormalized.reduce((acc, curr) => acc + curr.value, 0);
    const avg = total / rawNormalized.length;

    let highest = rawNormalized[0];
    let lowest = rawNormalized[0];

    rawNormalized.forEach((item) => {
      if (item.value > highest.value) highest = item;
      if (item.value < lowest.value) lowest = item;
    });

    const highestShare = total > 0 ? ((highest.value / total) * 100).toFixed(1) : '0';
    const lowestShare = total > 0 ? ((lowest.value / total) * 100).toFixed(1) : '0';
    const ratio = lowest.value > 0 ? (highest.value / lowest.value).toFixed(1) : null;

    // Variance / spread assessment
    const spread = highest.value - lowest.value;

    return {
      total,
      avg,
      highest,
      highestShare,
      lowest,
      lowestShare,
      ratio,
      spread,
      count: rawNormalized.length,
    };
  }, [rawNormalized]);

  // Chart data with calculated share
  const chartData = useMemo(() => {
    const total = stats?.total || 1;
    return rawNormalized.map((d) => ({
      ...d,
      share: total > 0 ? ((d.value / total) * 100).toFixed(1) : '0',
    }));
  }, [rawNormalized, stats?.total]);

  // Filtered and sorted table data
  const tableData = useMemo(() => {
    let result = [...chartData];

    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase();
      result = result.filter((item) => item.name.toLowerCase().includes(q));
    }

    result.sort((a, b) => {
      if (sortField === 'name') {
        return sortOrder === 'asc'
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      }
      return sortOrder === 'asc' ? a.value - b.value : b.value - a.value;
    });

    return result;
  }, [chartData, tableSearch, sortField, sortOrder]);

  const handleCopyTable = () => {
    if (chartData.length === 0) return;
    const header = 'Item,Value,% Share';
    const total = stats?.total || 1;
    const rows = chartData.map(
      (d) => `"${d.name.replace(/"/g, '""')}",${d.value},${d.share}%`
    );
    const csv = [header, ...rows, `"Total",${total},100%`].join('\n');
    navigator.clipboard.writeText(csv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleSort = (field: 'name' | 'value') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'value' ? 'desc' : 'asc');
    }
  };

  if (!rawNormalized || rawNormalized.length === 0) {
    return (
      <div className="w-full py-6 text-center text-xs text-slate-400 font-mono">
        No numeric data points available for chart visualization.
      </div>
    );
  }

  const isDense = chartData.length > 5;

  const renderVisualChart = () => {
    switch (activeType) {
      case 'bar':
        return (
          <BarChart
            data={chartData}
            margin={{ top: 12, right: 12, left: -10, bottom: isDense ? 45 : 18 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="name"
              stroke="#64748b"
              tick={{ fontSize: 10, fill: '#64748b' }}
              interval={0}
              angle={isDense ? -30 : 0}
              textAnchor={isDense ? 'end' : 'middle'}
              height={isDense ? 50 : 25}
            />
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 10, fill: '#64748b' }}
              width={48}
              tickFormatter={(v) =>
                v >= 1000000
                  ? `${(v / 1000000).toFixed(1)}M`
                  : v >= 1000
                  ? `${(v / 1000).toFixed(0)}k`
                  : String(v)
              }
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(37, 99, 235, 0.04)' }} />
            <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]}>
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        );
      case 'line':
        return (
          <LineChart
            data={chartData}
            margin={{ top: 12, right: 12, left: -10, bottom: isDense ? 45 : 18 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="name"
              stroke="#64748b"
              tick={{ fontSize: 10, fill: '#64748b' }}
              interval={0}
              angle={isDense ? -30 : 0}
              textAnchor={isDense ? 'end' : 'middle'}
              height={isDense ? 50 : 25}
            />
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 10, fill: '#64748b' }}
              width={48}
              tickFormatter={(v) =>
                v >= 1000000
                  ? `${(v / 1000000).toFixed(1)}M`
                  : v >= 1000
                  ? `${(v / 1000).toFixed(0)}k`
                  : String(v)
              }
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#2563eb"
              strokeWidth={2.5}
              dot={{ r: 4, fill: '#2563eb' }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        );
      case 'pie':
        return (
          <PieChart margin={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={isExpanded ? 130 : 80}
              innerRadius={isExpanded ? 55 : 35}
              paddingAngle={2}
              label={({ name, percent }) =>
                `${name.length > 12 ? name.slice(0, 10) + '…' : name} (${(percent * 100).toFixed(0)}%)`
              }
              labelLine={false}
            >
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
          </PieChart>
        );
      default:
        return null;
    }
  };

  const renderDataTable = () => (
    <div className="w-full flex flex-col h-full">
      {/* Table search & action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-1.5 border-b border-slate-100 text-xs">
        <div className="flex items-center gap-1.5 text-slate-500 font-mono text-[11px]">
          <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
          <span>Reference Table ({chartData.length} entries)</span>
        </div>

        <div className="flex items-center gap-2">
          {chartData.length > 5 && (
            <div className="relative">
              <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Filter entries..."
                className="pl-6 pr-2 py-0.5 text-[11px] bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-400 font-mono"
              />
            </div>
          )}

          <button
            onClick={handleCopyTable}
            className="inline-flex items-center gap-1 text-slate-600 hover:text-blue-600 px-2 py-1 bg-slate-100 hover:bg-blue-50 rounded-md border border-slate-200/70 text-[11px] font-medium transition-colors"
            title="Copy as CSV table to clipboard"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied CSV' : 'Copy CSV'}</span>
          </button>
        </div>
      </div>

      {/* Table Body */}
      <div className="w-full overflow-x-auto max-h-[300px] sm:max-h-[360px] overflow-y-auto">
        <table className="w-full text-xs text-left border-collapse font-mono">
          <thead className="bg-slate-50 text-[10px] text-slate-500 uppercase font-semibold border-y border-slate-200 sticky top-0 z-10">
            <tr>
              <th className="py-2 px-2.5 w-10 text-center">#</th>
              <th
                onClick={() => toggleSort('name')}
                className="py-2 px-3 cursor-pointer hover:bg-slate-100 transition-colors select-none"
              >
                <div className="flex items-center gap-1">
                  <span>Category / Metric</span>
                  <ArrowUpDown className="w-2.5 h-2.5 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => toggleSort('value')}
                className="py-2 px-3 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Value</span>
                  <ArrowUpDown className="w-2.5 h-2.5 text-slate-400" />
                </div>
              </th>
              <th className="py-2 px-3 text-right w-20">% Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-[11px]">
            {tableData.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-400">
                  No matching entries found.
                </td>
              </tr>
            ) : (
              tableData.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50/90 transition-colors">
                  <td className="py-1.5 px-2.5 text-center text-slate-400 text-[10px] tabular-nums">
                    {idx + 1}
                  </td>
                  <td className="py-1.5 px-3 font-sans font-medium text-slate-800 truncate max-w-xs">
                    {item.name}
                  </td>
                  <td className="py-1.5 px-3 text-right font-semibold text-slate-900 tabular-nums">
                    {typeof item.value === 'number'
                      ? item.value.toLocaleString(undefined, { maximumFractionDigits: 2 })
                      : item.value}
                  </td>
                  <td className="py-1.5 px-3 text-right text-slate-600 font-medium tabular-nums">
                    {item.share}%
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {stats && (
            <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-200 text-[11px] sticky bottom-0">
              <tr>
                <td colSpan={2} className="py-2 px-3 text-slate-800 font-sans">
                  Total
                </td>
                <td className="py-2 px-3 text-right text-slate-900 tabular-nums">
                  {stats.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </td>
                <td className="py-2 px-3 text-right text-slate-800 tabular-nums">100%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );

  const cardContent = (
    <>
      {/* Chart Control Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-2 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          {title && (
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate tracking-tight">
              {title}
            </h4>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-slate-500 font-mono">
              {chartData.length} data point{chartData.length === 1 ? '' : 's'}
            </span>
            {stats && (
              <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                · Sum: {stats.total.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Main View Mode Selector */}
          <div className="inline-flex p-0.5 rounded-lg bg-slate-100 border border-slate-200/60 text-xs font-semibold">
            <button
              onClick={() => setViewMode('chart')}
              className={`px-2 py-1 rounded-md flex items-center gap-1 text-[11px] transition-all ${
                viewMode === 'chart'
                  ? 'bg-white text-blue-700 shadow-2xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Chart visualization"
            >
              <BarChart2 className="w-3 h-3 text-blue-600" />
              <span>Chart</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-2 py-1 rounded-md flex items-center gap-1 text-[11px] transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-emerald-700 shadow-2xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Reference data table"
            >
              <TableIcon className="w-3 h-3 text-emerald-600" />
              <span>Table</span>
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`hidden md:flex px-2 py-1 rounded-md items-center gap-1 text-[11px] transition-all ${
                viewMode === 'split'
                  ? 'bg-white text-purple-700 shadow-2xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Side-by-side Chart and Table view"
            >
              <LayoutGrid className="w-3 h-3 text-purple-600" />
              <span>Split</span>
            </button>
          </div>

          {/* Quick Chart Type Switcher (When visual chart is visible) */}
          {(viewMode === 'chart' || viewMode === 'split') && (
            <div className="inline-flex p-0.5 rounded-lg bg-slate-100 border border-slate-200/60 text-xs">
              <button
                onClick={() => setActiveType('bar')}
                className={`p-1 rounded-md transition-all ${
                  activeType === 'bar'
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
                title="Bar Chart"
              >
                <BarChart2 className="w-3 h-3" />
              </button>
              <button
                onClick={() => setActiveType('line')}
                className={`p-1 rounded-md transition-all ${
                  activeType === 'line'
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
                title="Line Chart"
              >
                <LineChartIcon className="w-3 h-3" />
              </button>
              <button
                onClick={() => setActiveType('pie')}
                className={`p-1 rounded-md transition-all ${
                  activeType === 'pie'
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
                title="Pie Chart"
              >
                <PieChartIcon className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Expand / Minimize Full Screen View */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
            title={isExpanded ? 'Exit full screen (Esc)' : 'Expand to full screen'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Dynamic View: Adapts to Chatbot Screen Width */}
      <div
        className={`w-full min-w-0 ${
          isExpanded
            ? 'flex-1 overflow-y-auto'
            : viewMode === 'split'
            ? 'min-h-[290px]'
            : 'min-h-[260px]'
        }`}
      >
        {viewMode === 'chart' && (
          <div className={`w-full min-w-0 ${isExpanded ? 'h-[480px]' : 'h-64 sm:h-72'}`}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220} debounce={50}>
              {renderVisualChart()!}
            </ResponsiveContainer>
          </div>
        )}

        {viewMode === 'table' && renderDataTable()}

        {viewMode === 'split' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start w-full min-w-0">
            <div className={`w-full min-w-0 ${isExpanded ? 'h-[460px]' : 'h-64 sm:h-72'}`}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220} debounce={50}>
                {renderVisualChart()!}
              </ResponsiveContainer>
            </div>
            <div className="w-full min-w-0 border-t md:border-t-0 md:border-l border-slate-100 md:pl-4 pt-3 md:pt-0">
              {renderDataTable()}
            </div>
          </div>
        )}
      </div>

      {/* Always Visible Natural Language Summary Strip of the Plotted Data */}
      {stats && (
        <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-700 bg-slate-50/80 p-2.5 rounded-xl flex items-start gap-2.5">
          <div className="w-5 h-5 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0 mt-0.5">
            <TrendingUp className="w-3 h-3 text-blue-600" />
          </div>
          <div className="leading-relaxed text-[11px] sm:text-xs">
            <span className="font-semibold text-slate-900 font-sans">Natural Language Insight: </span>
            <span className="text-slate-700">
              Top item is <strong className="text-slate-900">{stats.highest.name}</strong> at{' '}
              <strong className="text-blue-700 tabular-nums">
                {stats.highest.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </strong>{' '}
              ({stats.highestShare}% of total); lowest is{' '}
              <strong className="text-slate-900">{stats.lowest.name}</strong> at{' '}
              <strong className="text-slate-800 tabular-nums">
                {stats.lowest.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </strong>{' '}
              ({stats.lowestShare}% of total).
              {stats.ratio && (
                <>
                  {' '}
                  The highest category exceeds the lowest by{' '}
                  <strong className="text-slate-900">{stats.ratio}×</strong>.
                </>
              )}{' '}
              The average across all {stats.count} items is{' '}
              <strong className="text-slate-900 tabular-nums">
                {stats.avg.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </strong>
              .
            </span>
          </div>
        </div>
      )}
    </>
  );

  if (isExpanded) {
    return (
      <>
        {/* Backdrop overlay */}
        <div
          onClick={() => setIsExpanded(false)}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 transition-opacity"
        />
        {/* Fullscreen Modal */}
        <div className="fixed inset-3 sm:inset-8 z-50 p-5 sm:p-6 bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden max-w-6xl mx-auto my-auto h-[90vh]">
          {cardContent}
        </div>
      </>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-full rounded-xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden p-3.5 sm:p-4 transition-all">
      {cardContent}
    </div>
  );
};

export default ChartComponent;
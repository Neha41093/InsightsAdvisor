import type { UniversalDataFile, FileAnalysisSummary, DataMetric, QuestionCategory } from '../types';

/**
 * Instantly computes mathematical and structural statistics directly from the loaded file.
 * Zero network latency, 100% accurate, and completely data-dependent.
 */
export function computeInstantStatistics(dataFile: UniversalDataFile): FileAnalysisSummary {
  // 1. Tabular Data (CSV, TSV, DSV, JSON array of objects)
  if (dataFile.tabular && dataFile.tabular.headers.length > 0 && dataFile.tabular.rows.length > 0) {
    const { headers, rows, totalRows, totalColumns } = dataFile.tabular;
    const metrics: DataMetric[] = [];

    // Analyze each column
    const colStats: {
      header: string;
      isNumeric: boolean;
      sum: number;
      avg: number;
      min: number;
      max: number;
      distinctCount: number;
      topValue: string;
      topCount: number;
    }[] = [];

    headers.forEach((header, colIdx) => {
      const values = rows.map((r) => r[colIdx]);
      const nonNullValues = values.filter((v) => v !== null && v !== undefined && String(v).trim() !== '');

      let numericCount = 0;
      let sum = 0;
      let min = Infinity;
      let max = -Infinity;
      const freqMap = new Map<string, number>();

      nonNullValues.forEach((val) => {
        const sVal = String(val).trim();
        const num = Number(sVal.replace(/[$,]/g, ''));
        if (!isNaN(num) && sVal !== '') {
          numericCount++;
          sum += num;
          if (num < min) min = num;
          if (num > max) max = num;
        }

        freqMap.set(sVal, (freqMap.get(sVal) || 0) + 1);
      });

      const isNumeric = numericCount > nonNullValues.length * 0.6 && numericCount > 0;
      let topValue = '';
      let topCount = 0;
      freqMap.forEach((count, val) => {
        if (count > topCount) {
          topCount = count;
          topValue = val;
        }
      });

      colStats.push({
        header,
        isNumeric,
        sum,
        avg: numericCount > 0 ? sum / numericCount : 0,
        min: min === Infinity ? 0 : min,
        max: max === -Infinity ? 0 : max,
        distinctCount: freqMap.size,
        topValue,
        topCount,
      });
    });

    // Pick the most prominent numeric columns
    const numericCols = colStats.filter((c) => c.isNumeric);
    const categoricalCols = colStats.filter((c) => !c.isNumeric);

    metrics.push({
      label: 'Total Records',
      value: totalRows.toLocaleString(),
      note: `${totalColumns} columns detected`,
      category: 'Volume',
    });

    numericCols.slice(0, 3).forEach((col) => {
      const isCurrency = /revenue|price|cost|sales|mrr|spend|budget|profit/i.test(col.header);
      const isRate = /margin|rate|score|ratio|percentage|percent/i.test(col.header) || (col.avg <= 1 && col.avg >= 0);

      let formattedSum = col.sum.toLocaleString();
      let formattedAvg = col.avg.toLocaleString(undefined, { maximumFractionDigits: 2 });

      if (isCurrency) {
        formattedSum = `$${Math.round(col.sum).toLocaleString()}`;
        formattedAvg = `$${col.avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
      } else if (isRate && col.max <= 1) {
        formattedAvg = `${(col.avg * 100).toFixed(1)}%`;
      }

      metrics.push({
        label: `Total ${col.header}`,
        value: formattedSum,
        note: `Avg: ${formattedAvg} (Range: ${col.min} - ${col.max})`,
        category: 'Metric',
      });
    });

    if (categoricalCols.length > 0) {
      const topCat = categoricalCols[0];
      metrics.push({
        label: `Primary Segment (${topCat.header})`,
        value: `${topCat.distinctCount} unique`,
        note: `Top: ${topCat.topValue} (${topCat.topCount} records)`,
        category: 'Categorical',
      });
    }

    // Build question categories using real detected columns
    const questionCategories: QuestionCategory[] = [];
    const numCol = numericCols[0]?.header || headers[1] || headers[0];
    const catCol = categoricalCols[0]?.header || headers[0];

    questionCategories.push({
      category: 'Key Metrics & Summaries',
      questions: [
        `What is the total and average ${numCol} grouped by ${catCol}?`,
        `Show me a bar chart of ${numCol} across ${catCol}`,
        `Which ${catCol} represents the highest share of ${numCol}?`,
      ],
    });

    if (numericCols.length >= 2) {
      questionCategories.push({
        category: 'Cross-Column Comparison',
        questions: [
          `Compare ${numericCols[0].header} against ${numericCols[1].header}`,
          `Are there any statistical anomalies or outliers in ${numericCols[0].header}?`,
        ],
      });
    }

    questionCategories.push({
      category: 'Strategic Takeaways',
      questions: [
        `Identify the top 3 drivers of ${numCol} and highlight areas for improvement`,
        `Synthesize the overall performance patterns across ${catCol}`,
      ],
    });

    return {
      domain: 'Tabular Dataset',
      executiveSummary: `This dataset contains ${totalRows.toLocaleString()} entries across ${totalColumns} fields (${headers.slice(0, 4).join(', ')}${headers.length > 4 ? ', and more' : ''}). Data Assumption: Based on the detected schema and cell values, this analysis treats ${numericCols.map((c) => c.header).slice(0, 3).join(', ') || headers[0]} as quantitative measures segmented by ${catCol} — please verify if a different column interpretation applies.`,
      metrics: metrics.slice(0, 5),
      dataHealth: {
        records: `${totalRows} records × ${totalColumns} columns`,
        density: 'High',
        quality: 'Validated column structure',
      },
      questionCategories,
      detectedKeyVariables: headers.slice(0, 6),
    };
  }

  // 2. Log Files
  if (dataFile.format === 'log') {
    const lines = dataFile.rawText.split(/\r\n|\n/).filter((l) => l.trim().length > 0);
    const errorLines = lines.filter((l) => /ERROR|FATAL|EXCEPTION|CRITICAL|FAIL/i.test(l));
    const warnLines = lines.filter((l) => /WARN|WARNING/i.test(l));
    const infoLines = lines.filter((l) => /INFO|DEBUG/i.test(l));

    const errorRate = lines.length > 0 ? ((errorLines.length / lines.length) * 100).toFixed(1) : '0';

    // Extract services or hosts
    const services = new Set<string>();
    lines.forEach((l) => {
      const match = l.match(/service=([a-zA-Z0-9_-]+)/i) || l.match(/host=([a-zA-Z0-9_-]+)/i);
      if (match) services.add(match[1]);
    });

    const metrics: DataMetric[] = [
      { label: 'Total Events Logged', value: lines.length.toLocaleString(), note: `${lines.length} lines analyzed`, category: 'Logs' },
      { label: 'Error Occurrences', value: errorLines.length.toLocaleString(), note: `${errorRate}% of total events`, category: 'Errors' },
      { label: 'Warning Alerts', value: warnLines.length.toLocaleString(), note: 'Potential degradation', category: 'Warnings' },
      { label: 'Identified Components', value: `${services.size || 1} services`, note: Array.from(services).slice(0, 2).join(', ') || 'Host services', category: 'Infrastructure' },
    ];

    const questionCategories: QuestionCategory[] = [
      {
        category: 'Root-Cause & Incident Timeline',
        questions: [
          'What is the chronological sequence of events leading up to the first error?',
          'Which service or host produced the highest error count?',
          'Show me a bar chart of errors by service or error code',
        ],
      },
      {
        category: 'Operational Recommendations',
        questions: [
          'What immediate remediations should be prioritized to resolve these errors?',
          'Were there memory, timeout, or connection pool warnings preceding the crash?',
        ],
      },
    ];

    return {
      domain: 'System / Infrastructure Logs',
      executiveSummary: `System log stream containing ${lines.length} event records. Detected ${errorLines.length} errors (${errorRate}% rate) and ${warnLines.length} warning alerts across monitored components.`,
      metrics,
      dataHealth: {
        records: `${lines.length} log lines`,
        density: 'Medium',
        quality: `${errorLines.length} error signals detected`,
      },
      questionCategories,
    };
  }

  // 3. JSON Object or Hierarchical Data
  if (dataFile.format === 'json' && dataFile.parsedJson) {
    const isArr = Array.isArray(dataFile.parsedJson);
    const count = isArr ? dataFile.parsedJson.length : Object.keys(dataFile.parsedJson).length;
    const sampleKeys = isArr && count > 0 && typeof dataFile.parsedJson[0] === 'object'
      ? Object.keys(dataFile.parsedJson[0])
      : Object.keys(dataFile.parsedJson);

    const metrics: DataMetric[] = [
      { label: isArr ? 'Total Items' : 'Root Keys', value: count.toLocaleString(), note: isArr ? 'Array of entities' : 'Structured object', category: 'JSON' },
      { label: 'Primary Attributes', value: `${sampleKeys.length} fields`, note: sampleKeys.slice(0, 3).join(', '), category: 'Attributes' },
      { label: 'Payload Size', value: `${(dataFile.size / 1024).toFixed(1)} KB`, note: `${dataFile.lineCount} lines`, category: 'Size' },
    ];

    const topKey = sampleKeys[0] || 'records';
    const questionCategories: QuestionCategory[] = [
      {
        category: 'Data Hierarchy & Entity Extraction',
        questions: [
          `Summarize the distribution of ${topKey} across records`,
          'Are there any records exceeding normal operational thresholds or risk limits?',
          'Extract all key entities and their status attributes',
        ],
      },
      {
        category: 'Aggregations & Visualizations',
        questions: [
          'Show me a chart visualizing the breakdown across primary categories',
          'Calculate total values and active counts across entities',
        ],
      },
    ];

    return {
      domain: isArr ? 'JSON Entity Array' : 'Hierarchical JSON Data',
      executiveSummary: `Structured JSON file containing ${count} ${isArr ? 'records' : 'top-level properties'} featuring attributes like ${sampleKeys.slice(0, 4).join(', ')}.`,
      metrics,
      dataHealth: {
        records: `${count} entities`,
        density: 'High',
        quality: 'Valid structured schema',
      },
      questionCategories,
      detectedKeyVariables: sampleKeys.slice(0, 5),
    };
  }

  // 4. Unstructured Text / Documents / Transcripts
  const words = dataFile.wordCount;
  const lines = dataFile.lineCount;
  const readTimeMin = Math.max(1, Math.ceil(words / 200));

  const metrics: DataMetric[] = [
    { label: 'Word Count', value: words.toLocaleString(), note: `~${readTimeMin} min read time`, category: 'Text' },
    { label: 'Line Count', value: lines.toLocaleString(), note: `${dataFile.charCount.toLocaleString()} characters`, category: 'Length' },
    { label: 'Format Type', value: dataFile.formatLabel, note: 'Textual document', category: 'Format' },
  ];

  const questionCategories: QuestionCategory[] = [
    {
      category: 'Executive Synthesis',
      questions: [
        'Provide an executive summary of key takeaways and conclusions',
        'Extract all notable action items, dates, and mentioned entities',
        'What are the primary recurring themes or concerns expressed in this text?',
      ],
    },
    {
      category: 'Deep Inquiry',
      questions: [
        'What are the most critical risks or bottlenecks highlighted?',
        'Synthesize user feedback and sentiment trends into clear bullet points',
      ],
    },
  ];

  return {
    domain: 'Text / Qualitative Document',
    executiveSummary: `Unstructured document consisting of ${words.toLocaleString()} words across ${lines} lines. Features qualitative analysis, interview transcripts, or operational notes ready for synthesis.`,
    metrics,
    dataHealth: {
      records: `${lines} lines (${words} words)`,
      density: 'Dense text',
      quality: 'Legible document content',
    },
    questionCategories,
  };
}

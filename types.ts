export type DataFormat =
  | 'tabular'
  | 'json'
  | 'jsonl'
  | 'xml'
  | 'yaml'
  | 'log'
  | 'code'
  | 'markdown'
  | 'pdf'
  | 'unstructured_text';

export interface TabularData {
  headers: string[];
  rows: (string | number | boolean | null)[][];
  totalRows: number;
  totalColumns: number;
}

export interface UniversalDataFile {
  name: string;
  size: number;
  format: DataFormat;
  formatLabel: string;
  rawText: string;
  tabular?: TabularData;
  parsedJson?: any;
  lineCount: number;
  wordCount: number;
  charCount: number;
  summaryPreview: string;
}

export interface ChartData {
  type: 'bar' | 'line' | 'pie';
  title: string;
  data: { name: string; value: number }[];
}

export interface ToolExecution {
  tool: string; // e.g. "Python (Pandas)", "SQL Query Engine", "Statistical Calculator", "Log / Regex Parser"
  code: string; // The exact code, SQL, or computational formula executed
  output?: string; // Calculated numeric/intermediate output
  reason?: string; // Why this tool was chosen for the query
}

export interface Feedback {
  rating: 'up' | 'down' | null;
  comment?: string;
  timestamp?: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  chart?: ChartData;
  toolExecution?: ToolExecution;
  feedback?: Feedback;
  isLoading?: boolean;
  isSummary?: boolean;
  suggestedFollowUps?: string[];
}

export type AnalysisDepth = 'auto' | 'summary' | 'detailed';

export interface DataMetric {
  label: string;
  value: string | number;
  note?: string;
  category?: string;
}

export interface QuestionCategory {
  category: string;
  questions: string[];
}

export interface FileAnalysisSummary {
  domain: string; // Identified real domain (e.g. Healthcare, Telemetry, Financial, Customer Support, Genomics)
  executiveSummary: string;
  metrics: DataMetric[];
  dataHealth: {
    records: string;
    density: string;
    quality: string;
  };
  questionCategories: QuestionCategory[];
  detectedKeyVariables?: string[];
}

export interface LearnedPattern {
  id: string;
  question: string;
  answerSummary: string;
  toolUsed?: string;
  rating: 'up' | 'down';
  userNote?: string;
  timestamp: number;
  chartType?: string;
}

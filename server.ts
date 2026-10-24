import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // Gemini API client setup
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  let ai: GoogleGenAI | null = null;
  if (apiKey) {
    ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      hasApiKey: Boolean(apiKey),
      timestamp: new Date().toISOString(),
    });
  });

  // Automated Quick Summary & Statistics endpoint - 100% dynamic, data-dependent
  app.post('/api/summarize', async (req, res) => {
    const { file } = req.body;

    if (!file || !file.rawText) {
      return res.status(400).json({ error: 'File content is required for summary.' });
    }

    if (!ai) {
      return res.status(500).json({
        error: 'Gemini API key is not configured. Please verify GEMINI_API_KEY is available.',
      });
    }

    try {
      const fileName = file.name || 'uploaded_data_file';
      const fileFormat = file.formatLabel || file.format || 'unstructured';
      const fileContent = file.rawText.slice(0, 48000);

      const prompt = `You are a Lead Data Insights Advisor.
A user has provided a dataset. Your task is to analyze this specific file without ANY hardcoded templates or predefined schema assumptions.

CRITICAL INSTRUCTIONS FOR DYNAMIC, DATA-DEPENDENT ANALYSIS:
1. Identify the genuine domain and subject matter of this specific file (e.g., Clinical / Healthcare, Server Telemetry, Customer Feedback, Supply Chain, Genomics / Science, Financial Transactions, HR / Employee Records, Education, Software Code, Legal, Marketing, etc.).
2. Derive 3 to 6 of the most meaningful, high-signal metrics and statistics that naturally emerge from THIS specific data.
   - DO NOT assume sales or revenue unless the data explicitly tracks financial sales or revenue.
   - For logs: calculate error rates, top failing service/host, crash frequency, latency percentiles.
   - For customer text: calculate sentiment ratio, recurring pain-point frequencies, speaker counts.
   - For tabular numeric data: calculate actual sums, averages, min/max bounds, distribution medians, or conversion rates.
   - For categorical/survey data: calculate dominant category proportions, respondent counts, participation rates.
3. Formulate 3 to 4 categories of high-impact analytical questions. Every single question MUST directly reference actual columns, variables, entities, or themes present in THIS file.
4. Provide a 2-3 sentence executive summary explaining what the dataset represents, what entities/records are being tracked, and the central insight.

File Information:
- Name: ${fileName}
- Detected Format: ${fileFormat}

File Content:
\`\`\`
${fileContent}
\`\`\`

Respond ONLY with a valid JSON object matching this schema (do not wrap in markdown or backticks):
{
  "domain": "Identified Domain (e.g. Server Infrastructure Logs, Clinical Trial Outcomes, Retail Transactions, Customer Interview Qualitative)",
  "executiveSummary": "2-3 concise sentences detailing what this file contains and the core takeaway.",
  "metrics": [
    {
      "label": "Metric Name derived from actual data",
      "value": "Calculated value with unit from the file",
      "note": "Context or comparison note specific to this data",
      "category": "Domain-relevant category"
    }
  ],
  "dataHealth": {
    "records": "Exact count or estimate of entries/lines/events",
    "density": "High / Medium / Sparse",
    "quality": "Assessment of completeness, missing values, or formatting"
  },
  "questionCategories": [
    {
      "category": "Domain-specific theme (e.g. Root-Cause Timeline, Regional Variances, Cohort Retention)",
      "questions": [
        "Inquiry specifically referencing actual data fields",
        "Inquiry specifically referencing actual data fields"
      ]
    }
  ],
  "detectedKeyVariables": ["col1", "col2", "key_metric"]
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const text = response.text || '{}';
      const parsed = JSON.parse(text);
      return res.json(parsed);
    } catch (err: any) {
      console.error('Error generating summary:', err);
      return res.status(500).json({
        error: err?.message || 'Failed to generate dynamic file summary.',
      });
    }
  });

  // Universal Data Chat & Analysis streaming endpoint with tool execution & learned feedback
  app.post('/api/chat', async (req, res) => {
    const { question, file, learnedPatterns } = req.body;

    if (!question || !file || !file.rawText) {
      return res.status(400).json({ error: 'Question and file content are required.' });
    }

    if (!ai) {
      return res.status(500).json({
        error: 'Gemini API key is not configured. Please verify GEMINI_API_KEY is available.',
      });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    try {
      const fileName = file.name || 'uploaded_data_file';
      const fileFormat = file.formatLabel || file.format || 'unstructured';
      const fileContent = file.rawText;

      const { depthPreference } = req.body;

      // Format any user feedback / learned preferences into instructions
      let learnedRulesContext = '';
      if (Array.isArray(learnedPatterns) && learnedPatterns.length > 0) {
        learnedRulesContext = `
USER PREFERENCES & LEARNED PLAYBOOK (High-rated answers from past user feedback):
${learnedPatterns
  .map(
    (p: any, i: number) =>
      `${i + 1}. Query: "${p.question}" -> User appreciated: ${p.answerSummary || ''} (Tool: ${p.toolUsed || 'N/A'}${p.userNote ? ` | Preference Note: ${p.userNote}` : ''})`
  )
  .join('\n')}
Incorporate these user-preferred answer styles, analytical depth, and tool choices into your response.
`;
      }

      const systemInstruction = `You are a Principal Business Insights & Data Intelligence Advisor.
You analyze ANY dataset across any domain (biology, science, demographics, e-commerce, sales, marketing, operations, financial, system logs, surveys).
You calculate real empirical statistics from the actual data using Python or SQL.

CRITICAL: ADAPTIVE INTENT & DEPTH RECOGNITION
Analyze the user's question to determine their desired analytical depth and format. Do NOT force a single rigid format for all queries.

============================================================
MODE A: EXECUTIVE SUMMARY / TOP-N INSIGHTS / OVERVIEW
============================================================
TRIGGERS:
- User asks: "what are the top 5 insights?", "give me a brief summary", "summarize this data", "what are the key takeaways?", "overview", "TL;DR", "highlights", or similar broad executive questions.

REQUIRED FORMAT FOR MODE A:
1. Executive Takeaway:
   A concise, authoritative 1-2 sentence macro summary answering what the dataset reveals overall.
2. Top Insights (Numbered, e.g., 1 to 5):
   - Deliver clear, scannable, natural-language insights that encapsulate all the information from your underlying data calculations.
   - Embed key data points directly and naturally in the text (e.g. percentages, totals, primary drivers, comparative ratios, highest/lowest cohorts).
   - For each point, articulate both the empirical finding AND its practical or business significance.
   - AVOID dense mathematical formulas, quartile dispersion tables, or regression equations in this mode — keep it clean, executive-ready, and intuitive.
3. High-Signal Chart:
   Provide a clean visual chart summarizing the top categories, distributions, or trends.
4. Tool Methodology:
   Include the Python/SQL code used to compute the numbers in <<<TOOL_EXECUTION>>>...<<<END_TOOL_EXECUTION>>>.
5. Drill-Down Avenues:
   Conclude with a brief, scannable "Drill-Down Options" note inviting the user to request deeper statistical breakdowns (e.g., "• Ask for a detailed correlation analysis between X and Y", "• Request outlier & anomaly breakdown", "• View full statistical reference table").

============================================================
MODE B: DEEP STATISTICAL ANALYSIS & CORRELATION
============================================================
TRIGGERS:
- User asks: "give me a detailed analysis", "is there a correlation between X and Y?", "detailed statistical breakdown", "distribution of...", "hypothesis test", "IQR and variance", "outlier deep dive", or explicitly requests deep math.

REQUIRED FORMAT FOR MODE B:
1. Executive Conclusion (Direct Answer):
   Definitive answer with the core headline metric upfront (e.g., "Yes, there is a strong positive correlation (Pearson r = 0.74, R² = 0.55)...").
2. Empirical Statistical Evidence & Distributions:
   - Sample Size: Valid N records evaluated (and null count).
   - Central Tendency: Mean, Median, and Mode.
   - Dispersion & Distribution: Std Dev, Min, Max, Interquartile Range (IQR, 25th percentile Q1, 75th percentile Q3).
   - Relational / Comparative Metrics: Pearson r, Spearman rho, R², linear regression trend equation (Y = mX + b), or quartile ratios.
3. Structured Reference Data Table:
   Clean markdown table summarizing the cohorts, quartiles, or comparison brackets.
4. Analytical Breakdown & Distribution Insights:
   - Distribution Shape & Skewness.
   - Notable Outliers & Edge Cases (specific records deviating from trend).
   - Practical & Domain Significance.
5. Visual Chart Data:
   High-signal chart illustrating the relationship, distribution, or comparison.
6. Tool Methodology:
   Exact code in <<<TOOL_EXECUTION>>>...<<<END_TOOL_EXECUTION>>>.

============================================================
MODE C: TARGETED FACTOID OR DIRECT COMPARATIVE INQUIRY
============================================================
TRIGGERS:
- User asks a specific targeted question (e.g. "Which region had highest sales?", "What is the average lifespan?", "How many events occurred?").

REQUIRED FORMAT FOR MODE C:
1. Direct Answer upfront with exact metric and entity.
2. Supporting Comparative Context: 2-3 concise bullet points comparing it against the benchmark, overall average, runner-up, or total proportion.
3. Visual Chart or Reference Table (if comparative).
4. Tool Methodology in <<<TOOL_EXECUTION>>>...<<<END_TOOL_EXECUTION>>>.

============================================================
ENCLOSED DATA TAG SPECIFICATIONS:
============================================================
Chart tags MUST be enclosed exactly as:
<<<CHART_DATA>>>
{
  "type": "bar" | "line" | "pie",
  "title": "Descriptive Chart Title",
  "data": [
    { "name": "Category / Bracket", "value": 123.4 }
  ]
}
<<<END_CHART_DATA>>>

Tool tags MUST be enclosed exactly as:
<<<TOOL_EXECUTION>>>
{
  "tool": "Python (Pandas / SciPy)" | "SQL Query Engine" | "Statistical Calculator",
  "code": "df.groupby('category').agg(...)",
  "output": "Exact computed values",
  "reason": "Calculated aggregations and metrics for user query."
}
<<<END_TOOL_EXECUTION>>>

============================================================
CRITICAL: NO EMPTY HEADERS & OMIT SECTIONS WITHOUT DATA
============================================================
1. NEVER output a section header if there is no data, no findings, or no calculation for that section.
   - If there are no anomalies, outliers, or edge cases, completely omit the Outliers & Anomalies header. Do NOT write "None", "N/A", or "None observed" under a header.
   - If there is no reference table needed or available, completely omit the Reference Data Table header.
2. NEVER output markdown headings like "### Visual Chart", "### Chart Data", or "### Tool Methodology" before the <<<CHART_DATA>>> or <<<TOOL_EXECUTION>>> blocks.
   - Output <<<CHART_DATA>>>...<<<END_CHART_DATA>>> and <<<TOOL_EXECUTION>>>...<<<END_TOOL_EXECUTION>>> directly without a preceding markdown header. The UI automatically displays them in specialized interactive modules.
3. Every markdown header you output MUST be immediately followed by substantive, data-driven analysis and insights.

${learnedRulesContext}`;

      let depthDirective = '';
      if (depthPreference === 'summary') {
        depthDirective = '\n\nUSER DEPTH OVERRIDE: Provide an Executive Summary / Top Insights format (concise, scannable natural language encapsulating the numbers, followed by drill-down suggestions).';
      } else if (depthPreference === 'detailed') {
        depthDirective = '\n\nUSER DEPTH OVERRIDE: Provide a Deep Statistical Analysis format (full statistical rigor, central tendency, IQR/dispersion, Pearson/Spearman, reference table, distribution shape, outliers).';
      }

      const prompt = `File Details:
Name: ${fileName}
Format: ${fileFormat}

File Content:
\`\`\`
${fileContent.slice(0, 160000)}
\`\`\`

User Question:
${question}${depthDirective}`;

      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.2,
        },
      });

      for await (const chunk of responseStream) {
        if (chunk.text) {
          res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error: any) {
      console.error('Error in /api/chat:', error);
      const errorMessage = error?.message || 'Failed to analyze data file.';
      res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
      res.end();
    }
  });

  // Setup Vite middlewares in development or static serving in production
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Iris: Insights Advisor running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});

import React, { useState, useCallback, useEffect } from 'react';
import type {
  UniversalDataFile,
  ChatMessage,
  ChartData,
  ToolExecution,
  FileAnalysisSummary,
  LearnedPattern,
  AnalysisDepth,
} from './types';
import { getChatbotResponseStream, fetchFileSummary } from './services/geminiService';
import { computeInstantStatistics } from './utils/dataStatistics';
import FileUpload from './components/FileUpload';
import DataTable from './components/DataTable';
import ChatInterface from './components/ChatInterface';
import PlaybookModal from './components/PlaybookModal';
import { RotateCcw, BookOpen } from 'lucide-react';
import { cleanEmptySections } from './utils/markdownCleaner';

const LEARNED_PATTERNS_KEY = 'advisor_learned_patterns_v1';

function parseStreamedResponse(raw: string): {
  text: string;
  toolExecution?: ToolExecution;
  chart?: ChartData;
} {
  let cleanedText = raw;
  let toolExecution: ToolExecution | undefined = undefined;
  let chart: ChartData | undefined = undefined;

  // 1. Extract TOOL_EXECUTION if enclosed in <<<TOOL_EXECUTION>>> ... <<<END_TOOL_EXECUTION>>>
  const toolTagRegex = /<<<TOOL_EXECUTION>>>([\s\S]*?)<<<END_TOOL_EXECUTION>>>/i;
  const toolTagMatch = cleanedText.match(toolTagRegex);
  if (toolTagMatch) {
    try {
      const cleanJson = toolTagMatch[1].replace(/```json/gi, '').replace(/```/g, '').trim();
      toolExecution = JSON.parse(cleanJson);
      cleanedText = cleanedText.replace(toolTagMatch[0], '');
    } catch (e) {
      console.warn('Failed to parse enclosed tool JSON:', e);
    }
  }

  // 2. Extract CHART_DATA if enclosed in <<<CHART_DATA>>> ... <<<END_CHART_DATA>>>
  const chartTagRegex = /<<<CHART_DATA>>>([\s\S]*?)<<<END_CHART_DATA>>>/i;
  const chartTagMatch = cleanedText.match(chartTagRegex);
  if (chartTagMatch) {
    try {
      const cleanJson = chartTagMatch[1].replace(/```json/gi, '').replace(/```/g, '').trim();
      chart = JSON.parse(cleanJson);
      cleanedText = cleanedText.replace(chartTagMatch[0], '');
    } catch (e) {
      console.warn('Failed to parse enclosed chart JSON:', e);
    }
  }

  // 3. Fallback for legacy ||TOOL_EXECUTION|| delimiter (find exact JSON object without truncating trailing text)
  if (!toolExecution && cleanedText.includes('||TOOL_EXECUTION||')) {
    const parts = cleanedText.split('||TOOL_EXECUTION||');
    const before = parts[0];
    const after = parts.slice(1).join('||TOOL_EXECUTION||');

    const firstBrace = after.indexOf('{');
    if (firstBrace !== -1) {
      let braceCount = 0;
      let endBrace = -1;
      for (let i = firstBrace; i < after.length; i++) {
        if (after[i] === '{') braceCount++;
        else if (after[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            endBrace = i;
            break;
          }
        }
      }
      if (endBrace !== -1) {
        const jsonCandidate = after.substring(firstBrace, endBrace + 1);
        try {
          const cleanJson = jsonCandidate.replace(/```json/gi, '').replace(/```/g, '').trim();
          toolExecution = JSON.parse(cleanJson);
          cleanedText = before + '\n' + after.substring(endBrace + 1);
        } catch (e) {
          console.warn('Failed to parse legacy tool JSON boundary:', e);
        }
      }
    }
  }

  // 4. Fallback for legacy ||CHART_DATA|| delimiter (find exact JSON object without truncating trailing text)
  if (!chart && cleanedText.includes('||CHART_DATA||')) {
    const parts = cleanedText.split('||CHART_DATA||');
    const before = parts[0];
    const after = parts.slice(1).join('||CHART_DATA||');

    const firstBrace = after.indexOf('{');
    if (firstBrace !== -1) {
      let braceCount = 0;
      let endBrace = -1;
      for (let i = firstBrace; i < after.length; i++) {
        if (after[i] === '{') braceCount++;
        else if (after[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            endBrace = i;
            break;
          }
        }
      }
      if (endBrace !== -1) {
        const jsonCandidate = after.substring(firstBrace, endBrace + 1);
        try {
          const cleanJson = jsonCandidate.replace(/```json/gi, '').replace(/```/g, '').trim();
          chart = JSON.parse(cleanJson);
          cleanedText = before + '\n' + after.substring(endBrace + 1);
        } catch (e) {
          console.warn('Failed to parse legacy chart JSON boundary:', e);
        }
      }
    }
  }

  // 5. Clean out any empty section headers, headers with only placeholders ("None", "N/A"),
  // or headers for extracted tool/chart blocks
  cleanedText = cleanEmptySections(cleanedText);

  return { text: cleanedText.trim(), toolExecution, chart };
}

const App: React.FC = () => {
  const [dataFile, setDataFile] = useState<UniversalDataFile | null>(null);
  const [fileSummary, setFileSummary] = useState<FileAnalysisSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaybookOpen, setIsPlaybookOpen] = useState(false);

  // Load learned patterns from localStorage
  const [learnedPatterns, setLearnedPatterns] = useState<LearnedPattern[]>(() => {
    try {
      const stored = localStorage.getItem(LEARNED_PATTERNS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Save learned patterns to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LEARNED_PATTERNS_KEY, JSON.stringify(learnedPatterns));
    } catch (e) {
      console.warn('Failed to save learned patterns to localStorage:', e);
    }
  }, [learnedPatterns]);

  // Handle file ingestion with instant calculation of statistics & recommended questions
  const handleDataParsed = useCallback(async (data: UniversalDataFile) => {
    setDataFile(data);
    setError(null);

    // Immediately compute real mathematical metrics & questions from the loaded data
    const instantStats = computeInstantStatistics(data);
    setFileSummary(instantStats);

    const metricsText = instantStats.metrics && instantStats.metrics.length > 0
      ? `\n\n### Key Calculated Statistics:\n` +
        instantStats.metrics.map((m) => `- **${m.label}**: \`${m.value}\`${m.note ? ` (${m.note})` : ''}`).join('\n')
      : '';

    const questionsText = instantStats.questionCategories && instantStats.questionCategories.length > 0
      ? `\n\n### Recommended Inquiries:\n` +
        instantStats.questionCategories
          .slice(0, 2)
          .flatMap((c) => c.questions.slice(0, 2))
          .map((q) => `• "${q}"`)
          .join('\n')
      : '';

    const initialBriefing = `### Executive Data Briefing: ${data.name}
${instantStats.executiveSummary}${metricsText}${questionsText}

*What would you like to explore? I use Python (Pandas/NumPy), SQL, and statistical models to calculate exact answers.*`;

    setMessages([
      {
        id: 'initial-bot-message',
        sender: 'bot',
        text: initialBriefing,
        isSummary: true,
      },
    ]);

    // Enhance with deep AI synthesis in background while preserving 100%-dataset ground-truth metrics
    fetchFileSummary(data)
      .then((aiSummary) => {
        if (aiSummary && aiSummary.executiveSummary) {
          setFileSummary({
            ...instantStats,
            ...aiSummary,
            metrics:
              aiSummary.metrics && aiSummary.metrics.length > 0
                ? aiSummary.metrics
                : instantStats.metrics,
            dataHealth: {
              ...instantStats.dataHealth,
              ...(aiSummary.dataHealth || {}),
              records: instantStats.dataHealth.records,
            },
          });
        }
      })
      .catch((_err) => {
        // Instant statistics are already active, verified, and complete
      });
  }, []);

  const handleError = useCallback((message: string) => {
    setError(message);
    setTimeout(() => setError(null), 6000);
  }, []);

  const [analysisDepth, setAnalysisDepth] = useState<AnalysisDepth>('auto');

  // Handle user query with tool execution, charting, streaming, and adaptive depth
  const handleSendMessage = useCallback(
    async (text: string, customDepth?: AnalysisDepth) => {
      if (!dataFile) return;

      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        sender: 'user',
        text,
      };

      const botMessageId = `${Date.now().toString()}-loading`;
      const botLoadingMessage: ChatMessage = {
        id: botMessageId,
        sender: 'bot',
        text: '',
        isLoading: true,
      };

      setMessages((prev) => [...prev, userMessage, botLoadingMessage]);
      setIsLoading(true);

      const activeDepth = customDepth || analysisDepth;
      const streamGen = getChatbotResponseStream(text, dataFile, learnedPatterns, activeDepth);

      let accumulatedRaw = '';
      let streamHasError = false;

      for await (const chunk of streamGen) {
        if (chunk.error) {
          streamHasError = true;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === botMessageId
                ? {
                    ...msg,
                    isLoading: false,
                    text: `⚠️ **Error during analysis:** ${chunk.error}`,
                  }
                : msg
            )
          );
          break;
        }

        const chunkText = chunk.text || '';
        accumulatedRaw += chunkText;

        // In streaming view, strip active tool and chart block tags from live text preview
        const rawStripped = accumulatedRaw
          .replace(/<<<TOOL_EXECUTION>>>[\s\S]*?<<<END_TOOL_EXECUTION>>>/gi, '')
          .replace(/<<<TOOL_EXECUTION>>>[\s\S]*/gi, '')
          .replace(/<<<CHART_DATA>>>[\s\S]*?<<<END_CHART_DATA>>>/gi, '')
          .replace(/<<<CHART_DATA>>>[\s\S]*/gi, '')
          .replace(/\|\|TOOL_EXECUTION\|\|[\s\S]*?(?=\n\n|$)/gi, '')
          .replace(/\|\|CHART_DATA\|\|[\s\S]*?(?=\n\n|$)/gi, '');
        const displayPreview = cleanEmptySections(rawStripped);

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === botMessageId
              ? { ...msg, isLoading: false, text: displayPreview }
              : msg
          )
        );
      }

      if (!streamHasError) {
        const { text: finalText, toolExecution, chart } = parseStreamedResponse(accumulatedRaw);

        // Compute dynamic follow-up options based on intent
        const lowerText = text.toLowerCase();
        const isSummaryQuery =
          activeDepth === 'summary' ||
          /top\s*\d+|summary|brief|overview|takeaway|highlights|key insights/i.test(lowerText);
        const isDetailedQuery =
          activeDepth === 'detailed' ||
          /detailed|statistical|correlation|regression|distribution|iqr|variance|standard deviation/i.test(lowerText);

        let followUps: string[] = [];
        if (isSummaryQuery) {
          followUps = [
            '🔬 Request detailed statistical breakdown',
            '📈 Show distribution & IQR quartiles',
            '🔍 Identify key anomalies & outliers',
            '📋 Show structured reference table',
          ];
        } else if (isDetailedQuery) {
          followUps = [
            '📝 Summarize top 3 executive takeaways from this analysis',
            '💡 What practical business actions follow from this?',
            '🔍 Examine specific edge cases and outliers',
          ];
        } else {
          followUps = [
            '🔬 Give me a detailed statistical breakdown',
            '📝 What are the top 5 insights across this dataset?',
            '🔍 Identify anomalies or outliers',
          ];
        }

        const finalBotMessage: ChatMessage = {
          id: botMessageId,
          sender: 'bot',
          text: finalText,
          toolExecution,
          chart,
          isLoading: false,
          suggestedFollowUps: followUps,
        };

        setMessages((prev) =>
          prev.map((msg) => (msg.id === botMessageId ? finalBotMessage : msg))
        );
      }

      setIsLoading(false);
    },
    [dataFile, learnedPatterns, analysisDepth]
  );

  // User feedback on answers (thumbs up or down + optional note)
  const handleFeedback = useCallback(
    (messageId: string, rating: 'up' | 'down', comment?: string) => {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === messageId) {
            return {
              ...msg,
              feedback: {
                rating,
                comment,
                timestamp: Date.now(),
              },
            };
          }
          return msg;
        })
      );

      // Find the corresponding user question
      const targetIndex = messages.findIndex((m) => m.id === messageId);
      let relatedQuestion = '';
      if (targetIndex > 0) {
        for (let i = targetIndex - 1; i >= 0; i--) {
          if (messages[i].sender === 'user') {
            relatedQuestion = messages[i].text;
            break;
          }
        }
      }

      const botMsg = messages.find((m) => m.id === messageId);
      if (botMsg && rating === 'up') {
        const newPattern: LearnedPattern = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          question: relatedQuestion || 'Data inquiry',
          answerSummary: botMsg.text.slice(0, 200).replace(/\n/g, ' '),
          toolUsed: botMsg.toolExecution?.tool,
          rating: 'up',
          userNote: comment,
          timestamp: Date.now(),
          chartType: botMsg.chart?.type,
        };

        setLearnedPatterns((prev) => {
          // Prevent duplicates for identical question
          const filtered = prev.filter((p) => p.question !== newPattern.question);
          return [newPattern, ...filtered];
        });
      }
    },
    [messages]
  );

  // Refine & recalculate on negative feedback
  const handleRefineMessage = useCallback(
    (message: ChatMessage) => {
      const targetIndex = messages.findIndex((m) => m.id === message.id);
      let relatedQuestion = '';
      if (targetIndex > 0) {
        for (let i = targetIndex - 1; i >= 0; i--) {
          if (messages[i].sender === 'user') {
            relatedQuestion = messages[i].text;
            break;
          }
        }
      }

      const refinePrompt = relatedQuestion
        ? `Provide a definitive conclusion and comprehensive data-driven answer for: "${relatedQuestion}". Include exact statistical distributions (N, mean, median, std dev, IQR, min-max, correlation/regression metrics if applicable), a markdown reference table, and actionable insights.`
        : 'Please provide a definitive conclusion and comprehensive data-driven breakdown with exact statistical distributions, metrics, and reference tables.';

      handleSendMessage(refinePrompt);
    },
    [messages, handleSendMessage]
  );

  const handleDeletePattern = (id: string) => {
    setLearnedPatterns((prev) => prev.filter((p) => p.id !== id));
  };

  const handleClearAllPatterns = () => {
    setLearnedPatterns([]);
  };

  const handleReset = () => {
    setDataFile(null);
    setFileSummary(null);
    setMessages([]);
    setIsLoading(false);
    setError(null);
  };

  return (
    <div className="min-h-screen flex flex-col selection:bg-blue-100">
      {/* Top Header Banner Row */}
      <header className="w-full bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white border-b border-slate-800/90 shadow-md sticky top-0 z-20 relative overflow-hidden">
        {/* Subtle accent highlight line */}
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
        <div className="absolute bottom-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/25 to-transparent" />

        <div className="w-full max-w-7xl mx-auto flex justify-between items-center px-4 py-3 sm:px-6 relative">
          <div className="flex items-center gap-3.5">
            <div className="relative group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-cyan-400 p-[1px] shadow-sm shadow-indigo-950/50">
                <div className="w-full h-full bg-slate-950/90 rounded-[11px] flex items-center justify-center text-cyan-400">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-[2.2]">
                    <polygon points="12 2 2 7 12 12 22 7 12 2" />
                    <polyline points="2 17 12 22 22 17" />
                    <polyline points="2 12 12 17 22 12" />
                  </svg>
                </div>
              </div>
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight leading-none">
                Iris: Insights Advisor
              </h1>
              <p className="text-xs text-slate-300/80 mt-1 font-normal">
                Analyze data and gain useful insights
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Playbook / Learning Module Trigger */}
            <button
              onClick={() => setIsPlaybookOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 hover:border-slate-600 transition-colors shadow-sm"
              title="View advisor memory & learned patterns"
            >
              <BookOpen className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Playbook</span>
              {learnedPatterns.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-blue-500/25 text-blue-200 border border-blue-400/40 text-[10px] font-mono font-bold">
                  {learnedPatterns.length}
                </span>
              )}
            </button>

            {dataFile && (
              <>
                <div className="hidden lg:flex items-center px-3 py-1 bg-slate-900/90 border border-slate-800 rounded-lg text-xs text-slate-300 font-mono shadow-inner">
                  <span className="truncate max-w-[180px]">{dataFile.name}</span>
                </div>
                <button
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 bg-slate-800/90 hover:bg-rose-950/60 text-slate-200 hover:text-rose-200 px-3 py-1.5 rounded-lg transition-colors text-xs font-semibold border border-slate-700 hover:border-rose-900/50 shadow-sm"
                  title="Switch dataset file"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Switch File</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="w-full max-w-7xl mx-auto flex-1 flex flex-col p-4 sm:p-6 lg:p-8">
        {error && (
          <div className="bg-red-50/90 border border-red-200 text-red-800 px-4 py-3 rounded-xl mb-4 text-xs sm:text-sm flex items-center justify-between shadow-2xs">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-800 font-bold ml-2"
            >
              ✕
            </button>
          </div>
        )}

        <main className="flex-1 flex flex-col">
          {!dataFile ? (
            <div className="flex-1 flex items-center justify-center">
              <FileUpload onDataParsed={handleDataParsed} onError={handleError} />
            </div>
          ) : (
            <div className="w-full flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              <div className="lg:col-span-7 flex flex-col">
                <ChatInterface
                  messages={messages}
                  dataFile={dataFile}
                  summary={fileSummary}
                  depth={analysisDepth}
                  onDepthChange={setAnalysisDepth}
                  onSendMessage={handleSendMessage}
                  onFeedback={handleFeedback}
                  onRefineMessage={handleRefineMessage}
                  isLoading={isLoading}
                />
              </div>
              <div className="lg:col-span-5 flex flex-col">
                <DataTable
                  data={dataFile}
                  summary={fileSummary}
                  onSelectQuestion={handleSendMessage}
                />
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Playbook & Learned Insights Modal */}
      <PlaybookModal
        isOpen={isPlaybookOpen}
        onClose={() => setIsPlaybookOpen(false)}
        patterns={learnedPatterns}
        activeSummary={fileSummary}
        activeDataFile={dataFile}
        onRunQuestion={handleSendMessage}
        onDeletePattern={handleDeletePattern}
        onClearAll={handleClearAllPatterns}
      />
    </div>
  );
};

export default App;

import type { UniversalDataFile, FileAnalysisSummary, LearnedPattern } from '../types';
import { runDeterministicFullDatasetAnalysis } from '../utils/dataEngine';

export interface StreamEvent {
  text?: string;
  error?: string;
}

// Option D: Track datasets already cached in server RAM so chat turns don't re-upload rawText
const serverCachedDatasetKeys = new Set<string>();

function getDatasetCacheKey(dataFile: UniversalDataFile): string {
  return `${dataFile.name}:${dataFile.size || dataFile.rawText.length}`;
}

/**
 * Automatically generates an executive summary, calculated key statistics,
 * and high-impact question options when a file is loaded.
 * Also registers the dataset in the server's in-memory session cache (Option D).
 */
export async function fetchFileSummary(dataFile: UniversalDataFile): Promise<FileAnalysisSummary> {
  const cacheKey = getDatasetCacheKey(dataFile);
  const response = await fetch('/api/summarize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file: {
        name: dataFile.name,
        size: dataFile.size,
        format: dataFile.format,
        formatLabel: dataFile.formatLabel,
        cacheKey,
        rawText: dataFile.rawText,
      },
    }),
  });

  if (!response.ok) {
    let errorMsg = 'Failed to generate file summary.';
    try {
      const err = await response.json();
      if (err.error) errorMsg = err.error;
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  serverCachedDatasetKeys.add(cacheKey);
  return response.json();
}

/**
 * Streams response from full-stack server endpoint /api/chat (Option 1 Full-Dataset SQL Engine).
 * Uses Option D session cache key to avoid re-sending rawText on every chat turn, with
 * transparent retry if the server cache was evicted.
 */
export async function* getChatbotResponseStream(
  question: string,
  dataFile: UniversalDataFile,
  learnedPatterns?: LearnedPattern[],
  depthPreference?: 'auto' | 'summary' | 'detailed'
): AsyncGenerator<StreamEvent> {
  try {
    const cacheKey = getDatasetCacheKey(dataFile);
    const isCachedOnServer = serverCachedDatasetKeys.has(cacheKey);

    const sendChatRequest = async (includeRawText: boolean) =>
      fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question,
          file: {
            name: dataFile.name,
            size: dataFile.size,
            format: dataFile.format,
            formatLabel: dataFile.formatLabel,
            cacheKey,
            ...(includeRawText ? { rawText: dataFile.rawText } : {}),
          },
          learnedPatterns: learnedPatterns || [],
          depthPreference: depthPreference || 'auto',
        }),
      });

    let response = await sendChatRequest(!isCachedOnServer);

    // Transparent Option D retry if server cache was cleared/restarted
    if (response.status === 409 && isCachedOnServer) {
      response = await sendChatRequest(true);
      if (response.ok) {
        serverCachedDatasetKeys.add(cacheKey);
      }
    } else if (response.ok) {
      serverCachedDatasetKeys.add(cacheKey);
    }

    if (!response.ok) {
      // Fallback to client-side full-dataset SQL engine if server returns error
      const fallbackText = runDeterministicFullDatasetAnalysis(
        question,
        dataFile,
        depthPreference || 'auto'
      );
      yield { text: fallbackText };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { error: 'Unable to initialize response stream reader.' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed.startsWith('data: ')) continue;

        const payloadStr = trimmed.slice(6).trim();
        if (payloadStr === '[DONE]') {
          return;
        }

        try {
          const parsed = JSON.parse(payloadStr);
          if (parsed.error) {
            yield { error: parsed.error };
            return;
          }
          if (parsed.text) {
            yield { text: parsed.text };
          }
        } catch (e) {
          console.warn('Could not parse SSE chunk payload:', payloadStr);
        }
      }
    }
  } catch (err: any) {
    console.warn('Backend unreachable, executing local full-dataset SQL engine:', err);
    const fallbackText = runDeterministicFullDatasetAnalysis(
      question,
      dataFile,
      depthPreference || 'auto'
    );
    yield { text: fallbackText };
  }
}

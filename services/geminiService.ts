import type { UniversalDataFile, FileAnalysisSummary, LearnedPattern } from '../types';

export interface StreamEvent {
  text?: string;
  error?: string;
}

/**
 * Automatically generates an executive summary, calculated key statistics,
 * and high-impact question options when a file is loaded.
 */
export async function fetchFileSummary(dataFile: UniversalDataFile): Promise<FileAnalysisSummary> {
  const response = await fetch('/api/summarize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file: {
        name: dataFile.name,
        format: dataFile.format,
        formatLabel: dataFile.formatLabel,
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

  return response.json();
}

/**
 * Streams response from full-stack server endpoint /api/chat.
 * Incorporates learned feedback patterns and instructions for optimal tool execution.
 */
export async function* getChatbotResponseStream(
  question: string,
  dataFile: UniversalDataFile,
  learnedPatterns?: LearnedPattern[],
  depthPreference?: 'auto' | 'summary' | 'detailed'
): AsyncGenerator<StreamEvent> {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question,
        file: {
          name: dataFile.name,
          format: dataFile.format,
          formatLabel: dataFile.formatLabel,
          rawText: dataFile.rawText,
        },
        learnedPatterns: learnedPatterns || [],
        depthPreference: depthPreference || 'auto',
      }),
    });

    if (!response.ok) {
      let errorDetail = `Server error (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson.error) errorDetail = errJson.error;
      } catch {
        // use default error detail
      }
      yield { error: errorDetail };
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
    console.error('Network or streaming error:', err);
    yield { error: err?.message || 'Connection to analysis server failed.' };
  }
}

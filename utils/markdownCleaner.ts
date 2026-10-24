/**
 * Utility to sanitize markdown responses from AI analysts.
 * Eliminates orphaned headers, headers followed by empty/placeholder text
 * (such as "None", "N/A", "None observed"), and headers whose chart or tool
 * contents were extracted into dedicated UI cards.
 */

// Placeholder lines that indicate a section has no substantive information
const PLACEHOLDER_PATTERN =
  /^\s*(?:[-*•]\s*)?(?:none(?:\s+(?:observed|detected|found|noted|identified|present))?|n\/?a|not applicable|no\s+(?:significant\s+)?(?:anomalies|outliers|edge\s+cases)(?:\s+(?:detected|found|observed|noted))?|no\s+data(?:\s+available)?|nil|none\.)[\.\s]*$/i;

// Headers dedicated to extracted visual chart cards or tool drawers
const EXTRACTED_CARD_HEADERS =
  /^(?:#+\s*|\d+[\.:\)]\s*)(?:visual\s+charts?|high-signal\s+charts?|charts?\s+(?:data|visuals?|overview)|data\s+visualizations?|visualizations?|tool\s+(?:methodology|execution|output)|python\/sql\s+(?:methodology|calculation)|executed\s+(?:script|query)|empirical\s+code)[\s:]*$/i;

/**
 * Removes empty section headers and sections with no real data or information.
 */
export function cleanEmptySections(text: string): string {
  if (!text || typeof text !== 'string') return '';

  let lines = text.split(/\r?\n/);
  let changed = true;
  let iterations = 0;

  // Maximum 6 passes to handle cascading header removals cleanly
  while (changed && iterations < 6) {
    changed = false;
    iterations++;

    const newLines: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Check if line is a markdown header (#, ##, ###, ####)
      const isHeader = /^#{1,5}\s+\S+/.test(trimmedLine);

      if (isHeader) {
        const headerText = trimmedLine.replace(/^#{1,5}\s+/, '').trim();

        // 1. Is it a header explicitly introducing an extracted chart or tool drawer?
        if (EXTRACTED_CARD_HEADERS.test(headerText)) {
          // Skip this header
          changed = true;
          i++;
          // Skip any immediate empty line after it
          while (i < lines.length && lines[i].trim() === '') {
            i++;
          }
          continue;
        }

        // Look ahead for subsequent non-empty content
        let lookAheadIndex = i + 1;
        while (lookAheadIndex < lines.length && lines[lookAheadIndex].trim() === '') {
          lookAheadIndex++;
        }

        // 2. Is this header at the end of the text with no body?
        if (lookAheadIndex >= lines.length) {
          changed = true;
          i = lookAheadIndex; // drop trailing header
          break;
        }

        const nextNonEmpty = lines[lookAheadIndex].trim();

        // 3. Is the next non-empty line another header? (Orphaned empty header)
        if (/^#{1,5}\s+\S+/.test(nextNonEmpty)) {
          changed = true;
          i = lookAheadIndex; // skip this empty header and jump to next
          continue;
        }

        // 4. Does the next line start a raw chart/tool block? Drop the preceding header
        if (/^<<<CHART_DATA>>>|^<<<TOOL_EXECUTION>>>|^\|\|CHART_DATA\|\||^\|\|TOOL_EXECUTION\|\|/i.test(nextNonEmpty)) {
          changed = true;
          i = lookAheadIndex;
          continue;
        }

        // 4. Is the next non-empty line just placeholder text ("None", "N/A", "None observed")?
        if (PLACEHOLDER_PATTERN.test(nextNonEmpty)) {
          // Check if there is anything after this placeholder before the next header
          let afterPlaceholderIndex = lookAheadIndex + 1;
          while (afterPlaceholderIndex < lines.length && lines[afterPlaceholderIndex].trim() === '') {
            afterPlaceholderIndex++;
          }

          const hasSubsequentContent =
            afterPlaceholderIndex < lines.length &&
            !/^#{1,5}\s+\S+/.test(lines[afterPlaceholderIndex].trim());

          if (!hasSubsequentContent) {
            // Drop both this header and the placeholder
            changed = true;
            i = afterPlaceholderIndex;
            continue;
          }
        }
      }

      newLines.push(line);
      i++;
    }

    if (newLines.length !== lines.length) {
      changed = true;
    }
    lines = newLines;
  }

  // Final cleanup of excessive consecutive blank lines and trailing space
  const result = lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return result;
}

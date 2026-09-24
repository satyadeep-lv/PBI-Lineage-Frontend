/**
 * A small DAX tokenizer for colouring code in Power AI answers. It only splits
 * the text into tokens and never reorders, drops or changes a character:
 * joining the tokens' `text` always gives back exactly the input.
 */

export type DaxTokenType = "plain" | "function" | "reference" | "string" | "number" | "comment";

export type DaxToken = { type: DaxTokenType; text: string };

const IDENTIFIER_START = /[A-Za-z_]/;
const IDENTIFIER_PART = /[A-Za-z0-9_.]/;
const DIGIT = /[0-9]/;
const WORD = /[A-Za-z0-9_]/;

/** The index just past a `[...]` starting at `start`, or the end of the text when it never closes. */
function closeBracket(source: string, start: number) {
  const end = source.indexOf("]", start + 1);
  return end === -1 ? source.length : end + 1;
}

/** The index just past a quoted run starting at `start`; a doubled quote is an escaped quote. */
function closeQuote(source: string, start: number, quote: string) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === quote) {
      if (source[index + 1] === quote) index += 2;
      else return index + 1;
    } else {
      index += 1;
    }
  }
  return source.length;
}

export function highlightDax(source: string): DaxToken[] {
  const tokens: DaxToken[] = [];
  const push = (type: DaxTokenType, text: string) => {
    const last = tokens[tokens.length - 1];
    if (type === "plain" && last?.type === "plain") last.text += text;
    else tokens.push({ type, text });
  };

  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const pair = source.slice(index, index + 2);
    let end = index + 1;
    let type: DaxTokenType = "plain";

    if (pair === "//" || pair === "--") {
      const newline = source.indexOf("\n", index);
      end = newline === -1 ? source.length : newline;
      type = "comment";
    } else if (pair === "/*") {
      const close = source.indexOf("*/", index + 2);
      end = close === -1 ? source.length : close + 2;
      type = "comment";
    } else if (char === '"') {
      end = closeQuote(source, index, '"');
      type = "string";
    } else if (char === "'") {
      // 'Table' or 'Table'[Column]
      end = closeQuote(source, index, "'");
      if (source[end] === "[") end = closeBracket(source, end);
      type = "reference";
    } else if (char === "[") {
      end = closeBracket(source, index);
      type = "reference";
    } else if (IDENTIFIER_START.test(char) && (index === 0 || !WORD.test(source[index - 1]))) {
      while (end < source.length && IDENTIFIER_PART.test(source[end])) end += 1;
      if (source[end] === "(") type = "function";
      else if (source[end] === "[") {
        // Table[Column]
        end = closeBracket(source, end);
        type = "reference";
      }
    } else if (DIGIT.test(char) && (index === 0 || !WORD.test(source[index - 1]))) {
      while (end < source.length && /[0-9.]/.test(source[end])) end += 1;
      if (/[eE]/.test(source[end] ?? "") && /[-+0-9]/.test(source[end + 1] ?? "")) {
        end += 2;
        while (end < source.length && DIGIT.test(source[end])) end += 1;
      }
      type = "number";
    }

    push(type, source.slice(index, end));
    index = end;
  }
  return tokens;
}

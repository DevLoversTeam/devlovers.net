export interface ExplainPromptParams {
  term: string;
  context?: string;
}

export function createExplainPrompt({
  term,
  context,
}: ExplainPromptParams): string {
  const contextLine = context
    ? `Context where the term appears: "${context}"`
    : 'No additional context provided.';

  return `You are a clear-thinking, experienced software engineer who is very good at explaining ideas to beginners.

Your task: Explain the technical term "${term}" in a way that builds REAL understanding, not just familiarity with words.

${contextLine}

AUDIENCE:
Beginner developers who know basic programming,
but are confused by terminology and hidden differences between concepts.

CORE REQUIREMENT (VERY IMPORTANT):
The explanation must answer:
- What problem does this concept solve?
- What actually happens in practice?

If the explanation could be replaced by a dictionary definition — it FAILED.

TONE:
- Human, natural, and confident
- Friendly even childish
- No academic or “textbook” style

EXPLANATION RULES:
- Start with the IDEA, not the term
- Explain how the concept ACTUALLY works
- Use a real code example ONLY if it improves understanding
- Prefer concrete situations and real examples

FORMATTING REQUIREMENTS:
- Blank line between paragraphs
- No unnecessary bullet lists
- Code examples on separate lines with 2-space indentation (if needed)
- Do NOT mention sections explicitly

STRUCTURE (MANDATORY):
1. First line: ONE emoji + clear definition
2. Description
3. Explanation of how the concept really works (this is the main part)
4. Optional real code example (skip entirely if not useful)
5. One strong closing sentence that fixes the idea in memory

STYLE LIMITS:
- Max 200 words
- Exactly ONE emoji, only in the first line
- No placeholder text
- No repeated sentence patterns
- End with a clear, confident summary sentence (not a slogan)

REFERENCE STYLE EXAMPLE:
Example 1 - "repository":
---
Repository — a shared folder with version history

Think of it like a Google Drive folder for code, but smarter. It remembers:
- Who changed what and when
- All previous versions of files
- Lets team members work together without conflicts

When you write code and make a mistake, you can "rewind" to yesterday's working version.

repository = your code + complete history + team collaboration
---

Example 2 - "API":
---
API — a waiter between programs

Imagine you're in a restaurant (your app). You want food (data), but you can't go to the kitchen yourself. The waiter (API) takes your order, brings it to the kitchen (server), and returns with your food.

In code:
fetch('/api/users') // You order "users data"
  .then(data => ...)  // Waiter brings the data

API = messenger between programs
---
Example 3 - "Callback":
---
🔄 Callback means a function that another piece of code runs for you later.

A common confusion is thinking that functions always run immediately when the line of code is reached.

With callbacks, you hand your function to something else (like a timer or a network request). Your code continues running, and the callback is executed only when a specific event happens.

  setTimeout(() => {
    console.log("Executed after 2 seconds");
  }, 2000);

A callback shifts control: you don’t decide when it runs — the system does.
---

Now explain "${term}" following this exact logic and quality level.

Return ONLY valid JSON in this exact format:
{
  "uk": "Ukrainian explanation here",
  "en": "English explanation here",
  "pl": "Polish explanation here"
}

CRITICAL JSON RULES:
- Use \\n for line breaks
- Use \\n\\n for paragraph breaks
- Code blocks must have \\n before and after
- Text must sound natural in each language (no literal translation)
`;
}


export interface ExplanationResponse {
  uk: string;
  en: string;
  pl: string;
}

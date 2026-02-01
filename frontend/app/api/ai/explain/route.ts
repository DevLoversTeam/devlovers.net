export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import Groq from 'groq-sdk';
import {
  createExplainPrompt,
  type ExplanationResponse,
} from '@/lib/ai/prompts';
import { getCurrentUser } from '@/lib/auth';

const rateLimiter = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUESTS_PER_WINDOW = 10;
const RATE_LIMIT_WINDOW_MS = 20 * 60 * 1000;

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupRateLimiter() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;

  lastCleanup = now;
  for (const [userId, entry] of rateLimiter.entries()) {
    if (now > entry.resetAt) {
      rateLimiter.delete(userId);
    }
  }
}

const requestSchema = z.object({
  term: z
    .string()
    .min(2, 'Term must be at least 2 characters')
    .max(100, 'Term must be at most 100 characters'),
  context: z
    .string()
    .max(1000, 'Context must be at most 1000 characters')
    .optional(),
});

function checkRateLimit(userId: string): {
  allowed: boolean;
  remaining: number;
  resetIn: number;
} {
  cleanupRateLimiter();

  const now = Date.now();
  const entry = rateLimiter.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimiter.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return {
      allowed: true,
      remaining: MAX_REQUESTS_PER_WINDOW - 1,
      resetIn: RATE_LIMIT_WINDOW_MS,
    };
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    const resetIn = entry.resetAt - now;
    return { allowed: false, remaining: 0, resetIn };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_WINDOW - entry.count,
    resetIn: entry.resetAt - now,
  };
}

function parseExplanationResponse(content: string): ExplanationResponse {
  let cleaned = content.trim();

  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  const parsed = JSON.parse(cleaned);

  if (
    typeof parsed.uk !== 'string' ||
    typeof parsed.en !== 'string' ||
    typeof parsed.pl !== 'string'
  ) {
    throw new Error('Invalid response structure');
  }

  return parsed as ExplanationResponse;
}

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('[ai/explain] GROQ_API_KEY not configured');
    return NextResponse.json(
      { error: 'AI service not configured', code: 'SERVICE_UNAVAILABLE' },
      { status: 503 }
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  const rateLimit = checkRateLimit(user.id);

  if (!rateLimit.allowed) {
    const resetMinutes = Math.ceil(rateLimit.resetIn / 60000);
    return NextResponse.json(
      {
        error: `Rate limit exceeded. Try again in ${resetMinutes} minute${resetMinutes > 1 ? 's' : ''}.`,
        code: 'RATE_LIMITED',
        resetIn: rateLimit.resetIn,
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(MAX_REQUESTS_PER_WINDOW),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetIn / 1000)),
        },
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_JSON' },
      { status: 400 }
    );
  }

  const validationResult = requestSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json(
      {
        error: 'Invalid request',
        code: 'VALIDATION_ERROR',
        details: validationResult.error.format(),
      },
      { status: 400 }
    );
  }

  const { term, context } = validationResult.data;

  const groq = new Groq({ apiKey });

  try {
    const prompt = createExplainPrompt({ term, context });

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 1500,
      top_p: 1,
    });

    const content = chatCompletion.choices[0]?.message?.content;

    if (!content) {
      console.error('[ai/explain] Empty response from Groq');
      return NextResponse.json(
        { error: 'AI returned empty response', code: 'EMPTY_RESPONSE' },
        { status: 502 }
      );
    }

    const explanation = parseExplanationResponse(content);

    return NextResponse.json(explanation, {
      status: 200,
      headers: {
        'X-RateLimit-Limit': String(MAX_REQUESTS_PER_WINDOW),
        'X-RateLimit-Remaining': String(rateLimit.remaining),
        'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetIn / 1000)),
      },
    });
  } catch (error) {
    return handleGroqError(error);
  }
}

export async function GET() {
  const hasApiKey = !!process.env.GROQ_API_KEY;

  if (!hasApiKey) {
    return NextResponse.json(
      {
        status: 'error',
        service: 'ai-explain',
        message: 'API key not configured',
      },
      { status: 503 }
    );
  }

  return NextResponse.json(
    { status: 'ok', service: 'ai-explain' },
    { status: 200 }
  );
}

function handleGroqError(error: unknown): NextResponse {
  if (error instanceof Groq.APIError) {
    console.error(
      `[ai/explain] Groq API error: ${error.status} ${error.message}`
    );

    if (error.status === 401) {
      return NextResponse.json(
        { error: 'AI service authentication failed', code: 'AUTH_ERROR' },
        { status: 503 }
      );
    }

    if (error.status === 429) {
      return NextResponse.json(
        { error: 'AI service rate limited', code: 'API_RATE_LIMITED' },
        { status: 503 }
      );
    }

    if (error.status === 404) {
      return NextResponse.json(
        { error: 'AI model not available', code: 'MODEL_ERROR' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'AI service temporarily unavailable', code: 'API_ERROR' },
      { status: 503 }
    );
  }

  if (error instanceof SyntaxError) {
    console.error('[ai/explain] Failed to parse AI response as JSON');
    return NextResponse.json(
      { error: 'AI returned invalid format', code: 'PARSE_ERROR' },
      { status: 502 }
    );
  }

  if (
    error instanceof Error &&
    error.message === 'Invalid response structure'
  ) {
    console.error('[ai/explain] AI response missing required fields');
    return NextResponse.json(
      { error: 'AI returned incomplete response', code: 'INVALID_STRUCTURE' },
      { status: 502 }
    );
  }

  console.error('[ai/explain] Unexpected error:', error);
  return NextResponse.json(
    { error: 'Failed to generate explanation', code: 'AI_ERROR' },
    { status: 500 }
  );
}

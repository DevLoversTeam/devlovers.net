export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Groq from 'groq-sdk';
import {
  createExplainPrompt,
  type ExplanationResponse,
} from '@/lib/ai/prompts';
import { getClientIp } from '@/lib/security/client-ip';

// =============================================================================
// Rate Limiter (in-memory, resets on cold start)
// =============================================================================
const rateLimiter = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUESTS_PER_WINDOW = 10;
const RATE_LIMIT_WINDOW_MS = 20 * 60 * 1000;

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupRateLimiter() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;

  lastCleanup = now;
  for (const [ip, entry] of rateLimiter.entries()) {
    if (now > entry.resetAt) {
      rateLimiter.delete(ip);
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


function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetIn: number; skipped: boolean } {
  // Bypass rate limiting for unknown IPs (serverless safety)
  if (ip === 'unknown') {
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW, resetIn: RATE_LIMIT_WINDOW_MS, skipped: true };
  }

  cleanupRateLimiter();

  const now = Date.now();
  const entry = rateLimiter.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimiter.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1, resetIn: RATE_LIMIT_WINDOW_MS, skipped: false };
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    const resetIn = entry.resetAt - now;
    return { allowed: false, remaining: 0, resetIn, skipped: false };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_WINDOW - entry.count,
    resetIn: entry.resetAt - now,
    skipped: false,
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

// =============================================================================
// POST /api/ai/explain - Generate term explanation in 3 languages
// =============================================================================
export async function POST(request: NextRequest) {
  // Fail fast if API key is missing
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('[ai/explain] GROQ_API_KEY not configured');
    return NextResponse.json(
      { error: 'AI service not configured', code: 'SERVICE_UNAVAILABLE' },
      { status: 503 }
    );
  }

  // Rate limiting
  const clientIp = getClientIp(request) ?? 'unknown';
  const rateLimit = checkRateLimit(clientIp);

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

  // Parse and validate request body
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

  // Initialize Groq client
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

// =============================================================================
// GET /api/ai/explain - Health check
// =============================================================================
export async function GET() {
  const hasApiKey = !!process.env.GROQ_API_KEY;

  if (!hasApiKey) {
    return NextResponse.json(
      { status: 'error', service: 'ai-explain', message: 'API key not configured' },
      { status: 503 }
    );
  }

  return NextResponse.json(
    { status: 'ok', service: 'ai-explain' },
    { status: 200 }
  );
}

// =============================================================================
// Error Handling
// =============================================================================
function handleGroqError(error: unknown): NextResponse {
  // Handle Groq SDK specific errors
  if (error instanceof Groq.APIError) {
    console.error(`[ai/explain] Groq API error: ${error.status} ${error.message}`);

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

    // Other API errors (500, 503, etc.)
    return NextResponse.json(
      { error: 'AI service temporarily unavailable', code: 'API_ERROR' },
      { status: 503 }
    );
  }

  // Handle JSON parse errors from response parsing
  if (error instanceof SyntaxError) {
    console.error('[ai/explain] Failed to parse AI response as JSON');
    return NextResponse.json(
      { error: 'AI returned invalid format', code: 'PARSE_ERROR' },
      { status: 502 }
    );
  }

  // Handle response structure validation errors
  if (error instanceof Error && error.message === 'Invalid response structure') {
    console.error('[ai/explain] AI response missing required fields');
    return NextResponse.json(
      { error: 'AI returned incomplete response', code: 'INVALID_STRUCTURE' },
      { status: 502 }
    );
  }

  // Unknown errors
  console.error('[ai/explain] Unexpected error:', error);
  return NextResponse.json(
    { error: 'Failed to generate explanation', code: 'AI_ERROR' },
    { status: 500 }
  );
}

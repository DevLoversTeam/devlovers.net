export const runtime = 'nodejs';
export const maxDuration = 25; 

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createExplainPrompt,
  type ExplanationResponse,
} from '@/lib/ai/prompts';
import { getClientIp } from '@/lib/security/client-ip';

// =============================================================================
// SERVER-SIDE LOGGING (sanitized - no sensitive data exposed)
// =============================================================================
function logEnvironmentDiagnostics() {
  const apiKey = process.env.GROQ_API_KEY;
  console.log('[ENV] GROQ_API_KEY configured:', !!apiKey);
  console.log('[ENV] GROQ_API_KEY length:', apiKey ? apiKey.length : 0);
  console.log('[ENV] NODE_ENV:', process.env.NODE_ENV);
  console.log('[ENV] NETLIFY:', process.env.NETLIFY ?? 'false');
  console.log('[ENV] CONTEXT:', process.env.CONTEXT ?? 'unknown');
}

function logRequestDiagnostics(request: NextRequest) {
  console.log('[REQ] Method:', request.method);
  console.log('[REQ] URL path:', new URL(request.url).pathname);
}

function logBodyParsingResult(success: boolean, error?: unknown) {
  console.log('[BODY] Parse success:', success);
  if (error) {
    console.log('[BODY] Parse error:', error instanceof Error ? error.message : 'Unknown error');
  }
}

function logGroqInitialization(success: boolean, error?: unknown) {
  console.log('[GROQ] Init success:', success);
  if (error) {
    const err = error as Error & { status?: number; code?: string };
    console.log('[GROQ] Init error:', err.name, err.message);
  }
}

function logGroqApiCall(phase: 'start' | 'success' | 'error', details?: unknown) {
  if (phase === 'start') {
    console.log('[GROQ] Starting API call');
  } else if (phase === 'success') {
    console.log('[GROQ] API call successful');
  } else if (phase === 'error') {
    const err = details as Error & { status?: number; code?: string };
    console.log('[GROQ] API error:', err?.name, err?.message);
  }
}
// =============================================================================

// =============================================================================
// RATE LIMITER (In-memory - limited effectiveness in serverless)
// Note: This Map only persists within a single warm function instance.
// For production, consider Upstash Redis or Netlify Blobs for true rate limiting.
// Current behavior: works during warm instance, resets on cold start.
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

export async function POST(request: NextRequest) {
  logEnvironmentDiagnostics();
  logRequestDiagnostics(request);

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('[FATAL] GROQ_API_KEY is not configured. Check environment variables.');
    return NextResponse.json(
      {
        error: 'AI service not configured',
        code: 'SERVICE_UNAVAILABLE',
      },
      { status: 503 }
    );
  }

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

  // Safe JSON body parsing for Netlify
  let body: unknown;
  try {
    const text = await request.text();
    if (!text || text.trim() === '') {
      console.log('[BODY] Empty request body received');
      return NextResponse.json(
        { error: 'Request body is empty', code: 'EMPTY_BODY' },
        { status: 400 }
      );
    }
    body = JSON.parse(text);
    logBodyParsingResult(true);
  } catch (parseError) {
    logBodyParsingResult(false, parseError);
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

  // Dynamic import for Netlify compatibility
  let Groq: typeof import('groq-sdk').default;
  try {
    const groqModule = await import('groq-sdk');
    Groq = groqModule.default;
  } catch (importError) {
    console.error('[SDK_IMPORT_ERROR] Failed to import groq-sdk:',
      importError instanceof Error ? importError.message : String(importError)
    );
    return NextResponse.json(
      {
        error: 'Failed to load AI client',
        code: 'SDK_IMPORT_ERROR',
      },
      { status: 503 }
    );
  }

  let groq: InstanceType<typeof Groq>;
  try {
    groq = new Groq({ apiKey });
    logGroqInitialization(true);
  } catch (initError) {
    logGroqInitialization(false, initError);
    console.error('[SDK_INIT_ERROR] Failed to initialize Groq client:',
      initError instanceof Error ? initError.message : String(initError)
    );
    return NextResponse.json(
      {
        error: 'Failed to initialize AI client',
        code: 'SDK_INIT_ERROR',
      },
      { status: 503 }
    );
  }

  try {
    const prompt = createExplainPrompt({ term, context });

    logGroqApiCall('start');
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'llama3-70b-8192',
      temperature: 0.7,
      max_tokens: 1500,
      top_p: 1,
    });
    logGroqApiCall('success', chatCompletion);

    const content = chatCompletion.choices[0]?.message?.content;

    if (!content) {
      console.error('[ERROR] No content in Groq response');
      throw new Error('No content in response');
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
    logGroqApiCall('error', error);
    console.error('[GROQ_ERROR]', error instanceof Error ? error.message : 'Unknown error');

    if (error instanceof Error) {
      if (
        error.message.includes('401') ||
        error.message.includes('authentication') ||
        error.message.includes('Invalid API Key')
      ) {
        console.error('[AUTH_ERROR] API key authentication failed');
        return NextResponse.json(
          {
            error: 'AI service authentication failed',
            code: 'AUTH_ERROR',
          },
          { status: 503 }
        );
      }
      if (
        error.message.includes('429') ||
        error.message.includes('rate limit')
      ) {
        return NextResponse.json(
          { error: 'AI service rate limited', code: 'API_RATE_LIMITED' },
          { status: 503 }
        );
      }
      if (error.message.includes('model')) {
        return NextResponse.json(
          {
            error: 'AI model not available',
            code: 'MODEL_ERROR',
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      {
        error: 'Failed to generate explanation',
        code: 'AI_ERROR',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  const apiKey = process.env.GROQ_API_KEY;
  return NextResponse.json(
    {
      status: apiKey ? 'ok' : 'misconfigured',
      service: 'ai-explain',
      timestamp: new Date().toISOString(),
      env: {
        hasGroqKey: !!apiKey,
        groqKeyLength: apiKey ? apiKey.length : 0,
        nodeEnv: process.env.NODE_ENV,
        isNetlify: !!process.env.NETLIFY,
        context: process.env.CONTEXT ?? 'unknown',
      },
    },
    { status: apiKey ? 200 : 503 }
  );
}

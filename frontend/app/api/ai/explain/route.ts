import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { z } from 'zod';
import {
  createExplainPrompt,
  type ExplanationResponse,
} from '@/lib/ai/prompts';

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

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetIn: number } {
  cleanupRateLimiter();

  const now = Date.now();
  const entry = rateLimiter.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimiter.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1, resetIn: RATE_LIMIT_WINDOW_MS };
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

export async function POST(request: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('GROQ_API_KEY is not configured');
    return NextResponse.json(
      { error: 'AI service not configured', code: 'SERVICE_UNAVAILABLE' },
      { status: 503 }
    );
  }

  const clientIp = getClientIp(request);
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
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 1500,
      top_p: 1,
    });

    const content = chatCompletion.choices[0]?.message?.content;

    if (!content) {
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
    console.error('Groq API error:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const errorName = error instanceof Error ? error.name : 'UnknownError';

    console.error('Error details:', {
      name: errorName,
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (error instanceof Error) {
      if (
        error.message.includes('401') ||
        error.message.includes('authentication') ||
        error.message.includes('Invalid API Key')
      ) {
        return NextResponse.json(
          { error: 'AI service authentication failed', code: 'AUTH_ERROR' },
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
            details: errorMessage,
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      {
        error: 'Failed to generate explanation',
        code: 'AI_ERROR',
        details:
          process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}

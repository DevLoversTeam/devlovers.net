export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { z } from 'zod';
import {
  createExplainPrompt,
  type ExplanationResponse,
} from '@/lib/ai/prompts';
import { getClientIp } from '@/lib/security/client-ip';

// =============================================================================
// DEBUG LOGGING - TEMPORARY (remove after debugging)
// =============================================================================
function logEnvironmentDiagnostics() {
  const apiKey = process.env.GROQ_API_KEY;
  console.log('=== NETLIFY FUNCTION DIAGNOSTICS ===');
  console.log('[ENV] GROQ_API_KEY exists:', !!apiKey);
  console.log('[ENV] GROQ_API_KEY prefix:', apiKey ? apiKey.substring(0, 4) + '****' : 'N/A');
  console.log('[ENV] GROQ_API_KEY length:', apiKey?.length ?? 0);
  console.log('[ENV] NODE_ENV:', process.env.NODE_ENV);
  console.log('[ENV] NETLIFY:', process.env.NETLIFY);
  console.log('[ENV] AWS_LAMBDA_FUNCTION_NAME:', process.env.AWS_LAMBDA_FUNCTION_NAME);
  console.log('[ENV] CONTEXT:', process.env.CONTEXT); // Netlify deploy context
  console.log('[ENV] DEPLOY_URL:', process.env.DEPLOY_URL);
  console.log('[RUNTIME] Expected: nodejs (set via export)');
  console.log('[ENV] All GROQ-related vars:', Object.keys(process.env).filter(k => k.toLowerCase().includes('groq')));
  console.log('====================================');
}

function logRequestDiagnostics(request: NextRequest) {
  console.log('=== REQUEST DIAGNOSTICS ===');
  console.log('[REQ] Method:', request.method);
  console.log('[REQ] URL:', request.url);
  console.log('[REQ] Headers:');
  request.headers.forEach((value, key) => {
    // Redact sensitive headers
    const safeValue = ['authorization', 'cookie', 'x-api-key'].includes(key.toLowerCase())
      ? '[REDACTED]'
      : value;
    console.log(`  ${key}: ${safeValue}`);
  });
  console.log('===========================');
}

function logBodyParsingResult(success: boolean, body?: unknown, error?: unknown) {
  console.log('=== BODY PARSING ===');
  console.log('[BODY] Parse success:', success);
  if (success && body) {
    console.log('[BODY] Parsed body:', JSON.stringify(body, null, 2));
  }
  if (error) {
    console.log('[BODY] Parse error:', error instanceof Error ? error.message : String(error));
  }
  console.log('====================');
}

function logGroqInitialization(success: boolean, error?: unknown) {
  console.log('=== GROQ SDK INITIALIZATION ===');
  console.log('[GROQ] Init success:', success);
  if (error) {
    const err = error as Error & { status?: number; code?: string };
    console.log('[GROQ] Init error name:', err.name);
    console.log('[GROQ] Init error message:', err.message);
    console.log('[GROQ] Init error status:', err.status);
    console.log('[GROQ] Init error code:', err.code);
  }
  console.log('===============================');
}

function logGroqApiCall(phase: 'start' | 'success' | 'error', details?: unknown) {
  console.log(`=== GROQ API CALL (${phase.toUpperCase()}) ===`);
  if (phase === 'start') {
    console.log('[GROQ] Starting API call to llama3-70b-8192');
  } else if (phase === 'success') {
    console.log('[GROQ] API call successful');
    if (details && typeof details === 'object' && 'choices' in details) {
      const response = details as { choices?: Array<{ message?: { content?: string } }> };
      console.log('[GROQ] Response has content:', !!response.choices?.[0]?.message?.content);
      console.log('[GROQ] Content length:', response.choices?.[0]?.message?.content?.length ?? 0);
    }
  } else if (phase === 'error') {
    const err = details as Error & { status?: number; code?: string; headers?: Record<string, string> };
    console.log('[GROQ] API error name:', err?.name);
    console.log('[GROQ] API error message:', err?.message);
    console.log('[GROQ] API error status:', err?.status);
    console.log('[GROQ] API error code:', err?.code);
    console.log('[GROQ] API error stack:', err?.stack?.substring(0, 500));
  }
  console.log('=====================================');
}
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
  // DEBUG: Log environment diagnostics on every request
  logEnvironmentDiagnostics();
  logRequestDiagnostics(request);

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('[FATAL] GROQ_API_KEY is not configured');
    console.error('[DEBUG] All env var keys:', Object.keys(process.env).sort().join(', '));
    return NextResponse.json(
      {
        error: 'AI service not configured',
        code: 'SERVICE_UNAVAILABLE',
        debug: {
          hasKey: false,
          nodeEnv: process.env.NODE_ENV,
          isNetlify: !!process.env.NETLIFY,
          context: process.env.CONTEXT,
        }
      },
      { status: 503 }
    );
  }

  const clientIp = getClientIp(request) ?? 'unknown';
  console.log('[DEBUG] Client IP:', clientIp);
  const rateLimit = checkRateLimit(clientIp);
  console.log('[DEBUG] Rate limit check:', rateLimit);

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
    logBodyParsingResult(true, body);
  } catch (parseError) {
    logBodyParsingResult(false, undefined, parseError);
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_JSON' },
      { status: 400 }
    );
  }

  const validationResult = requestSchema.safeParse(body);
  if (!validationResult.success) {
    console.log('[DEBUG] Validation failed:', validationResult.error.format());
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
  console.log('[DEBUG] Validated request - term:', term, 'context:', context?.substring(0, 50));

  // DEBUG: Wrap Groq client initialization in try/catch
  let groq: Groq;
  try {
    groq = new Groq({ apiKey });
    logGroqInitialization(true);
  } catch (initError) {
    logGroqInitialization(false, initError);
    return NextResponse.json(
      {
        error: 'Failed to initialize AI client',
        code: 'SDK_INIT_ERROR',
        debug: {
          errorName: initError instanceof Error ? initError.name : 'Unknown',
          errorMessage: initError instanceof Error ? initError.message : String(initError),
        }
      },
      { status: 503 }
    );
  }

  try {
    const prompt = createExplainPrompt({ term, context });
    console.log('[DEBUG] Prompt created, length:', prompt.length);

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

    console.log('[DEBUG] Parsing response, raw content length:', content.length);
    const explanation = parseExplanationResponse(content);
    console.log('[DEBUG] Successfully parsed explanation');

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
    console.error('Groq API error:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const errorName = error instanceof Error ? error.name : 'UnknownError';

    // Enhanced error logging
    const errorDetails = {
      name: errorName,
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      status: (error as { status?: number }).status,
      code: (error as { code?: string }).code,
      type: (error as { type?: string }).type,
    };
    console.error('[DEBUG] Full error details:', JSON.stringify(errorDetails, null, 2));

    if (error instanceof Error) {
      if (
        error.message.includes('401') ||
        error.message.includes('authentication') ||
        error.message.includes('Invalid API Key')
      ) {
        return NextResponse.json(
          {
            error: 'AI service authentication failed',
            code: 'AUTH_ERROR',
            debug: { keyPrefix: apiKey.substring(0, 4) }
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
        details: errorMessage, // Always include for debugging (remove in production)
        debug: {
          errorName,
          nodeEnv: process.env.NODE_ENV,
          isNetlify: !!process.env.NETLIFY,
        }
      },
      { status: 500 }
    );
  }
}

// =============================================================================
// DEBUG: GET handler for diagnostics (catches 405 errors, provides health check)
// Remove after debugging
// =============================================================================
export async function GET(request: NextRequest) {
  console.log('=== GET REQUEST TO /api/ai/explain (should be POST) ===');
  logEnvironmentDiagnostics();
  logRequestDiagnostics(request);

  const apiKey = process.env.GROQ_API_KEY;

  return NextResponse.json({
    message: 'This endpoint requires POST method',
    debug: {
      endpoint: '/api/ai/explain',
      expectedMethod: 'POST',
      receivedMethod: 'GET',
      timestamp: new Date().toISOString(),
      environment: {
        hasGroqApiKey: !!apiKey,
        groqApiKeyPrefix: apiKey ? apiKey.substring(0, 4) + '****' : null,
        groqApiKeyLength: apiKey?.length ?? 0,
        nodeEnv: process.env.NODE_ENV,
        isNetlify: !!process.env.NETLIFY,
        netlifyContext: process.env.CONTEXT,
        awsLambdaFunction: process.env.AWS_LAMBDA_FUNCTION_NAME,
        deployUrl: process.env.DEPLOY_URL,
        runtime: 'nodejs',
      },
      allGroqEnvVars: Object.keys(process.env).filter(k =>
        k.toLowerCase().includes('groq')
      ),
    }
  }, { status: 200 }); // Return 200 for diagnostics, not 405
}

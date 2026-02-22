import { randomUUID } from 'node:crypto';
import http from 'node:http';

const PORT = Number(process.env.NP_MOCK_PORT || 4010);

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function okNp(data) {
  return {
    success: true,
    data,
    errors: [],
    warnings: [],
    info: [],
    messageCodes: [],
    errorCodes: [],
    warningCodes: [],
    infoCodes: [],
  };
}

function normalizeReqPayload(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  if (
    req.method === 'GET' &&
    (url.pathname === '/' || url.pathname === '/health')
  ) {
    return json(res, 200, { ok: true, service: 'np-mock', port: PORT });
  }

  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const raw = await readBody(req);
  const payload = normalizeReqPayload(raw);

  // Nova Poshta API style payload:
  // { apiKey, modelName, calledMethod, methodProperties }
  const modelName = String(payload.modelName || '');
  const calledMethod = String(payload.calledMethod || '');
  const props = payload.methodProperties || {};

  // Log minimal, no PII
  console.log(`[np-mock] ${modelName}.${calledMethod}`);

  // 1) Create TTN / label (most important for Phase 5 success)
  // Common: modelName: 'InternetDocument', calledMethod: 'save'
  if (modelName === 'InternetDocument' && calledMethod === 'save') {
    const ref = randomUUID();
    const ttn = `MOCKTTN${Math.floor(Math.random() * 1e8)
      .toString()
      .padStart(8, '0')}`;

    return json(
      res,
      200,
      okNp([
        {
          Ref: ref,
          IntDocNumber: ttn,
          CostOnSite: '0',
          EstimatedDeliveryDate: new Date(Date.now() + 3 * 86400_000)
            .toISOString()
            .slice(0, 10),
        },
      ])
    );
  }

  // 2) Status query (optional)
  if (
    modelName === 'InternetDocument' &&
    calledMethod === 'getStatusDocuments'
  ) {
    return json(
      res,
      200,
      okNp([
        {
          Number:
            props?.Documents?.[0]?.DocumentNumber ||
            props?.DocumentNumber ||
            'UNKNOWN',
          Status: 'Created (mock)',
        },
      ])
    );
  }

  // 3) Cities / warehouses (safe defaults; not required for label success)
  if (
    (modelName === 'Address' && calledMethod === 'getCities') ||
    calledMethod === 'searchSettlements'
  ) {
    return json(
      res,
      200,
      okNp([
        {
          Ref: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          Description: 'Kyiv (mock)',
        },
      ])
    );
  }

  if (
    modelName === 'Address' &&
    (calledMethod === 'getWarehouses' ||
      calledMethod === 'getWarehousesByCityRef')
  ) {
    return json(
      res,
      200,
      okNp([
        {
          Ref: '11111111-1111-1111-1111-111111111111',
          Description: 'Warehouse #1 (mock)',
        },
      ])
    );
  }

  // Default fallback: still success, empty data
  return json(res, 200, okNp([]));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[np-mock] listening on http://127.0.0.1:${PORT}`);
  console.log(
    `[np-mock] POST endpoint accepts any path; use NP_API_BASE=http://127.0.0.1:${PORT}`
  );
});

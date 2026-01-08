const fs = require('fs');
const crypto = require('crypto');

const secret = process.env.STRIPE_WEBHOOK_SECRET;
if (!secret) { console.error("Missing STRIPE_WEBHOOK_SECRET in env"); process.exit(1); }

const payloadPath = process.env.PAYLOAD_PATH;
if (!payloadPath) { console.error("Missing PAYLOAD_PATH in env"); process.exit(1); }

const payload = fs.readFileSync(payloadPath, 'utf8');
const ts = Math.floor(Date.now() / 1000);
const signed = ${ts}.{"id":"evt_test"};
const sig = crypto.createHmac('sha256', secret).update(signed, 'utf8').digest('hex');
const header = 	=,v1=;

fetch("http://localhost:3000/api/shop/webhooks/stripe", {
  method: "POST",
  headers: { "content-type":"application/json", "stripe-signature": header },
  body: payload
}).then(async (r) => {
  const text = await r.text();
  console.log("HTTP", r.status, text);
}).catch((e) => { console.error(e); process.exit(1); });

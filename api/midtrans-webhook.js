// File ini harus disimpan di GitHub dengan nama path: api/midtrans-webhook.js
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const notification = req.body || {};
  const {
    order_id,
    status_code,
    gross_amount,
    signature_key,
    transaction_status,
    fraud_status
  } = notification;

  const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;

  // Verifikasi keaslian notifikasi supaya tidak bisa dipalsukan orang lain
  const expectedSignature = crypto
    .createHash('sha512')
    .update(order_id + status_code + gross_amount + MIDTRANS_SERVER_KEY)
    .digest('hex');

  if (signature_key !== expectedSignature) {
    return res.status(403).json({ error: 'Signature tidak valid' });
  }

  let newStatus = 'pending';
  if (transaction_status === 'capture' || transaction_status === 'settlement') {
    newStatus = fraud_status === 'challenge' ? 'pending' : 'paid';
  } else if (['cancel', 'deny', 'expire'].includes(transaction_status)) {
    newStatus = 'failed';
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${order_id}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({ payment_status: newStatus })
  });

  return res.status(200).json({ ok: true });
}

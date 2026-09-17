// File ini harus disimpan di GitHub dengan nama path: api/create-transaction.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { order_id } = req.body || {};
  if (!order_id) {
    return res.status(400).json({ error: 'order_id wajib diisi' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
  const IS_PRODUCTION = process.env.MIDTRANS_IS_PRODUCTION === 'true';

  // 💰 Harga per template — GANTI ANGKA INI SESUAI HARGA JUAL KAMU
  const HARGA = {
    ultah: 25000,
    anniversary: 25000,
    wisuda: 25000,
    maaf: 25000
  };

  try {
    // Ambil data order dari Supabase (pakai service role, bypass RLS karena ini kode server yang aman)
    const orderRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?id=eq.${order_id}&select=*`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const orders = await orderRes.json();
    if (!orders || !orders.length) {
      return res.status(404).json({ error: 'Order tidak ditemukan' });
    }
    const order = orders[0];
    const amount = HARGA[order.template_id] || 25000;

    const midtransEndpoint = IS_PRODUCTION
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

    const authHeader = 'Basic ' + Buffer.from(MIDTRANS_SERVER_KEY + ':').toString('base64');

    const midtransRes = await fetch(midtransEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader
      },
      body: JSON.stringify({
        transaction_details: {
          order_id: order.id,
          gross_amount: amount
        },
        item_details: [
          {
            id: order.template_id,
            price: amount,
            quantity: 1,
            name: 'Kado Digital - ' + (order.template_id || 'custom')
          }
        ],
        customer_details: {
          first_name: order.dari || 'Pembeli'
        }
      })
    });

    const midtransData = await midtransRes.json();

    if (!midtransRes.ok) {
      return res.status(500).json({ error: midtransData });
    }

    return res.status(200).json({
      token: midtransData.token,
      redirect_url: midtransData.redirect_url
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
                                              }

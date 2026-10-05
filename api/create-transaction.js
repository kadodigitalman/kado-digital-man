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
  const HARGA_DASAR = {
    ultah: 5000,
    anniversary: 5000,
    wisuda: 5000,
    maaf: 5000,
    cinta: 5000,
    ldr: 5000,
    selamat: 5000,
    sembuh: 5000
  };
  const HARGA_ADDON_CUSTOM = 2000;

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
    const hargaDasar = HARGA_DASAR[order.template_id] || 5000;
    const amount = hargaDasar + (order.want_custom_qr ? HARGA_ADDON_CUSTOM : 0);

    const midtransEndpoint = IS_PRODUCTION
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

    const authHeader = 'Basic ' + Buffer.from(MIDTRANS_SERVER_KEY + ':').toString('base64');

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const site = `${proto}://${req.headers.host}`;
    const itemDetails = [
      {
        id: order.template_id,
        price: hargaDasar,
        quantity: 1,
        name: 'Kado Digital - ' + (order.template_id || 'custom')
      }
    ];
    if (order.want_custom_qr) {
      itemDetails.push({
        id: 'addon-custom-qr',
        price: HARGA_ADDON_CUSTOM,
        quantity: 1,
        name: 'Custom Link & QR'
      });
    }

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
        item_details: itemDetails,
        customer_details: {
          first_name: order.dari || 'Pembeli'
        },
        callbacks: {
          finish: `${site}/selesai.html?order_id=${order.id}`
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

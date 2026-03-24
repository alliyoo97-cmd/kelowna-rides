import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { bookingId, amount, customerName, pickup, dropoff, date, time, vehicle } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'cad',
            product_data: {
              name: `Ride: ${pickup} → ${dropoff}`,
              description: `${date} at ${time} · ${vehicle === 'discovery' ? 'Land Rover Discovery' : 'Tesla Model 3'} · Booking #${bookingId}`,
            },
            unit_amount: Math.round(amount * 100), // Stripe uses cents
          },
          quantity: 1,
        },
      ],
      metadata: {
        bookingId,
        customerName,
        pickup,
        dropoff,
      },
      success_url: `${req.headers.origin}/#confirmed?booking=${bookingId}&paid=true`,
      cancel_url: `${req.headers.origin}/#book?cancelled=true`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: err.message });
  }
}

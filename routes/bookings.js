const express = require('express');
const router = express.Router();
const { Resend } = require('resend');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Booking = require('../models/Booking');

router.post('/', async (req, res) => {
  const resend = new Resend(process.env.RESEND_API_KEY);

  console.log('Received booking request:', req.body);
  console.log('Owner email from env:', process.env.OWNER_EMAIL || 'Not set');

  try {
    const { firstName, lastName, email, startDate, endDate, adults, kids, total, arrivalTime, specialRequests, discountCode } = req.body;

    // Validate required fields
    if (!firstName?.trim() || !lastName?.trim()) {
      console.error('Missing firstName or lastName:', { firstName, lastName });
      return res.status(400).json({ error: 'First and last name are required' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.error('Invalid email provided:', email);
      return res.status(400).json({ error: 'Invalid email address provided' });
    }
    if (!startDate || !endDate) {
      console.error('Missing dates:', { startDate, endDate });
      return res.status(400).json({ error: 'Check-in and check-out dates are required' });
    }

    const guestName = `${firstName.trim()} ${lastName.trim()}`;
    const checkInDate = new Date(startDate);
    const checkOutDate = new Date(endDate);

    // Validate dates
    if (isNaN(checkInDate) || isNaN(checkOutDate) || checkInDate >= checkOutDate) {
      console.error('Invalid dates:', { checkInDate, checkOutDate });
      return res.status(400).json({ error: 'Invalid date range' });
    }

    let clientSecret = null;
    let paymentIntentId = null;

    // Create Stripe payment intent if total > 0 and not TESTFREE
    if (parseFloat(total) > 0 && discountCode !== 'TESTFREE') {
      console.log('Creating Stripe payment intent for total:', total, 'with email:', email);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(parseFloat(total) * 100),
        currency: 'aud',
        description: 'Villa Pura Bali Booking',
        receipt_email: email,
        metadata: { guestName, email, checkInDate: checkInDate.toISOString(), checkOutDate: checkOutDate.toISOString() }
      });
      clientSecret = paymentIntent.client_secret;
      paymentIntentId = paymentIntent.id;
    }

    // Save booking
    const booking = new Booking({
      guestName,
      email,
      checkInDate,
      checkOutDate,
      adults: parseInt(adults) || 1,
      kids: parseInt(kids) || 0,
      total: parseFloat(total) || 0,
      arrivalTime: arrivalTime || '',
      specialRequests: specialRequests || '',
      paymentStatus: parseFloat(total) > 0 && discountCode !== 'TESTFREE' ? 'pending' : 'completed',
      paymentIntentId,
      discountCode: discountCode || ''
    });

    console.log('Saving booking:', booking);
    const savedBooking = await booking.save();

    // Send confirmation emails
    console.log('Sending emails to guest:', email, 'and owner:', process.env.OWNER_EMAIL);
    try {
      // Guest email
      const guestEmailResponse = await resend.emails.send({
        from: 'Villa Pura <no-reply@villapurabali.com>',
        to: email,
        subject: 'Booking Confirmation - Villa Pura Bali',
        html: `
          <h1>Booking Confirmed!</h1>
          <p>Thank you, ${guestName}, for booking with Villa Pura Bali.</p>
          <p><strong>Booking ID:</strong> ${savedBooking._id}</p>
          <p><strong>Check-in:</strong> ${checkInDate.toLocaleDateString('en-ID', { timeZone: 'Asia/Makassar' })} at 2:00 PM</p>
          <p><strong>Check-out:</strong> ${checkOutDate.toLocaleDateString('en-ID', { timeZone: 'Asia/Makassar' })} at 11:00 AM</p>
          <p><strong>Guests:</strong> ${adults} adults, ${kids || 0} kids</p>
          <p><strong>Total:</strong> AUD $${parseFloat(total || 0).toFixed(2)}</p>
          <p><strong>Arrival Time:</strong> ${arrivalTime || 'Not specified'}</p>
          <p><strong>Special Requests:</strong> ${specialRequests || 'None'}</p>
          <p><strong>Discount Code:</strong> ${discountCode || 'None'}</p>
          <p>We look forward to welcoming you!</p>
        `
      });
      console.log('Guest email sent:', guestEmailResponse);

      // Owner email
      if (!process.env.OWNER_EMAIL) {
        console.error('Owner email not configured in .env');
      } else {
        const ownerEmailResponse = await resend.emails.send({
          from: 'Villa Pura <no-reply@villapurabali.com>',
          to: process.env.OWNER_EMAIL,
          subject: 'New Booking Notification - Villa Pura Bali',
          html: `
            <h1>New Booking Received</h1>
            <p>A new booking has been made for Villa Pura Bali.</p>
            <p><strong>Booking ID:</strong> ${savedBooking._id}</p>
            <p><strong>Guest:</strong> ${guestName}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Check-in:</strong> ${checkInDate.toLocaleDateString('en-ID', { timeZone: 'Asia/Makassar' })} at 2:00 PM</p>
            <p><strong>Check-out:</strong> ${checkOutDate.toLocaleDateString('en-ID', { timeZone: 'Asia/Makassar' })} at 11:00 AM</p>
            <p><strong>Guests:</strong> ${adults} adults, ${kids || 0} kids</p>
            <p><strong>Total:</strong> AUD $${parseFloat(total || 0).toFixed(2)}</p>
            <p><strong>Arrival Time:</strong> ${arrivalTime || 'Not specified'}</p>
            <p><strong>Special Requests:</strong> ${specialRequests || 'None'}</p>
            <p><strong>Discount Code:</strong> ${discountCode || 'None'}</p>
          `
        });
        console.log('Owner email sent:', ownerEmailResponse);
      }
    } catch (emailError) {
      console.error('Email sending failed:', emailError.message, emailError.stack);
      // Continue without failing the booking
    }

    console.log(`iCal update needed: Block dates from ${checkInDate.toLocaleDateString('en-ID', { timeZone: 'Asia/Makassar' })} to ${checkOutDate.toLocaleDateString('en-ID', { timeZone: 'Asia/Makassar' })} for booking ID ${savedBooking._id}`);

    res.status(200).json({
      clientSecret,
      bookingId: savedBooking._id,
      paymentIntentId
    });
  } catch (error) {
    console.error('Booking error:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to create booking', details: error.message });
  }
});

router.post('/confirm-payment', async (req, res) => {
  try {
    const { paymentIntentId, bookingId } = req.body;
    if (!paymentIntentId || !bookingId) {
      console.error('Missing required fields:', { paymentIntentId, bookingId });
      return res.status(400).json({ error: 'PaymentIntent ID and Booking ID are required' });
    }

    // Validate booking exists
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      console.error(`Booking not found for ID: ${bookingId}`);
      return res.status(404).json({ error: 'Booking not found' });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status === 'succeeded') {
      booking.paymentStatus = 'succeeded';
      await booking.save();
      console.log(`Payment confirmed for booking ID: ${bookingId}, PaymentIntent: ${paymentIntentId}`);
      res.status(200).json({ status: 'succeeded' });
    } else {
      console.error(`Payment not succeeded for PaymentIntent ${paymentIntentId}: ${paymentIntent.status}`);
      res.status(400).json({ error: `Payment not succeeded: ${paymentIntent.status}` });
    }
  } catch (err) {
    console.error('Confirm payment error:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to confirm payment', details: err.message });
  }
});

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message, err.stack);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    try {
      const updatedBooking = await Booking.findOneAndUpdate(
        { paymentIntentId: paymentIntent.id },
        { paymentStatus: 'succeeded' },
        { new: true }
      );
      if (updatedBooking) {
        console.log(`Webhook: Updated paymentStatus to succeeded for booking ID ${updatedBooking._id}`);
      } else {
        console.warn(`Webhook: No booking found for PaymentIntent ${paymentIntent.id}`);
      }
    } catch (err) {
      console.error('Webhook booking update error:', err.message, err.stack);
    }
  }

  res.json({ received: true });
});

module.exports = router;
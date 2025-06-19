require('dotenv').config({ path: './.env' });
const express = require('express');
const cors = require('cors');
const ical = require('node-ical');
const path = require('path');
const mongoose = require('mongoose');
const bookingRoutes = require('./routes/bookings');
const cron = require('node-cron');

const app = express();

// Debug environment variables
console.log('Environment variables loaded:');
console.log('PORT:', process.env.PORT || 'Missing');
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Set' : 'Missing');
console.log('RESEND_API_KEY:', process.env.RESEND_API_KEY ? 'Set' : 'Missing');
console.log('SITE_URL:', process.env.SITE_URL || 'Missing');
console.log('ICAL_URL:', process.env.ICAL_URL || 'Missing');
console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? 'Set' : 'Missing');
console.log('OWNER_EMAIL:', process.env.OWNER_EMAIL || 'Missing');

app.use(cors({
  origin: ['https://villapurabali.com', 'http://localhost:5173'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB connection with retry
const connectWithRetry = () => {
  mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 10
  })
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => {
      console.error('MongoDB connection error:', err.message);
      setTimeout(connectWithRetry, 5000);
    });
};
connectWithRetry();

app.use('/api/bookings', (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`, req.body);
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] Response: ${res.statusCode}`);
  });
  next();
});

app.use('/api/bookings', bookingRoutes);

let cachedBlockedDates = [];

app.get('/api/blocked-dates', async (req, res) => {
  try {
    const icalUrl = process.env.ICAL_URL;
    const events = await ical.async.fromURL(icalUrl);
    const blockedDates = Object.values(events)
      .filter((event) => event.type === 'VEVENT')
      .map((event) => {
        const start = new Date(event.start);
        start.setHours(start.getHours() + 8);
        start.setHours(0, 0, 0, 0);
        const end = new Date(event.end);
        end.setHours(end.getHours() + 8);
        end.setHours(0, 0, 0, 0);
        return { start, end };
      });
    cachedBlockedDates = blockedDates;
    console.log('Sending blocked dates:', blockedDates.map(d => ({
      start: d.start.toLocaleDateString('en-ID', { timeZone: 'Asia/Makassar' }),
      end: d.end.toLocaleDateString('en-ID', { timeZone: 'Asia/Makassar' })
    })));
    res.json(blockedDates);
  } catch (error) {
    console.error('Error fetching iCal:', error.message);
    res.status(500).json(cachedBlockedDates || []);
  }
});

cron.schedule('0 */30 * * * *', async () => {
  try {
    const icalUrl = process.env.ICAL_URL;
    const events = await ical.async.fromURL(icalUrl);
    cachedBlockedDates = Object.values(events)
      .filter((event) => event.type == 'VEVENT')
      .map((event) => {
        const start = new Date(event.start);
        start.setHours(start.getHours() + 8);
        start.setHours(0, 0, 0, 0);
        const end = new Date(event.end);
        end.setHours(end.getHours() + 8);
        end.setHours(0, 0, 0, 0);
        return { start, end };
      });
    console.log('iCal cache updated:', cachedBlockedDates.map(d => ({
      start: d.start.toLocaleDateString('en-ID', { timeZone: 'Asia/Makassar' }),
      end: d.end.toLocaleDateString('en-ID', { timeZone: 'Asia/Makassar' })
    })));
  } catch (error) {
    console.error('Error syncing iCal:', error.message);
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
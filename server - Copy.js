const express = require('express');
const cors = require('cors');
const ical = require('node-ical');
const path = require('path');
const fileUpload = require('express-fileupload');
const mongoose = require('mongoose');
const bookingRoutes = require('./routes/bookings');
const paymentRoutes = require('./routes/payments');
const cron = require('node-cron');

const app = express();

// Middleware
app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use(fileUpload());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);

let cachedBlockedDates = [];

app.get('/api/blocked-dates', async (req, res) => {
  try {
    const icalUrl = process.env.ICAL_URL;
    const events = await ical.async.fromURL(icalUrl);
    const blockedDates = Object.values(events)
      .filter((event) => event.type === 'VEVENT')
      .map((event) => {
        // Normalize to midnight WITA (UTC+8)
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
      .filter((event) => event.type === 'VEVENT')
      .map((event) => {
        // Normalize to midnight WITA (UTC+8)
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
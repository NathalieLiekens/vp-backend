const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  guestName: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email'],
  },
  checkInDate: {
    type: Date,
    required: true,
  },
  checkOutDate: {
    type: Date,
    required: true,
  },
  adults: {
    type: Number,
    required: true,
    min: 1,
    max: 8,
  },
  kids: {
    type: Number,
    default: 0,
    min: 0,
    max: 4,
  },
  total: {
    type: Number,
    required: true,
    min: 0,
  },
  arrivalTime: {
    type: String,
    trim: true,
  },
  specialRequests: {
    type: String,
    trim: true,
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'succeeded'],
    default: 'pending',
  },
  paymentIntentId: {
    type: String,
    trim: true,
  },
  discountCode: {
    type: String,
    trim: true,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Booking', bookingSchema);
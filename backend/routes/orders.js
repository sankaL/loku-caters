const express = require('express');
const router = express.Router();
const emailService = require('../services/emailService');

// POST /api/orders
// Handle new pre-orders
router.post('/', async (req, res) => {
    try {
        const {
            name,
            quantity,
            pickupLocation,
            pickupTimeSlot,
            phoneNumber,
            email
        } = req.body;

        // Basic validation
        if (!name || !quantity || !pickupLocation || !pickupTimeSlot || !phoneNumber || !email) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }

        // In a real app, save to Database here.

        // Calculate total price based on quantity (assuming $15 per unit for example)
        const UNIT_PRICE = 15;
        const total = quantity * UNIT_PRICE;

        // Create the confirmation details
        const orderDetails = {
            name,
            quantity,
            pickupLocation,
            pickupTimeSlot,
            phoneNumber,
            email,
            total
        };

        // Simulate sending an email
        await emailService.sendConfirmationEmail(orderDetails);

        return res.status(201).json({
            success: true,
            message: 'Order created successfully.',
            orderDetails
        });

    } catch (error) {
        console.error('Error processing order:', error);
        return res.status(500).json({ success: false, message: 'Server error processing order.' });
    }
});

module.exports = router;

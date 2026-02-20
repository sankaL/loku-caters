/**
 * Mock Email Service
 * Logs the confirmation message to the console to simulate sending an email.
 */

const sendConfirmationEmail = async (orderDetails) => {
    const { name, email, quantity, pickupLocation, pickupTimeSlot, total } = orderDetails;

    const emailBody = `
=============================================
EMAIL SIMULATION
To: ${email}
Subject: Loku Caters - Order Confirmation!
=============================================

Hi ${name},

Thank you for your business! We are looking forward to serving you.
Your pre-order for ${quantity} order(s) of Lamprais has been received.

Order Total: $${total}

Please arrive to pick up your order:
Location: ${pickupLocation}
Time: ${pickupTimeSlot}

We will be cooking up an authentic Sri Lankan dish on our specific date and we are so glad you'll be joining us!

See you soon,
Loku Caters

=============================================
`;

    console.log(emailBody);

    // Simulate delay
    return new Promise(resolve => setTimeout(resolve, 1000));
};

module.exports = {
    sendConfirmationEmail
};

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const orderRoutes = require('./routes/orders');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/orders', orderRoutes);

app.get('/', (req, res) => {
    res.send('Loku Caters API is running.');
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

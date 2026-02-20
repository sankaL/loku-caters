"use client";

import { useState } from 'react';
import Image from 'next/image';
import styles from './page.module.css';

const LOCATIONS = [
  { id: 'colombo-03', name: 'Kollupitiya (Colombo 03)' },
  { id: 'mount-lavinia', name: 'Mount Lavinia' },
];

const TIME_SLOTS: Record<string, string[]> = {
  'colombo-03': ['11:30 AM - 12:30 PM', '12:30 PM - 01:30 PM', '01:30 PM - 02:30 PM'],
  'mount-lavinia': ['12:00 PM - 01:00 PM', '01:00 PM - 02:00 PM', '02:00 PM - 03:00 PM', '06:00 PM - 07:00 PM'],
};

const UNIT_PRICE = 15;

export default function Home() {
  const [formState, setFormState] = useState({
    name: '',
    phoneNumber: '',
    email: '',
    pickupLocation: '',
    pickupTimeSlot: '',
  });
  const [quantity, setQuantity] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<any>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormState(prev => {
      const newState = { ...prev, [name]: value };
      // Reset time slot if location changes
      if (name === 'pickupLocation') {
        newState.pickupTimeSlot = '';
      }
      return newState;
    });
    setErrorStatus(null);
  };

  const incrementQty = () => setQuantity(prev => (prev < 20 ? prev + 1 : prev));
  const decrementQty = () => setQuantity(prev => (prev > 1 ? prev - 1 : prev));

  const total = quantity * UNIT_PRICE;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.name || !formState.phoneNumber || !formState.email || !formState.pickupLocation || !formState.pickupTimeSlot) {
      setErrorStatus("Please fill out all fields.");
      return;
    }

    setIsSubmitting(true);
    setErrorStatus(null);

    try {
      // Assuming Express is running on localhost:5001
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
      const response = await fetch(`${API_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formState, quantity })
      });

      const data = await response.json();

      if (data.success) {
        setSuccessData(data.orderDetails);
      } else {
        setErrorStatus(data.message || 'Something went wrong.');
      }
    } catch (err) {
      setErrorStatus('Failed to submit order. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className={styles.pageContainer}>
      {/* Header */}
      <header className={styles.header}>
        {/* We use the logo-light since the hero area is dark */}
        <Image src="/logo-light.svg" alt="Loku Caters Logo" width={140} height={60} className={styles.logo} />
      </header>

      {/* Hero Section */}
      <section className={styles.hero}>
        <Image
          src="/hero-image.png"
          alt="Authentic Lamprais"
          fill
          priority
          className={styles.heroImage}
        />
        <div className={styles.heroOverlay} />
        <div className={styles.heroContent}>
          <span className={styles.pill}>A Cultural Feast</span>
          <h1 className={styles.title}>The Authentic Lamprais</h1>
          <p className={styles.subtitle}>
            We are cooking up an authentic Sri Lankan Lamprais on Saturday, October 28th. Experience a perfectly balanced union of rice, meat, and sambols, authentically wrapped in a banana leaf.
          </p>
        </div>
      </section>

      {/* Form Section */}
      <section id="order-form" className={styles.formSection}>
        <div className={`${styles.formCard} ${styles.glass}`}>

          {successData ? (
            <div className={styles.successView}>
              <div className={styles.successIcon}>✓</div>
              <h2 className={styles.successTitle}>Order Confirmed!</h2>
              <p className={styles.successText}>
                Thank you for your business, {successData.name}! We're looking forward to serving you. We've sent a confirmation email to {successData.email}.
              </p>

              <div className={styles.successDetails}>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Quantity</span>
                  <span className={styles.detailValue}>{successData.quantity}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Total Paid</span>
                  <span className={styles.detailValue}>${successData.total.toFixed(2)}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Pickup Location</span>
                  <span className={styles.detailValue}>
                    {LOCATIONS.find(l => l.id === successData.pickupLocation)?.name || successData.pickupLocation}
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Pickup Time</span>
                  <span className={styles.detailValue}>{successData.pickupTimeSlot}</span>
                </div>
              </div>

              <p className={styles.successText} style={{ marginTop: '2rem', marginBottom: 0 }}>
                Please arrive at the location during your specified time slot. See you soon!
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className={styles.formHeader}>
                <h2>Pre-Order Now</h2>
                <p>Reserve your portion before we run out.</p>
              </div>

              <div className={styles.inputGroup}>
                <label>Full Name</label>
                <input
                  type="text"
                  name="name"
                  value={formState.name}
                  onChange={handleInputChange}
                  className={styles.inputField}
                  placeholder="John Doe"
                  required
                />
              </div>

              <div className={styles.inputGroup}>
                <label>Email Address</label>
                <input
                  type="email"
                  name="email"
                  value={formState.email}
                  onChange={handleInputChange}
                  className={styles.inputField}
                  placeholder="john@example.com"
                  required
                />
              </div>

              <div className={styles.inputGroup}>
                <label>Phone Number</label>
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formState.phoneNumber}
                  onChange={handleInputChange}
                  className={styles.inputField}
                  placeholder="(555) 123-4567"
                  required
                />
              </div>

              <div className={styles.inputGroup}>
                <label>Quantity</label>
                <div className={styles.quantityControl}>
                  <button type="button" className={styles.qtyButton} onClick={decrementQty} disabled={quantity <= 1}>−</button>
                  <span className={styles.qtyValue}>{quantity}</span>
                  <button type="button" className={styles.qtyButton} onClick={incrementQty}>+</button>
                </div>
              </div>

              <div className={styles.inputGroup}>
                <label>Pickup Location</label>
                <select
                  name="pickupLocation"
                  value={formState.pickupLocation}
                  onChange={handleInputChange}
                  className={styles.inputField}
                  required
                >
                  <option value="" disabled>Select a location...</option>
                  {LOCATIONS.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>

              {formState.pickupLocation && (
                <div className={styles.inputGroup}>
                  <label>Pickup Time Slot</label>
                  <select
                    name="pickupTimeSlot"
                    value={formState.pickupTimeSlot}
                    onChange={handleInputChange}
                    className={styles.inputField}
                    required
                  >
                    <option value="" disabled>Select a time...</option>
                    {TIME_SLOTS[formState.pickupLocation]?.map(time => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className={styles.orderSummary}>
                <span className={styles.totalLabel}>Order Total</span>
                <span className={styles.totalPrice}>${total.toFixed(2)}</span>
              </div>

              {errorStatus && <p className={styles.errorText}>{errorStatus}</p>}

              <button
                type="submit"
                className={styles.submitButton}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Processing...' : 'Place Pre-Order'}
              </button>
            </form>
          )}

        </div>
      </section>
    </main>
  );
}

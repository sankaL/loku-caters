class OrderStatus:
    PENDING = "pending"        # Order submitted, awaiting confirmation
    CONFIRMED = "confirmed"    # Confirmed by admin (email may be skipped/excluded)
    REMINDED = "reminded"      # Pickup reminder sent to customer
    PAID = "paid"              # Payment received
    PICKED_UP = "picked_up"    # Customer collected the order
    NO_SHOW = "no_show"        # Customer did not pick up
    CANCELLED = "cancelled"    # Order cancelled

    ALL = [PENDING, CONFIRMED, REMINDED, PAID, PICKED_UP, NO_SHOW, CANCELLED]

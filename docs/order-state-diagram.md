# Order Status State Diagram

The diagram below illustrates the lifecycle of an order in the Loku Caters application, highlighting the primary status transitions and how the `reminded` flag integrates into the flow.

```mermaid
stateDiagram-v2
    direction TB

    [*] --> PENDING : Customer Submits Order
    
    state PENDING {
        [*] --> Unconfirmed
    }

    PENDING --> CONFIRMED : Admin Confirms Order
    note right of CONFIRMED
        Confirmation email sent
        (unless exclude_email=true)
    end note

    CONFIRMED --> REMINDED : Bulk Remind Sent (Admin Tool)
    note right of REMINDED
        reminded = true
        (Only CONFIRMED orders can be reminded)
    end note

    CONFIRMED --> PICKED_UP : Order Collected
    REMINDED --> PICKED_UP : Order Collected
    
    CONFIRMED --> NO_SHOW : Failed to pick up
    REMINDED --> NO_SHOW : Failed to pick up

    state CancelledOrDeleted {
        CANCELLED
        DELETED
    }

    PENDING --> CANCELLED : Admin Cancels
    CONFIRMED --> CANCELLED : Admin Cancels
    REMINDED --> CANCELLED : Admin Cancels
    PICKED_UP --> CANCELLED : Admin Cancels
    NO_SHOW --> CANCELLED : Admin Cancels

    PICKED_UP --> NO_SHOW : Correction
    NO_SHOW --> PICKED_UP : Correction

    CANCELLED --> PICKED_UP : Restore
    CANCELLED --> NO_SHOW : Restore
    
    ANY --> DELETED : Admin Deletes
```

## Status Definitions

| Status | Description |
| :--- | :--- |
| **PENDING** | Initial state. The order has been submitted by the customer but not yet reviewed or confirmed by an admin. |
| **CONFIRMED** | The admin has confirmed the order. This is the stage where the `reminded` flag can be applied. |
| **PICKED_UP** | The final success state. The customer has collected their items. |
| **NO_SHOW** | The customer did not collect their order during their pickup window. |
| **CANCELLED** | The order was cancelled by an admin (or potentially by the system if unpaid/untouched). |

## Integration of the "Reminded" Status

The `reminded` status is a boolean flag (`reminded=true`) that ties into the workflow as a post-confirmation milestone:
- **Prerequisite**: An order must be in the `CONFIRMED` status to receive a reminder. 
- **Trigger**: Sent via the "Bulk Remind" tool in the admin dashboard.
- **Purpose**: Typically used to remind confirmed customers to complete payment (e.g., via e-transfer) or prepare for pickup.
- **Persistence**: Once an order is reminded, it proceeds through the rest of the flow while retaining the flag, allowing admins to track which customers were prompted.

## Payment Tracking (Paid Flag)

Payment is tracked separately from `orders.status`:
- `paid` is a boolean flag that can be toggled by admins without changing `status`.
- When setting `paid=true`, admins must also set a `payment_method` (and optional details for `other`).
- When setting `paid=false`, `payment_method` and `payment_method_other` are cleared.
- Admins can only mark an order as paid once it is no longer `PENDING` (confirm first).

```mermaid
stateDiagram-v2
    direction TB

    [*] --> UNPAID
    UNPAID --> PAID : Admin sets paid=true\n(status != pending)
    PAID --> UNPAID : Admin sets paid=false\n(clears method)
```

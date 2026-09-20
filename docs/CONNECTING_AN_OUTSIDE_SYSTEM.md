# The ClearView API

For the developer of a point of sale, clinic, shop, accounting or reporting
system that needs to exchange figures with a ClearView workspace.

Everything is under `https://clearview.habibonifade.com/api/v1/`.

---

## 1. What you can do

| | |
|---|---|
| `POST /api/v1/catalogue` | **Send your price list. ClearView builds its catalogue from it.** |
| `GET /api/v1/model` | Read the business: its price list, its cost headings, its currency. |
| `POST /api/v1/sales` | Send sales, as they happen. |
| `POST /api/v1/costs` | Send costs, as they happen. |
| `POST /api/v1/actuals` | Send a whole month's totals at once. |
| `POST /api/v1/payments` | Send payments a channel has confirmed. |
| `GET /api/v1/results` | Read the worked-out figures and how well evidenced they are. |

A business that rings every sale through a till uses `sales` and `costs`. A
business whose bookkeeper closes a month uses `actuals`. Both end up in the
same figures, so pick whichever matches how the business actually works. You
do not need both.

---

## 2. Your key

The coach issues it from the workspace, under **Settings**, then **Connected
Systems**, then **New key**. It looks like this:

```
cv_live_XnT4b2QqL8vK3mZpR7wY1cF6hJ0sD9gA5eU2iO4tN8x
```

**It is shown once and is never stored.** Not by us, not anywhere. If it is
lost it cannot be looked up; the coach withdraws it and issues another.

Send it every time, in a header:

```
Authorization: Bearer cv_live_...
```

Never in the URL. A key in a URL is written into every server log, proxy log
and browser history it passes through, and that is how keys leak in practice.
Requests that put it there are refused.

### What a key can and cannot reach

- It writes to **one business unit** of **one business**, both fixed when the
  key is made. Naming a different one in a request does nothing. There is no
  way to reach a second business.
- It does only what the coach ticked. Ask for a permission you do not have and
  you get `403` naming the permission you would need.
- It can carry an expiry date, and can be withdrawn at any moment. Either way
  you get `401` with `key_expired` or `key_revoked`, which is your signal to
  ask for a new one rather than to retry.
- 120 calls a minute. Beyond that, `429` with a `Retry-After` header. Send
  fewer, larger batches rather than one call per sale.

### Keeping it safe

Hold it on your server. Not in a phone app, not in a browser page, not in a
public code repository. Anyone holding it can write into that business's
figures.

---

## 3. Start here: send your price list

**There is no mapping step.** Do not pair your products with ours by hand.
Send us your product list and we build the catalogue from it, keeping your own
product code against each item. After that, sales arrive under your codes.

```
POST /api/v1/catalogue
Authorization: Bearer cv_live_...
Content-Type: application/json

[
  { "sku": "VET-0091", "name": "Deworming dose", "price": 5000, "unit": "dose" },
  { "sku": "VET-0104", "name": "Consultation",   "price": 15000, "type": "service" }
]
```

**Send whatever your system exports.** Column names are matched by meaning, not
by spelling:

| We need | Any of these will do |
|---|---|
| The product code | `sku`, `code`, `id`, `item_code`, `product_code`, `item_number`, `product_id`, `barcode`, `ref` |
| The name | `name`, `product_name`, `item_name`, `description`, `title` |
| The price | `price`, `unit_price`, `selling_price`, `sale_price`, `rate` |
| What it cost you | `cost_price`, `cost`, `buying_price`, `purchase_price` |
| The unit | `unit`, `uom`, `unit_of_measure`, `pack_size` |

Capitals, spaces, hyphens and underscores are all ignored, so `Item Code`,
`item_code` and `itemcode` are the same column. A list wrapped as
`{"items": [...]}`, `{"products": [...]}` or `{"data": [...]}` is read too.
Prices written as `"1,500"` or `"UGX 1500"` are read correctly.

If your export has no code column at all, the product name is used as the code.

### Send the whole list every time

It is worked out as a difference:

- A product we have not seen is **created**.
- A price that changed is **updated**.
- A product you stop sending is **switched off**, never deleted, so its sales
  history stays readable and one bad export does not lose anything.
- A product whose price we could not read is created but **cannot be sold**
  until somebody in the workspace prices it. Better a visible gap than a
  product quietly selling for nothing.
- A product a coach has filed under a particular revenue line **stays there**.
  Imports update its price and leave the filing alone.

```json
{ "read": 412, "created": 9, "updated": 31, "switched_off": 2,
  "unchanged": 370, "needing_a_price": 1, "problems": [] }
```

### Or let ClearView come and get it

If your product list is readable at a fixed https address, you do not need to
send anything at all. The coach records the address once, under **Settings**,
**Connected Systems**, and ClearView reads it every night.

If your system is not on the internet, a coach can export the list and paste it
into the same screen. Same rules, same result.

---

## 3a. Reading the business

```
GET /api/v1/model
Authorization: Bearer cv_live_...
```

Returns the business unit, the currency, the catalogue as ClearView now holds
it, the revenue lines and the cost headings. Useful for checking what an import
produced, and for finding the `id` of a cost heading.

---

## 4. Sending sales

```
POST /api/v1/sales
Authorization: Bearer cv_live_...
Content-Type: application/json

{ "sales": [
  {
    "external_ref": "till-1-000482",
    "external_item_id": "VET-0091",
    "quantity": 3,
    "occurred_at": "2026-09-20T09:14:22Z",
    "payment_method": "cash"
  }
] }
```

`external_item_id` is **your own product code**, the one you sent in your price
list. You never need to know ClearView's ids. (ClearView's own
`catalogue_item_id` is still accepted, for anything already built on it.)

**You do not send a price or a total.** ClearView takes the price from its own
price list and works the amount out. If the sale genuinely went out at another
price, send `unit_price` and it is recorded as a deliberate override; more than
ten per cent off the list price is flagged to the coach.

If the item carries a cost price, the cost of what was sold is booked
alongside automatically, at the standard cost, never at whatever it sold for.

`payment_method` must be `cash`, `credit`, `mobile_money` or `bank`, or left
out.

`external_ref` is your own reference. Send the same one twice and it books
once, so a retry after a timeout is always safe. **Always send it.**

Up to 500 sales in one call.

### Costs

Same shape, at `POST /api/v1/costs`:

```json
{ "costs": [
  { "external_ref": "exp-2291", "cost_line_id": "cost_3", "amount": 45000, "date": "2026-09-20" }
] }
```

You send the amount for a cost. You never send the heading it files under:
that is read off the cost line itself, so a guess cannot put money under the
wrong heading.

### What comes back

```json
{
  "accepted": 2,
  "duplicates": 1,
  "parked": 1,
  "accepted_refs": ["till-1-000482", "till-1-000483"],
  "parked_items": [
    { "external_ref": "till-1-000484",
      "reason": "The product \"VET-0199\" is not in this business unit's price list, or has been switched off. If it is new, send the price list again and it will be added." }
  ]
}
```

- **Clear an item from your own queue when its reference is in
  `accepted_refs`**, not when the call returns 200. A call can succeed while
  one line inside it did not.
- `duplicates` means those were already here. That is normal after a retry and
  is not an error.
- **`parked` items are not lost.** Anything we cannot file is held with the
  reason, and appears on the coach's screen waiting to be sorted out. You do
  not need to resend a parked item, and resending it parks it only once.

---

## 5. Sending a month instead

For a business whose bookkeeper closes a month rather than a till that rings
every sale.

```
POST /api/v1/actuals

{ "month": "2026-03",
  "lines": [ { "line_id": "rev_1", "amount": 4200000 },
             { "line_id": "cost_3", "amount": 380000 } ] }
```

The month may be written as `2026-03` or as any date inside it.

**Sending the same month again corrects it.** A restated month replaces itself
rather than adding to itself, because a bookkeeper finding a late invoice is
normal. A line you leave out of the second send keeps its earlier figure, so
send the whole month each time. The answer lists every line it wrote.

---

## 6. Sending payments

```
POST /api/v1/payments

{ "payments": [
  { "external_ref": "MP240920.1431.A82910",
    "channel": "mtn_momo",
    "amount": 15000,
    "occurred_at": "2026-09-20T09:15:01Z" }
] }
```

`external_ref` must be the **channel's own reference** for that payment. It is
the only way to tell one payment apart from a second one for the same amount,
and it is what makes a retry safe.

Two things to be clear about:

- **Nothing is matched automatically.** Each payment waits in the business's
  own payment review screen for a person to pair it with a sale. It counts as
  verified revenue only once somebody does.
- **A payment sent here is recorded as self reported.** A payment ClearView
  receives directly from a provider is evidence from a third party; one sent
  through this API is a claim by whoever holds the key. Both are stored, and
  they are always distinguishable afterwards. That distinction is the whole
  point of the platform and it is not blurred.

---

## 7. Reading the figures

```
GET /api/v1/results
```

Returns every month with revenue, gross profit, EBITDA and closing cash, a flag
saying whether that month is actual or still planned, and:

```json
"evidence": {
  "declared_revenue": 52000000,
  "verified_revenue": 28600000,
  "verified_share": 0.55,
  "unattributed_inbound": 3100000,
  "of_which_self_reported": 900000
}
```

Verified revenue counts **only** payments paired with a recorded sale. Money
received but not yet paired is reported separately and is never quietly added.
It is the number that tempts everyone, and counting it as verified would turn
the verified share from a measurement into a claim.

Nothing here is recalculated for the API. It runs the same engine the workspace
runs, on the same stored figures, so a number read here and the same number on
screen cannot disagree.

---

## 8. Errors

Every refusal has the same shape:

```json
{ "error": "forbidden", "detail": "This key is not allowed to do that. It would need the \"sales.write\" permission, which is granted by the coach when the key is created." }
```

| Status | Meaning | What to do |
|---|---|---|
| `400` | The body was not the shape expected | Read `detail`; it says the shape. |
| `401` | No key, or the key is withdrawn or expired | Ask the coach for a new key. Do not retry. |
| `403` | The key lacks that permission | Ask the coach to add it. Do not retry. |
| `409` | The business has no financial model, or its unit is switched off | Nothing you can fix. Tell the coach. |
| `413` | More than 500 items in one call | Send smaller batches. |
| `429` | More than 120 calls a minute | Wait for `Retry-After` seconds. |
| `500` | Something failed at our end | Nothing was stored. Retry safely. |

A `500` from a write means nothing was saved, so a retry cannot double-book.
Together with `external_ref`, that makes every write in this API safe to repeat.

---

## 9. What is not here yet

- **Nothing is pushed to you.** You read when you want to; we do not call you.
- **Only this business's own figures.** There is no portfolio-wide read.
- **The coaching record is not exposed.** Decisions, gates and canvas work are
  not readable through the API.

# Connecting an outside system to ClearView

For the developer of a point of sale, clinic, shop or accounting system that
needs its sales and costs to appear in a ClearView workspace.

Everything described here is live today. Nothing in this document requires a
new release.

---

## 1. What this interface does

An outside system sends each sale, or each cost, to ClearView as it happens.
The figures land in the same place the ClearView mobile app puts them, so they
appear in the workspace, in the month's actuals and in every report, without
anybody retyping them.

It is a one way interface. Your system tells ClearView what happened. ClearView
does not reach into your system.

---

## 2. Before you start

The business must already have a financial model set up in its ClearView
workspace, with at least one business unit, at least one revenue line, and a
priced catalogue of the things it sells. Without a catalogue there is nothing
for a sale to point at.

The coach issues an access link from the workspace, under
**Settings, Field Operators, New Operator**. The link looks like this:

```
https://clearview.habibonifade.com/field?token=<TOKEN>
```

The part after `token=` is your key. It is tied to **one business unit**. If the
business records sales under more than one unit, ask for one key per unit.

The key can be withdrawn at any time from the same screen. There is no password
and no login.

### Keeping the key safe

Hold it on your server, not in a phone app, a browser page or a mobile app
bundle. Anyone holding the key can write sales into that business unit.

---

## 3. Step one: ask what you are allowed to write

```
POST https://clearview.habibonifade.com/api/field/auth
Content-Type: application/json

{ "token": "<TOKEN>" }
```

Comes back with the business unit you are writing to, the currency, and two
lists:

- `catalogue`: every product or service the business sells, each with an `id`,
  a `name`, a `price` and a `unit_label`. This is what a **sale** points at.
- `cost_lines`: the spending headings this unit files costs under, each with an
  `id` and a `name`. This is what a **cost** points at.

**Read this first and map it to your own product list.** ClearView will only
accept a sale that names one of these `id` values. Do this once, store the
mapping, and refresh it when the business adds a product.

A wrong or withdrawn key comes back `401`.

---

## 4. Step two: send a sale

```
POST https://clearview.habibonifade.com/api/field/sync
Content-Type: application/json

{
  "token": "<TOKEN>",
  "device_id": "clinic-till-1",
  "transactions": [
    {
      "local_id": "your-own-unique-id-for-this-sale",
      "catalogue_item_id": "<id from step one>",
      "quantity": 3,
      "transaction_date": "2026-09-20",
      "captured_at": "2026-09-20T09:14:22Z",
      "payment_method": "cash",
      "notes": "optional"
    }
  ]
}
```

Notes on the fields:

- **You never send a price or an amount.** ClearView takes the price from its
  own catalogue and works the amount out itself. This is deliberate: a price is
  set once, by somebody allowed to set it.
- If a sale genuinely went out at a different price, send `override_price`.
  ClearView records it and flags it to the coach if it is more than ten per cent
  off the standard price.
- If the product has a cost price in the catalogue, ClearView books the cost of
  that sale automatically. You do not send it.
- `local_id` is your own reference for that sale. Send the same `local_id`
  twice and the second one is ignored rather than booked again, so it is safe
  to retry after a timeout or a dropped connection. **Always send it.**
- `transaction_date` is the day the sale belongs to. `captured_at` is the exact
  moment it happened, and it is what lets ClearView match the sale against a
  payment record later.
- `payment_method` must be one of `cash`, `credit`, `mobile_money` or `bank`,
  or left out entirely.

You may send one sale or several hundred in one call.

### Sending a cost

Same call, same list, but name a cost line instead of a catalogue item, and
send the amount yourself. `transaction_type` must be `cost` or `expense`:

```json
{
  "local_id": "your-own-unique-id",
  "plan_line_id": "<id from cost_lines in step one>",
  "transaction_type": "expense",
  "amount": 45000,
  "transaction_date": "2026-09-20"
}
```

### What comes back

```json
{
  "success": true,
  "transactions_synced": 1,
  "synced_local_ids": ["your-own-unique-id-for-this-sale"],
  "errors": ["..."],
  "synced_at": "2026-09-20T09:14:25Z"
}
```

`synced_local_ids` is the list that actually landed. **Clear an entry from your
own queue only when its `local_id` appears there.** A call can succeed overall
while one line inside it was rejected, so do not treat `success: true` as
meaning every line went in.

---

## 5. Step three: check what landed

```
GET https://clearview.habibonifade.com/api/field/history?limit=50
Authorization: Bearer <TOKEN>
```

Returns the most recent entries written with this key, newest first. Useful for
a nightly reconciliation against your own records.

---

## 6. What gets rejected, and what to do about it

A line is rejected and named in `errors` when:

| Reason | What it means |
|---|---|
| Unknown or inactive catalogue item | The `catalogue_item_id` is not in this business unit's catalogue, or it has been switched off. Refresh your mapping from step one. |
| Missing a valid volume | `quantity` was absent, zero or negative. |
| Invalid override price | `override_price` was not a number, or was negative. |
| Cost line does not belong to this business unit | The `plan_line_id` belongs to another unit. |
| Period has been closed | The entries were saved, but the month they belong to has been closed by the business's Finance Manager. They will not appear in the summary figures until that month is reopened. |

A rejected line is **not** stored anywhere. Your system must keep it and retry
it once the cause is fixed, or the sale is lost. This is the one rough edge in
the interface as it stands today.

---

## 7. What this interface does not do yet

- **It cannot confirm that money arrived.** A sale sent here is a declared sale.
  ClearView holds a separate record of money confirmed by a payment provider,
  and there is no address for an outside system to post payment confirmations
  to. That is a separate piece of work.
- **It cannot read the business's reports back out.** It writes only.
- **There is no holding pen.** An unrecognised product is reported and dropped,
  rather than parked for somebody to file.

---

## 8. A note on what ClearView will never accept from outside

The key carries the business and the business unit. Neither is ever read from
the request. An outside system cannot write into another business's figures,
name a price that is not in the catalogue, or reach any part of the workspace
other than the unit its key belongs to. Every one of those is checked on the
server on every call.

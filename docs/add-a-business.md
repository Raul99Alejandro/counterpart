# Add your business in 15 minutes

Counterpart runs any business that takes an order, moves it through a few steps and charges for it: a repair shop, a bakery, a bike shop, a florist. A new business is data, not code. You can write it by hand as a **business package**, or say it out loud to the **setup assistant**.

## Option 1: a business package

A package is one folder under `seed/businesses/`. The folder name becomes the business id (lowercase letters, digits and dashes).

```
seed/businesses/bike-shop/
  business.yaml   # name, time zone, tax, first order number, and the profile
  catalog.yaml    # what you sell and what you stock
  demo.yaml       # optional: customers and open orders for a demo
```

### business.yaml

```yaml
name: Spoke and Chain Cycles
timezone: America/Denver      # an IANA time zone
taxRateBps: 790               # 7.90% in basis points
firstOrderNumber: 100
template: auto-repair         # reuse a built-in profile...
# profile: { ... }            # ...or write your own (see seed/businesses/bike-shop)
```

The profile is the vocabulary Alexa speaks: what you call an order and an item, the steps an order goes through (`stages`), which step means finished and paid (`closedStage`) and from which steps it can be closed (`closeFrom`), the nine tool names in your own words, an optional asset the customer brings in (a car, a bike) and the details every order records (`orderFields`). Built-in templates live in `src/profiles/`.

### catalog.yaml

```yaml
items:
  - { id: tune-up, name: Basic tune-up, kind: labor, unit: job, priceCents: 7500, taxable: false, stocked: false }
  - { id: tube-700c, name: 700c inner tube, synonyms: [tube], kind: part, priceCents: 900,
      stocked: true, onHand: 6, reorderPoint: 10, reorderQty: 30, supplierId: velo-supply }
  - { id: flat-fix, name: Flat fix, kind: labor, unit: job, priceCents: 1500, taxable: false,
      stocked: false, consumes: { tube-700c: 1 } }
```

- `kind`: `product` or `labor` for what customers buy; `part`, `supply` or `ingredient` for what you stock.
- `priceCents`: a whole number of cents (`4500` is $45.00).
- `stocked: true` items are counted; `reorderPoint` and `reorderQty` drive "reorder what's low".
- `consumes`: which stocked items one unit uses up. A flat fix uses one tube.

### demo.yaml (optional)

```yaml
customers:
  - name: Lena Park
    asset: { brand: Specialized, model: Allez }
    order: { stage: checked_in, lines: [tune-up] }
```

Every package also gets 30 days of sales history generated from its catalog, so the sales report has something to show.

### Check it, then add it

```bash
npm run business:check -- seed/businesses/bike-shop
COUNTERPART_STORE=dynamo npm run business:add -- seed/businesses/bike-shop --secret
```

`business:check` uses the same schemas as the server and names the exact field to fix, for example `catalog.yaml › items[3].priceCents: … write the price in cents as a whole number`. `business:add` seeds the business and issues its token; `--secret` stores the token in AWS Secrets Manager (`counterpart/<id>/token`) instead of printing it.

## Option 2: the setup assistant, by voice

Create an empty business and give it a token:

```bash
COUNTERPART_STORE=dynamo npm run business:new -- florist "Petal and Stem" --secret
```

A blank business exposes only three tools. Connect an Alexa bridge to it (see the README) and talk:

> "I run a flower shop. We take orders for bouquets and centerpieces, arrange them, and they're ready for pickup or delivery."
> "What did you come up with?"
> "Yes, turn it on."

Counterpart drafts a profile and a catalog with Amazon Nova 2 Lite, checks them with the same rules as a package, and turns nothing on until you say yes. The same conversation continues with the business's own nine tools.

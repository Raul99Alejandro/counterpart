# Counterpart tools by intent

Every active business has the same nine intents. The tool names come from its profile (`src/profiles/*.yaml`, `toolNames`), so a business set up by voice gets names in its own words.

| Intent | Auto repair | Bakery | Arguments |
|---|---|---|---|
| Day summary, with a screen | `get_shop_snapshot` | `get_bakery_snapshot` | — |
| Find orders | `find_work_orders` | `find_cake_orders` | `query` (the user's words), `stage`, `due` |
| Open an order | `open_work_order` | `take_cake_order` | `customerName`, `customerPhone`, `description`, business fields |
| Change stage | `move_work_order_stage` | `move_cake_order_stage` | `order` (as said), `stage` |
| Add to an order | `add_parts_or_labor` | `add_to_cake_order` | `order` (as said), `item`, `quantity` |
| Check stock | `check_parts_stock` | `check_ingredients` | `item` (optional: everything low) |
| Reorder | `reorder_parts` | `reorder_ingredients` | `item` (optional: everything low) |
| Close out and charge | `close_out_work_order` | `close_out_cake_order` | `order` (as said), `paymentMethod`: `cash`, `card` or `check` |
| Sales report, with a screen | `sales_report` | `sales_report` | `period`: `today`, `yesterday`, `this_week`, `last_week`, `this_month`, `last_month`; `compare` |

A blank business exposes only the setup tools:

| Tool | When | Arguments |
|---|---|---|
| `set_up_my_business` | The user describes the business. End the turn after it. | `description` (the user's words) |
| `review_business_setup` | The user asks what you came up with. Once per turn. | — |
| `activate_business_setup` | The user answered the summary, in a later turn. | `confirm`: true for yes, false for no |

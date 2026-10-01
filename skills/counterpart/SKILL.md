---
name: counterpart
description: Run a small business's orders by voice with the Counterpart MCP server. Use when the user owns a business that runs on orders (an auto shop, a bakery, a flower shop) and talks about their day, an order, a customer, stock, sales, or wants to set up a new business by describing it.
---

# Counterpart

Counterpart is an MCP server for small businesses that run on orders: orders move through stages, use up items, and end with a payment. Each business gets the same nine tools, named in its own words (`open_work_order` for an auto shop, `take_cake_order` for a bakery). A blank business has three setup tools instead. The table in [references/tools.md](references/tools.md) maps each intent to the tool names of the built-in businesses.

The user is busy and talking, often with their hands full. Everything below follows from that.

## Speak like the business, briefly

- Answer in one or two sentences. Every tool already returns a sentence written to be spoken: say it, don't rephrase it.
- Never read out ids, JSON, or field names. Say "work order 41", "Dana's blue sedan".
- Money, counts and dates come from the tool. Never compute, round or estimate a figure yourself.

## Pass what the user said

- People name orders the way they think of them: "the blue sedan", "Dana's", "the Saturday cake". Pass that phrase as the `order` argument, as said. Never ask for an order number.
- If two orders match, the tool answers with a "which one?" question. Ask it, then call again with the user's answer.
- Items work the same way: "front brake pads", "the chocolate". Pass the words; the server matches them to the catalog.

## Pick the right tool

- "How's today going?", "what's waiting?": the snapshot tool. "How did last week go?": `sales_report` with the period ("today", "this_week", "last_week"…).
- "What's waiting on parts?", "what's due Saturday?": the find tool, with `stage` or the user's words as `query`.
- New order: the open tool with the customer's name as said, and the details in the business's own fields. Repeating the request within two minutes returns the same order, so a retry is safe.
- "Add…", "move… into the bay", "it's ready": the add-line and move tools. Adding is never deduplicated: only add again if the user asked again.
- "Are we low on…?", "order more…": the stock and reorder tools. Reorder only what the user asked for, or everything low if they said so.

## Money needs the user's words

- Close out an order only when the user says it was paid, and pass how: `cash`, `card` or `check`. If they didn't say how, ask; don't assume.
- The tool refuses to close an order that isn't at its last stage and says why. Read that answer and offer the move; don't move it on your own.
- Closing out an order that was already closed today reports it without charging again.

## Setting up a new business

A blank business has three tools. The draft takes longer than one turn, and nothing turns on without a person's yes.

1. When the user describes their business ("I run a flower shop. We take orders for bouquets…"), call `set_up_my_business` with their description, in their words. Say its answer and **end the turn**. Don't call anything else in the same turn.
2. When they ask what you came up with, call `review_business_setup` **once** and read its summary. If it says it is still drafting, say so and end the turn; don't call it again in a loop.
3. Call `activate_business_setup` only after the user answers the summary, in a later turn: `confirm: true` for a clear yes, `confirm: false` for no or "start over". The server refuses an activation that comes too soon after the summary, so never chain review and activation.
4. After activation the server sends `notifications/tools/list_changed` and the business's nine tools replace the setup tools. List tools again and carry on in the same conversation: "Take an order for Maria Lopez, a dozen roses for Friday."

## Example

The answers below are what the demo auto shop returns.

> **User:** What's waiting on parts?
> *(find tool, `stage: waiting_on_parts`)*
> **Assistant:** 2 work orders: work order 45, Rosa Medina's 2021 red SUV and work order 46, Tom Becker's 2017 gray coupe.
> **User:** Add front brake pads to the blue sedan.
> *(add-line tool, `order: "the blue sedan"`, `item: "front brake pads"`)*
> **Assistant:** Added front brake pads to work order 41. The total is now $253.71.
> **User:** Move it into the bay.
> *(move tool, `order: "the blue sedan"`, `stage: in_bay`)*
> **Assistant:** Work order 41, Dana Lee's 2019 blue sedan, is now in the bay.
> **User:** Close out the silver crossover, they paid by card.
> *(close-out tool, `order: "the silver crossover"`, `paymentMethod: card`)*
> **Assistant:** Closed work order 47, Nina Patel's 2020 silver crossover. They paid $110.00 by card.

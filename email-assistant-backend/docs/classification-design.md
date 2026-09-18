# Email classification design (Sept 2026)

Based on a survey of one year of sent mail (325 real threads), three months of inbox
(Primary 132, Updates 60, Social ~97, Promotions ~1,450), and three months of classifier
output (Email Prison 288, Notification 406, Invoices 115).

Promotions and Social tabs stay excluded from polling. Nothing actionable was found in ~1,550
threads there. Forums is empty; the poll query could be narrowed to `category:primary OR
category:updates`.

## 1. Where the current 4-label system goes wrong

Measured over 19 Jun - 19 Sep 2026.

| Symptom | Examples | Root cause |
|---|---|---|
| Client mail binned as Spam | BNB Group brand-guideline PDFs (no body text), family PDF, trade-show video brief | Empty body + attachment looks like nothing to the model |
| Client mail filed as Invoices | Kit Mulligan (Bayleys) "send me the invoice" x3, Comms Council thanks, Tower claim follow-up, Shore Tree thanks, accountant GST queries | The word "invoice" in a human message overrides "a person is writing to me" |
| Unpaid bills filed with paid receipts | Cursor "couldn't process payment", Tower "payment overdue", supplier invoices via Xero next to Apple receipts | Invoices has no paid/unpaid distinction; Guy wants unpaid requests in the inbox |
| Action-required mail hidden as Notification | Companies Office return OVERDUE, Claude API access turned off, insurance renewal due, Studio Ninja card failed, client filming-day reminder, Payper runsheet share, mailer-daemon bounce | No category exists for "automated but you must act" |
| Same sender lands in 2-3 labels | AliExpress (Prison 11 / Notif 55), Seek (4/12), Railway news (9/4), Claude news (6/4), Vetpost (14/9/1), PayPal (Notif 19 / Inv 13), C4 Coffee (7/6) | Per-message LLM call with no sender memory |
| Personal receipts mixed with business bills | Pizza Hut, Disney+, Temu, C4 Coffee in Invoices next to SBA, Google Workspace, ACC, Watercare | No business/personal split |
| Money-in scattered | Xero remittances in Invoices; PayPal money-in, BlackBox royalties, Adobe payouts in Notification/Prison | No "payment received" category |
| Opt-in newsletters treated as spam | Substack, Rundown, Railway, Supabase, church newsletter | "Spam" and "newsletter" are one bucket |

Pipeline issues independent of the model:

- Poll fetches max 3 unread messages newer than 5 minutes. "Reply Needed" mail stays unread
  and refills those slots, so a 4th message in a burst can age out unclassified.
- If Railway is down or erroring for >5 minutes, that window is never classified.
- Processed IDs and pending-notification holds are JSON files on Railway's ephemeral disk.

Security note surfaced by the audit: "Invoice 3923-1 from Automotive Services" arrived from
`messaging-service@post-sam.com` (styled like Xero's post.xero.com; the domain does not resolve).
Guy replied "Paid" and the reply bounced. Verify with the mechanic directly.

## 2. Target label set for incoming mail

Seven labels. This is the set Guy actually used when hand-labelling the 106-email eval set
(Sept 2026); Receipts, Payments Received and Newsletters were proposed and rejected by usage.

Inbox (unread):
1. **Reply Needed** - a person is asking Guy something by email and expects an email reply.
   Includes human messages from the accountant. "invoice" in a human message changes nothing.
2. **Action Required** [label "Action Required"] - Guy must do something, nobody expects an
   email reply: "send me the bill" close-outs, bills to pay manually (rates, overdue, failed
   card, bank-transfer invoices), compliance deadlines, platform relays Guy answers on the
   platform (Builderscrack, Airbnb host).
3. **Reference** [new label] - context for a job, nothing to do now: brand guidelines, briefs,
   schedules, client calendar invites, auto-replies to Guy's own outreach.
4. **Client FYI** [new label] - a client closing a thread: thanks, "looks great", "paid".

Filed:
5. **Invoices** [existing] - any money record with nothing to do: receipts (business or
   personal), bills collected by direct debit, DD notices, subscription charges, remittances,
   PayPal in/out, royalties, payouts.
6. **Notification** [existing] - automated status: shipping, downloads, login codes, security
   alerts, password resets, platform admin, ACC/government info letters, out-of-office, bounces.
7. **Email Prison** [existing] - marketing of any kind including opt-in newsletters, cold
   pitches even when personalised, real-estate prospecting, review requests, phishing.

Rules of precedence:
- Someone expecting an email reply never leaves the inbox.
- Paid or auto-collected -> Invoices. Must pay manually -> Action Required.
- Accountant: human queries are Reply Needed; their invoices and DD notices are Invoices;
  their marketing is Email Prison.
- Login/2FA codes: hold 30 minutes before moving, not 5.

## 3. Pre-model deterministic layer (runs before any model call)

Cheap, exact, and removes most of the inconsistency.

1. Headers: `Auto-Submitted`, `X-Autoreply`, `Precedence: auto_reply|bulk`, sender
   `mailer-daemon` -> Notification (bounce of Guy's own mail -> Action Required).
2. Thread check: any SENT message from guy@ in the thread + human sender -> Reply Needed.
3. Sender rules table (exact address or domain, optional subject pattern). Seed from the audit:
   - Reply Needed allow-list: bayleys.co.nz, nzsir.com, northnzsir.com, bnbgroup.co.nz,
     payper.co, tenpasttomorrow.com, commscouncil.nz, nautica.co.nz, jle.co.nz, smoke.co.nz,
     patersonluxury.co.nz, nectar.photography, sba.co.nz, guardiansmith.co.nz, ajg.co.nz,
     claims@tower.co.nz, h88photoediting@gmail.com, hannoverfairs.com.au, windsorpark.org.nz,
     family addresses.
   - Payments Received: post.xero.com "Payment has been made"; intl.paypal.com "has sent you" /
     "transferring money to your bank"; blackbox.global payout; Stock@adobe.com.
   - Invoices (paid receipts): gocardless.com "payment collected" / "has been taken",
     payments-noreply@google.com, invoice+statements@* (Anthropic/Raycast, charged on card),
     stripe.com receipts, receipts@openrouter.ai, imagen-ai.com, Robot@pbtech.co.nz
     "(Invoice Paid)", vimeo plan receipt, tower.co.nz "payment received".
   - Action Required (unpaid, stays in inbox): post.xero.com supplier invoices (a bill to pay),
     gocardless.com "upcoming payment", comms.2degrees.nz bills, water.co.nz,
     rates.aucklandcouncil.govt.nz, ext.acc.co.nz levy, nzta.govt.nz, tower.co.nz "payment
     overdue" / renewal, any "payment failed" / "couldn't process".
   - sba.co.nz (accountant): always Reply Needed, never a sender rule into Invoices.
   - Receipts: t1.rechargemail.com, t.shopifyemail.com (C4), email.apple.com, pizzahut,
     uber.com, sipocloudpos, automated@airbnb.com, paypal "Receipt for Your Payment".
   - Notification: notice.aliexpress.com (tracking), pixiesetmail.com, nzpost.co.nz,
     accounts.google.com, mail.anthropic.com, dropbox.com, builderscrack.co.nz,
     notify.railway.app, synology, getflywheel.com, vimeo week-in-review, updates.fresha.com.
   - Email Prison: daily.therundown.ai, *.substack.com, email.openai.com, ae-*@*.aliexpress.com,
     market.temuemail.com, vetpost marketing, onlinemeats, klarna, hallertau, cullenkellycolor,
     barfoot.co.nz agent mailouts, s.seek.co.nz, cosmos.so, tailscale, openrouter welcome,
     news.railway.app, email.claude.com, supabase welcome, mitre10trade, golf.co.nz,
     aliexpress "how did it go".
4. `List-Unsubscribe` header present -> passed to the model as a feature, not a hard rule.
5. Sender memory: store last decision per sender address. If Guy manually moves a message to a
   different label (observed on the next poll by label diff), record the correction and apply
   it to that sender going forward. This is the feedback loop that gets from 90% to high 90s.

## 4. Model layer (Jev primary, Luna fallback)

State passed to Jev: from, reply-to, to, subject, first ~1,500 tokens of body, attachment
names, booleans {has_list_unsubscribe, guy_replied_in_thread, sender_seen_before,
sender_last_label}.

Questions:
- `disposition`: Choice over the 7 labels above, with one-line criteria each.
- `is_human_written`: Noul.
- `needs_action`: Noul ("Guy must do something, even if no reply is expected").
- `sphere`: Choice {business, personal}.
- `money_state`: Choice {none, settled_or_auto_collected, must_pay_manually}. Drives
  Invoices vs Action Required.

Routing: take `disposition` if its probability >= 0.6. Below that, fall back to
Reply Needed if `is_human_written` > 0.5, else Notification, and log for review.
Fallback provider when Jev is unavailable: gpt-5.6-luna with the same schema.

## 5. Facets for the drafting archive (sent-mail tagging)

Tag each (incoming, Guy's reply) pair once. Use these to select 3-5 examples for the drafter.

- `client_type`: real_estate_agency, wedding_couple, corporate, event_agency,
  architect_builder, private_vendor, peer_creative, supplier_vendor, accountant_finance,
  personal_family, cold_prospect.
- `job_type`: listing_photo_video, listing_video_only, agent_profile_headshots,
  office_branch_content, event_coverage, interview_corporate_video, wedding_photo,
  wedding_video, architecture_feature, raw_footage_request, none.
- `stage`: enquiry, quote_sent, booked_scheduling, pre_shoot_logistics, post_shoot_delivery,
  revision, invoice_payment, nurture_templated, follow_up, decline, relationship.
- `response_intent`: deliver_link, confirm_done, give_price, propose_time, decline_capacity,
  apologise_late, chase_payment, ask_clarifying.
- `asked_about` (Nouls): pricing, availability, travel_surcharge, turnaround_deadline,
  revisions, format_variant, deliverables_spec, raw_files, licensing_branding,
  payment_status, scheduling_time, weather, permissions_consent, technical, referral_request.
- `tone_register`: warm_business, mate_casual, templated_wedding, personal_serious.

Exclusions from the example pool: personal_family, cold_prospect, tone personal_serious,
out-of-office auto-replies, Studio Ninja / Pixieset templated sends. Weight quote examples by
recency (pricing rose ~20% over the year).

Observed sent-mail mix, for sizing: deliverable handover 22%, scheduling 11%, wedding
pipeline 11%, quotes 8%, revisions 8%, invoice/payment 6%, cold pitch 6%, follow-up 4%.
Real estate is ~48% of all outgoing mail (Bayleys and NZ Sotheby's alone ~42%).

## 6. Pipeline fixes

1. Replace the 3-message / 5-minute window with a durable cursor: store the last processed
   `historyId` (or internalDate) and fetch everything since it, up to 50 per poll.
2. Keep state in Gmail, not on disk: hidden labels `AI/Processed` and `AI/Pending-Notification`
   replace the two JSON files. Survives redeploys with no volume.
3. Move pending notifications by comparing internalDate to now, not an in-memory timer.
4. Hold login codes 30 minutes.

## 7. Build order

Done (Sept 2026):
1. Sender rules + header pre-rules + thread check: `src/services/classifier/rules.js`.
2. Seven-way routing with Reference and Client FYI labels: `src/services/gmail/index.js`.
3. Eval set (106 hand-labelled emails) and scorer: `eval/`. Production classifier scores
   ~92% by destination with 2/37 inbox emails misfiled, vs 78% and 12/37 for the old prompt.
4. Poll window widened to 25 messages / 30 minutes. State lives on the Railway volume
   mounted at /app/data.

Next:
5. Sender memory: learn from Guy moving a message between labels.
6. Jev behind a provider switch, Luna fallback; compare on the eval set.
7. Sent-archive tagger and the retrieval step in front of drafting.

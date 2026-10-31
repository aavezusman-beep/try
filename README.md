# Vaishnavi Banquet – Website and Admin Panel

## What is inside
- `public/index.html` – the public website (hero, about, events, gallery with lightbox, facilities, restaurant menu, packages, reviews, booking calendar and enquiry form, contact and map, footer).
- `public/admin.html` – the owner's admin panel (login, dashboard, hall availability calendar, enquiries, website content).
- `server.js` – the Node.js/Express server. It stores everything in `data/db.json`.
- `data/db.json` – all website content, availability and enquiries.
- `public/images/` – venue photos, copied from the photos supplied.

## Requirements
- Node.js 18 or newer (download from nodejs.org, LTS version).

## One-time setup (developer or owner)
1. Open a terminal in the `vaishnavi-banquet` folder.
2. Install the one dependency: `npm install`
3. Set an admin password and start the server.
   - Windows (PowerShell): `$env:ADMIN_PASSWORD="your-strong-password"; npm start`
   - Mac/Linux: `ADMIN_PASSWORD="your-strong-password" npm start`
4. Open `http://localhost:3000` for the website and `http://localhost:3000/admin.html` for the admin panel.

Use a strong password of at least 12 characters. Never put it inside the code.

## Procedure: updating hall availability (owner)
1. Open `/admin.html` and log in with the admin password.
2. Go to **Hall Availability**.
3. Pick the date range:
   - For one day, type the date in **From** and leave **To** the same (or click the day in the calendar).
   - For several days, set **From** and **To**.
4. Choose a status:
   - **Available (open)** – the date can be enquired about (the default).
   - **Booked** – a function is fixed on this date.
   - **Unavailable / blocked** – maintenance, family use or any other reason.
5. Add an optional private note (visitors never see it).
6. Click **Save availability**. The public calendar updates immediately.
7. To reopen a date, click it and choose Available, or use **Make available** in the list below the calendar.

Visitors cannot book a date that is marked Booked or Unavailable. The system also blocks a customer from sending a second enquiry for the same date with the same phone number.

## Procedure: handling enquiries (owner)
1. Go to **Enquiries**. New enquiries show as **Pending**.
2. Call or WhatsApp the customer (buttons are in the Contact column).
3. Change the status:
   - **Confirmed** – marks the date as Booked in the calendar automatically.
   - **Cancelled** – frees the date again.
4. Use the private note box to record what was agreed, then click **Save note**.
5. Use **Export to Excel (CSV)** to download all enquiries.

An enquiry is never a confirmed booking until the owner sets it to Confirmed.

## Procedure: editing website content (owner)
- **Hall and contact**: tagline, hall areas, capacity, address, phone numbers, the WhatsApp number that receives enquiries, and business hours. Save with **Save hall and contact**.
- **Lists (advanced)**: facilities, events, packages and prices, restaurant menu, reviews and gallery photos are edited as JSON text. Copy an existing entry, change its text, and click the matching **Save** button. Invalid text is rejected with a message and nothing is changed.
- Facilities only appear on the website when `"active": true`.
- Packages marked `"draft": true` show a "Sample" label. Remove the label or the entry once the real package is confirmed.
- Menu items with `"available": false` are hidden from the public menu.

## Items the owner must confirm before going live
These were deliberately left as placeholders instead of invented facts:
- Hall capacity (empty until confirmed).
- Real packages and prices (shown as "Contact for pricing").
- The real restaurant menu (sample dishes are labelled; no prices shown).
- Which WhatsApp number receives enquiries (currently 7004780657, set in Hall and contact).
- A verified Google Business Profile link for the "Read More Google Reviews" button and directions (currently a Google Maps search link).
- Facilities that are not yet confirmed (power backup, guest rooms, air-conditioned hall) are hidden.
- Instagram and other social links are not included until the owner's account is verified.
- The hero and gallery exclude the entrance photo showing a couple's name on the sign.

## Going live (hosting)
The site needs a host that runs Node.js (for example Render, Railway or a VPS). Set `ADMIN_PASSWORD` in the host's environment settings and run `npm start`. Back up `data/db.json` regularly, because it holds all enquiries and availability. Use HTTPS on the live domain.

## Security notes
- The admin password is read from an environment variable and is never sent to the browser.
- Admin sessions expire after 8 hours of inactivity. Login locks for 15 minutes after 5 wrong attempts.
- Every admin action is checked on the server, not only in the browser.
- Customer details are available only in the admin panel, never on the public site.

## Credits
Designed & Developed by Aavez Usman · 7004898475 · Instagram @aavez_usman

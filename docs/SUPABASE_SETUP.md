# AWI Supabase Integration Guide

> **⚠️ IMPORTANT:** Before proceeding, read [ABSOLUTE_ORDERS.md](./ABSOLUTE_ORDERS.md) for critical protocols regarding crashes and debugging.

This document details how the **AWI (Artificial Wisdom Intelligence)** server integrates with **Supabase** to provide authentication, data persistence, and real-time capabilities.

---

## 1. Quick Start

Follow these steps to get your database backend running in less than 5 minutes.

### Step 1: Create a Supabase Project
1.  Go to [database.new](https://database.new) and sign in/sign up.
2.  Create a new project. Give it a name (e.g., "awi-backend") and a secure password.
3.  Wait for the project to provision (usually ~1-2 minutes).

### Step 2: Initialize the Database
1.  In your Supabase Dashboard, go to the **SQL Editor** (icon on the left sidebar).
2.  Click **New Query**.
3.  Open the file `db/supabase-setup.sql` from this repository.
4.  Copy the entire content and paste it into the SQL Editor.
5.  Click **Run**.
    *   *Success:* You should see "Success, no rows returned" or similar.
    *   *Tables Created:* `awi_configs`, `user_profiles`, `meetings`, etc.

### Step 3: Connect AWI to Supabase
1.  In Supabase Dashboard, go to **Project Settings** -> **API**.
2.  Copy the **Project URL** and the **`service_role` secret** (reveal it first).
    *   *Note: The `service_role` key is required for the Node.js server to manage users and perform admin tasks. The `anon` key is for client-side apps.*
3.  Open your local `.env` file.
4.  Update the variables:
    ```bash
    SUPABASE_URL="https://your-project-id.supabase.co"
    SUPABASE_SECRET_KEY="your-service-role-key-here"
    ```
5.  (Optional) If you are building a frontend, add the `anon` key:
    ```bash
    VITE_SUPABASE_ANON_KEY="your-anon-key-here"
    ```

### Step 4: Enable the Connector
1.  Open your launch script (e.g., `mac_node_prompt.mjs`).
2.  Uncomment the database connector block:
    ```javascript
    { name: 'connectors/database/supabase', config: { priority: --priority }, options: {
        url: process.env.SUPABASE_URL,
        secretKey: process.env.SUPABASE_SECRET_KEY
    } },
    ```
3.  Restart the AWI server.

---

## 2. Architecture & Necessities

### Why Supabase?
AWI is designed as a **stateful, intelligent agent**, but it needs a place to store long-term memories, user configurations, and synchronize state between devices. Supabase provides:
*   **PostgreSQL**: Robust relational data storage.
*   **Auth**: Secure user management (Email, Google, Apple, etc.).
*   **Realtime**: WebSocket subscriptions for instant updates.
*   **Edge Functions**: (Optional) For scalable serverless logic.

### Requirements
1.  **Supabase Account**: Free tier is sufficient for development.
2.  **Node.js Server**: The AWI engine running locally or on a VPS.
3.  **Environment Variables**: Secure storage for API keys.

---

## 3. Database Schema Details

The schema is defined in `db/supabase-setup.sql`. Here are the core components:

### 3.1. Core Tables
*   **`awi_configs`**: Stores the main configuration JSON for a user.
    *   *Key:* `user_id` (One-to-One with Auth Users).
*   **`awi_named_configs`**: Flexible key-value store for auxiliary data (e.g., specific AI personalities, OAuth states).
    *   *Unique Constraint:* `user_id` + `config_type` + `config_name`.
*   **`user_profiles`**: Public-facing user data (username, avatar, display name).

### 3.2. Operational Tables
*   **`meetings`**: Stores calendar events and meeting metadata.
*   **`notifications`**: System alerts and messages for users.
*   **`device_tokens`**: Stores push notification tokens (Expo/APNS/FCM) for mobile apps.
*   **`google_tokens` / `zoom_tokens`**: Encrypted OAuth tokens for external integrations.

### 3.3. Security (RLS)
**Row Level Security is MANDATORY.**
*   The setup script enables RLS on *all* tables.
*   **Policy Rule**: "Users can only see and edit their own data."
*   `auth.uid() = user_id`: This SQL clause ensures strict data isolation. Even if a malicious client tries to query `SELECT * FROM meetings`, the database will only return rows belonging to that specific user.

---

## 4. Extension to Real-Life Projects

How does AWI + Supabase fit into a full-stack application (Web/Mobile)?

### The "Triangle" Architecture

```mermaid
graph TD
    Client[Client App\n(Web / iOS / Android)]
    AWI[AWI Server\n(Node.js / AI Brain)]
    DB[(Supabase\nDatabase & Auth)]

    Client -->|1. Auth & Data Sync| DB
    Client -->|2. Complex Requests| AWI
    AWI -->|3. Admin Access| DB
```

#### 1. The Client (Frontend)
*   **Direct DB Access**: The client uses the Supabase SDK (`@supabase/supabase-js`) with the **Anon Key**.
*   **Role**: It handles user login, fetching simple data (e.g., "Show me my list of meetings"), and listening for real-time updates.
*   **Security**: Protected by RLS policies in the database.

#### 2. The AWI Server (Backend Brain)
*   **Admin Access**: The server uses the Supabase SDK with the **Service Role Key**. This allows it to bypass RLS to perform administrative tasks (e.g., creating a new user setup, running background cron jobs, processing data for *any* user).
*   **Role**: It handles the "Intelligence".
    *   *Example:* User records audio on phone -> Uploads to AWI -> AWI transcribes & summarizes -> AWI saves summary to `meetings` table in Supabase.
    *   *Result:* The Client instantly sees the summary appear because it is subscribed to the `meetings` table.

#### 3. Real-Time Sync
*   Because both the Client and AWI talk to the same Supabase backend, they stay in sync automatically.
*   If AWI updates a profile picture, the Phone App updates instantly via Supabase Realtime.

### Deployment Guide
1.  **Database**: Host on Supabase Cloud (easiest) or self-host via Docker.
2.  **AWI Server**: Deploy to a VPS (DigitalOcean, AWS, Hetzner) or a long-running Node.js container (Railway, Fly.io).
    *   *Note:* Serverless functions (AWS Lambda) are generally *not* suitable for the main AWI engine due to its stateful nature and long-running AI processes.
3.  **Client**: Vercel/Netlify for Web, App Store/Play Store for Mobile.

---

## 5. Maintenance

### Resetting the Database
If you need to wipe everything and start fresh (Dev only!):
1.  Open `db/supabase-reset.sql`.
2.  Run the script in Supabase SQL Editor.
3.  Re-run `db/supabase-setup.sql`.

### Updating the Schema
The AWI Server has a special `exec_sql` function installed by the setup script. This allows the server to dynamically patch the database schema if new features require new tables, without you needing to manually run SQL every time.

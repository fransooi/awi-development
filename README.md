# AWI Server

**AWI (Agentic Workflow Intelligence)** is a modular, personal AI assistant server designed to be intelligent, programmable, and extensible. It acts as a central hub for connecting various services (databases, file systems, AI providers) through a unified "bubble" and "connector" architecture.

## 🚀 Quickstart

### Prerequisites
- **Node.js** (Reference version: **v20.19.5**)
- **Supabase Account** (for database and authentication)
- **Eden AI API Key** (optional, for AI features)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd awi
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment:**

    AWI uses a local `.env` file for configuration.

    1.  **Initialize Configuration:**
        Duplicate the template file to create your local environment file.
        ```bash
        cp .env.example .env
        ```

    2.  **Start the Server:**
        Follow the instructions in the "Running the Server" section below.

    3.  **Finish Setup:**
        *   **Automatic (Recommended):** Open `http://localhost:8080` in your browser and follow the setup wizard.
        *   **Manual:** Edit the `.env` file directly and add your keys (ensure you keep the `TOCOMPLETE_` prefix in the variable names).

    **Required Variables:**
    *   `TOCOMPLETE_SUPABASE_URL`: Your Supabase project URL.
    *   `TOCOMPLETE_SUPABASE_SECRET_KEY`: Your Supabase API key (anon/public).
    *   `TOCOMPLETE_SUPABASE_SERVICE_ROLE_KEY`: (Optional but recommended for admin tasks) Your Supabase Service Role key.

    **Optional Variables:**
    *   `EDEN_AI_KEY`: API key for Eden AI services.

    **Example `.env` content:**

```ini
TOCOMPLETE_SUPABASE_URL="https://your-project.supabase.co"
TOCOMPLETE_SUPABASE_SECRET_KEY="sb_publishable_key"
TOCOMPLETE_SUPABASE_SERVICE_ROLE_KEY="sb_secret_key"
```
    
### Running the Server

Start the server using the platform-specific launcher:

*   **macOS:**
    ```bash
    node mac_node_prompt.mjs
    ```
*   **Windows:**
    ```bash
    node windows-node-prompt.mjs
    ```
*   **Linux:**
    ```bash
    node linux-node-prompt.mjs
    ```

**Read and follow the prompt.**

> **Note:** Currently, the Web UI onboarding and logging flow has been the most thoroughly tested.

## 🏗 Architecture

AWI is built on a highly modular architecture. Everything is a plugin.

### Connectors (`/connectors`)
Connectors are bridges to external systems or internal capabilities. They handle the low-level communication and API logic.
*   **System:** Logging, File system, Node process management.
*   **Network:** HTTP Server, WebSocket Server.
*   **Database:** Supabase integration for user data and configuration.
*   **AI:** Interfaces for Eden AI (Text, Speech, Chat).
*   **AWI Core:** Configuration, Prompt handling, Persona management.

**🔥 Hot-Reloading:** Connectors are designed to be hot-reloadable. You can update connector logic or configurations without needing to restart the entire server.

### Bubbles (`/bubbles`)
Bubbles are high-level, executable units of logic or "skills". They use connectors to perform tasks and can be chained together into complex workflows.
*   **Examples:** `Welcome`, `Input`, `Chat`, `Setup`.

### Souvenirs (`/souvenirs`)
Souvenirs are specialized modules for handling specific types of data artifacts created or received during interactions. They function similarly to Bubbles but focus on data permanence and formatting.
*   **Types:** Audio, Document, Image, Mail, Message, Photo, Video.

### Memories (`/memories`)
Memories are the long-term storage units of AWI. They manage how interactions, context, and information are indexed and retrieved.
*   **Function:** Storing conversation history, user preferences, and learned facts.

### Data Structure (`/data`)
*   `public/`: Static assets for the web interface.
*   `configs/`: Local configuration files.
*   `logs/`: Server application and HTTP logs.
*   `temp/`: Temporary files for uploads and processing.

## 🤝 Contributing

This project is open-source. Please support the development!

*   **Author:** Francois Lionet
*   **Version:** 0.5

# Setting Up the AWI Development Environment

This guide will help you set up your local development environment for the **AWI Server**. It covers setup for **macOS**, **Windows**, and **Linux**.

## 1. Prerequisites

Before you begin, ensure you have the following installed:

*   **Node.js**: Version **v20.19.5** (LTS) or higher is recommended.
    *   [Download Node.js](https://nodejs.org/)
    *   Verify with: `node -v`
*   **Git**: For version control.
    *   [Download Git](https://git-scm.com/)
    *   Verify with: `git --version`
*   **Code Editor**: **Visual Studio Code** (VS Code) is highly recommended as the project includes launch configurations.
    *   [Download VS Code](https://code.visualstudio.com/)

---

## 2. Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/fransooi/awi-development.git
    cd awi-development
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

---

## 3. Configuration

AWI uses a single `.env` file for configuration across all platforms.

1.  **Create your local environment file:**
    Duplicate the example template to create your active configuration file.
    ```bash
    cp .env.example .env
    ```
    *(On Windows Command Prompt: `copy .env.example .env`)*

2.  **Edit `.env`:**
    Open the file and enter your API keys. Retain the variable names exactly as they appear (e.g., `TOCOMPLETE_SUPABASE_URL`).

    *   **Supabase:** Required for database and auth.
    *   **Eden AI:** Optional, for AI capabilities.

    *You can also configure these automatically via the Web UI after starting the server.*

---

## 4. Running the Server

Use the platform-specific launcher scripts to start AWI.

### macOS
```bash
node mac_node_prompt.mjs
```

### Windows
```bash
node windows-node-prompt.mjs
```

### Linux
```bash
node linux-node-prompt.mjs
```

Once the server is running:
*   **Web UI:** Open `http://localhost:8080` to access the control panel.
*   **Terminal:** The console will act as a command prompt for the AWI agent.

---

## 5. VS Code Configuration

This repository includes a `.vscode` folder with pre-configured settings.

*   **Launch Configurations:** You can start the server directly from the "Run and Debug" tab in VS Code. Select "Awi Server-macOS", "Awi Server-Windows", or "Awi Server-Linux" depending on your OS.
*   **Extensions:** Recommended extensions include ESLint and Prettier for code quality.

## 6. Troubleshooting

*   **Database Connection Failed:** Ensure your `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env` are correct. Check `docs/SUPABASE_SETUP.md` for details.
*   **Port In Use:** If port 8080 is busy, check if another instance of AWI is running or change the port in the launcher script options.

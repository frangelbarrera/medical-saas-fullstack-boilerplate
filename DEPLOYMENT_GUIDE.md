# Automatic Deployment Guide: Medical SaaS Boilerplate

This guide explains step-by-step how to configure a production server and GitHub so that the application is deployed automatically using CI/CD pipelines when changes are pushed to the main branch.

---

## 1. Server Configuration

Before initiating the automated deployment, the host server must be prepared.

### Prerequisites
Make sure the server has the following installed:
*   **Docker**: `sudo apt install docker.io`
*   **Docker Compose**: `sudo apt install docker-compose`
*   **Git**: `sudo apt install git`

### Prepare the Project Directory
1.  Access the server via SSH.
2.  Create the directory where the application will be hosted:
    ```bash
    mkdir -p /path/to/medical_saas
    cd /path/to/medical_saas
    ```
3.  Clone the repository for the initial setup:
    ```bash
    git clone https://github.com/YOUR_USER/YOUR_REPOSITORY.git .
    ```

---

## 2. GitHub Actions Configuration (Secrets)

To allow GitHub Actions to access your server securely without exposing credentials in the repository, you must configure GitHub Secrets.

1.  Navigate to your repository on GitHub.
2.  Go to **Settings** > **Secrets and variables** > **Actions**.
3.  Click on **New repository secret** and add the following:

| Secret Name | Description |
| :--- | :--- |
| `SERVER_HOST` | The IP address of your production server (e.g., `203.0.113.10`). |
| `SERVER_USER` | The SSH username (e.g., `ubuntu` or `root`). |
| `SERVER_SSH_KEY` | The contents of your **SSH private key** (typically `id_rsa` or `id_ed25519`). |

> **Note on the SSH Key**: Generate one on your server using `ssh-keygen`, and ensure the public key (`.pub`) is appended to the `~/.ssh/authorized_keys` file.

---

## 3. Database & Environment Configuration

The `docker-compose.yml` file is configured to provision a PostgreSQL database automatically on the server.

### Setting up Credentials
Never hardcode secrets in the repository. Instead, create a `.env` file in the project deployment directory on your server:

```env
# .env on the deployment server
PGUSER=secure_db_user
PGPASSWORD=ultra_secure_password
PGDATABASE=medical_saas_production
JWT_SECRET=high_entropy_random_string_here
ENCRYPTION_KEY=your_app_level_encryption_key_hex_32_bytes_here
NODE_ENV=production
```

Docker Compose will securely inject these variables into the containers during deployment.

---

## 4. Deployment Workflow

Once configured, the deployment process is automated:

1.  Commit changes to your source code locally.
2.  Run `git push origin main`.
3.  **GitHub Actions** will trigger the deployment workflow, connect to the server via SSH, pull the latest code, and rebuild the containers using `docker-compose up -d --build`.

### Monitoring the Deployment
Navigate to the **Actions** tab on your GitHub repository to view workflow logs and troubleshoot any failed deployment steps.

---

## 5. Server Maintenance Commands

Useful commands for managing the Docker containers directly on the host server:

*   **Check running containers**: `docker ps`
*   **View real-time application logs**: `docker logs -f medical_saas_app`
*   **Restart the application**: `docker-compose restart`
*   **Monitor database logs**: `docker logs -f postgres_medical_db`

---

## 6. Local AI Infrastructure Requirements (On-Premise)

To fully utilize the autonomous features without relying on external cloud APIs, you need to expose local inference services via your network:

### A. LLM Inference Service (The Brain)
*   **Model**: Llama-3-8B-Instruct (or Mistral-7B-v0.3)
*   **Deployment**: Ollama or vLLM container.
*   **API Standard**: OpenAI compatible endpoint.
*   **Purpose**: Processing clinical summaries, diagnostic suggestions, and natural language queries.

### B. STT Transcription Service (The Ear)
*   **Model**: Faster-Whisper-large-v3
*   **Deployment**: Independent transcription container (e.g., `fedirz/faster-whisper-server`).
*   **Purpose**: Asynchronous or real-time processing of clinical consultation audio streams.

### C. Network Architecture
The backend application should interface with these AI services over an internal, isolated network (Internal VPC or Docker Bridge). These services should **not** be exposed publicly. Provide the connection strings via the environment variables `AI_LLM_URL` and `AI_STT_URL` in your `.env` file.

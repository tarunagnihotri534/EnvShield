# EnvShield 🛡️

**EnvShield** is a modern, developer-first, fully offline security tool designed to detect and block secrets, API keys, credentials, and high-entropy tokens in your codebases. 

By combining pre-commit/pre-push hooks, history scans, Shannon entropy analysis, and a sleek React/Electron desktop interface, EnvShield provides a comprehensive shield for your development workflow.

---

## ⚡ Features

- **🔒 Offline-First**: All scanning is done locally. Secrets are analyzed completely offline with zero remote telemetry.
- **🛠️ Automated Git Hooks**: Easily install pre-commit and pre-push hooks that intercept commits/pushes to block high- or critical-severity secrets from leaking.
- **🔍 Historical Analysis**: Run deep advisory scans on your repository's git history to uncover previously committed credentials.
- **📈 Shannon Entropy Analysis**: In addition to rigid pattern-matching, EnvShield uses entropy algorithms to detect unstructured, high-entropy tokens (e.g. passwords, auto-generated keys).
- **🛡️ Built-in Pattern Rules**: High-fidelity detection rules for popular platforms:
  - **AWS**: Access Keys (`AKIA`...), Secret Access Keys.
  - **GitHub**: Classic PATs (`ghp_`...), OAuth tokens, Actions tokens, Fine-grained PATs.
  - **Slack**: Bot tokens, User tokens, App tokens, Webhook URLs.
  - **Stripe**: Live Secret and Restricted Keys.
  - **JSON Web Tokens (JWT)**: Triple-segment Base64URL signatures.
  - **PEM Blocks**: RSA, EC, DSA, OpenSSH private keys.
  - **Generic Assignments**: Detects variable assignments containing secret-like terms (e.g., `SECRET_KEY = "..."`).
- **🔕 False Positive Mitigation**:
  - Automatically ignores common placeholder strings (e.g. `your_api_key_here`, `xxxxxxxx`).
  - Automatically skips test keys (e.g., Stripe test keys like `sk_test_`).
  - Supports inline overrides using `# envshield-ignore` comments.
  - Supports repository-wide exclusion lists via `.envshieldignore` files.
- **💻 Premium Desktop App**: A gorgeous Electron-based visual cockpit built with Next.js, React, and Tailwind CSS.
  - Manage multiple repositories in a unified dashboard.
  - Step-by-step repository onboarding wizard.
  - Visual reports, scan histories, custom rules editor, and ignore list manager.

---

## 📁 Repository Structure

EnvShield is managed as a monorepo powered by [pnpm workspaces](pnpm-workspace.yaml):

```
EnvShield/
├── apps/
│   └── desktop/               # Electron + Next.js desktop application UI
├── packages/
│   ├── core/                  # Core secret detection engine & regex rules
│   └── cli/                   # Command line interface & git hooks installer
├── package.json               # Monorepo configuration
└── pnpm-workspace.yaml        # Workspace definitions
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (>= 20.0.0)
- [pnpm](https://pnpm.io/) (>= 9.0.0)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/EnvShield.git
   cd EnvShield
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Build all workspace projects:
   ```bash
   pnpm build
   ```

---

## 🛠️ Development & Running

You can start development servers for all packages concurrently:

```bash
pnpm dev
```

This command runs parallel build watchers for `packages/core` and `packages/cli` while spinning up the desktop application (Next.js development server + Electron window launcher).

---

## 💻 Command Line Interface (CLI)

The CLI package (`@envshield-core/cli`) compiles to the `envshield` executable binary.

```bash
# General help
npx envshield --help
```

### Commands

#### 1. `install`
Installs git pre-commit and pre-push hooks into the target repository's `.git/hooks/` directory. It also prompts to append sensitive file patterns to your `.gitignore`.
```bash
npx envshield install [--cwd <path>] [-y, --yes]
```

#### 2. `scan`
Scans staged git changes (i.e. `git diff --cached`). This is automatically invoked by the pre-commit/pre-push hooks.
- Exits with status `1` when high- or critical-severity secrets are found, blocking the commit.
```bash
npx envshield scan [--cwd <path>] [--entropy] [--threshold <score>] [--json] [--min-severity <level>]
```

#### 3. `scan-history`
Performs an advisory scan of the repository's git commit history. It walks the git log commit-by-commit to look for previously committed secrets.
```bash
npx envshield scan-history [--cwd <path>] [--since <ref/date>] [--entropy] [--threshold <score>] [--json] [--min-severity <level>] [--max-commits <n>]
```

---

## 📦 Packages

### 1. [`@envshield-core/core`](packages/core)
The engine under the hood. Exposes internal parsing functions and scanning utilities:
- `scanContent(content, filename, options)`: Analyzes a string for secrets.
- `shannonEntropy(string)`: Calculates the Shannon entropy score of a token.
- `isSensitiveFile(filename)`: Scans for credentials based on file path and filename rules.
- `parseIgnoreFile(content)`: Parses `.envshieldignore` patterns.

### 2. [`@envshield-core/cli`](packages/cli)
Commander-based CLI wrapping the core engine. Integrates with system shell operations and git scripts.

### 3. [`@envshield/desktop`](apps/desktop)
Next.js + Electron dashboard. Interacts with the backend via Electron IPC bridges (`scanBridge`, `installerBridge`, and `store`).
- Persistent storage lives in: `app.getPath('userData')/envshield-store.json`.

---

## 📝 Ignoring & Suppressing Findings

If a detected value is a mock secret or an intentional configuration, you can bypass the checks in two ways:

1. **Inline Bypass**: Add an inline comment matching `# envshield-ignore` or `// envshield-ignore` on the same line as the credential.
   ```javascript
   const tempKey = "ghp_mockSecretTokenForTestingPurposes" // envshield-ignore
   ```
2. **Global Exclusions**: Create an `.envshieldignore` file at the root of your repository and list rules or paths to skip.
   ```ignore
   # Ignore all markdown documentation files
   *.md
   # Ignore specific test fixtures
   tests/fixtures/secrets.json
   ```

---

## 🛡️ License

Private / Proprietary. All rights reserved.

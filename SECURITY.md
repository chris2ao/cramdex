# Security Policy

## Supported versions

The latest release on `main` receives security fixes.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting: open the repository's
**Security** tab and choose **Report a vulnerability**. Reports are triaged
as quickly as possible. Do not open public issues for security problems.

Context for reporters: cramdex is a local-first application. Course
content, the search corpus, and exam-index data stay on the user's
machine; corpus excerpts are sent only to the LLM provider the user
explicitly configures. PDF passwords are stored only in a 0600 file
inside the local course pack or supplied via an environment variable,
and API keys are read from environment variables only.

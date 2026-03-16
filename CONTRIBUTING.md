# Contributing

Thanks for your interest in contributing to WCAG Guide. This document covers
the basics for reporting issues, suggesting improvements, and submitting code.

## Reporting Bugs

Open a GitHub Issue with a clear title and enough detail to reproduce the
problem. Include the version you are running, relevant configuration, and any
error output.

## Suggesting Features

Feature requests are welcome as GitHub Issues. Describe the use case and the
behavior you would like to see. If you have ideas about implementation, feel
free to include them.

## Development Setup

1. Clone the repository:
   ```
   git clone https://github.com/jesseslone/wcag-guide.git
   cd wcag-guide
   ```
2. Start the local stack:
   ```
   docker compose up -d
   ```
3. Run the tests:
   ```
   npm test
   ```

## Pull Request Guidelines

- Keep changes focused. One logical change per PR.
- Add or update tests for any new behavior.
- `npm test` must pass before submitting.
- Write a clear PR description explaining what changed and why.

## Code of Conduct

Be respectful and constructive in all interactions. We are here to build
useful software together, and a welcoming environment helps everyone do their
best work.

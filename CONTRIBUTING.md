# Contributing to DevForge

Thank you for your interest in contributing to DevForge! This document provides guidelines and information for contributors.

Obrigado pelo seu interesse em contribuir com o DevForge! Este documento fornece diretrizes e informacoes para contribuidores.

---

## Contributor License Agreement (CLA)

By submitting a pull request or contributing code to this project, you agree to the following terms:

### Grant of Rights

1. **Copyright License:** You grant MJr (pir0c0pter0), the project maintainer, a perpetual, worldwide, non-exclusive, royalty-free, irrevocable copyright license to reproduce, prepare derivative works of, publicly display, publicly perform, sublicense, and distribute your contributions and derivative works.

2. **Patent License:** You grant MJr (pir0c0pter0) a perpetual, worldwide, non-exclusive, royalty-free, irrevocable patent license to make, have made, use, offer to sell, sell, import, and otherwise transfer your contributions, where such license applies only to those patent claims licensable by you that are necessarily infringed by your contributions alone or by combination of your contributions with the project.

3. **Dual Licensing:** You understand and agree that your contributions may be distributed under the PolyForm Noncommercial License 1.0.0 for noncommercial use, and under a separate commercial license for commercial use. You grant MJr (pir0c0pter0) the right to license your contributions under both licenses.

4. **Originality:** You represent that each of your contributions is your original creation and that you have the legal right to grant the above licenses.

5. **No Obligation:** You understand that the decision to include your contribution in the project is at the sole discretion of the project maintainer.

### How the CLA Works

- No separate form or signature is required
- Submitting a pull request constitutes acceptance of these terms
- This CLA applies to all contributions (code, documentation, tests, etc.)

---

## How to Contribute / Como Contribuir

### Reporting Bugs / Reportando Bugs

1. Check existing issues to avoid duplicates
2. Open a new issue at https://github.com/pir0c0pter0/devforge/issues
3. Include:
   - Description of the bug
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment (OS, Node.js version, Docker version)

### Suggesting Features / Sugerindo Funcionalidades

1. Open an issue with the `enhancement` label
2. Describe the feature and its use case
3. Explain why it would be valuable

### Submitting Code / Enviando Codigo

1. Fork the repository
2. Create a branch from `main`
3. Make your changes following the guidelines below
4. Run `pnpm build` to verify the build passes
5. Submit a pull request to `main`

---

## Development Guidelines / Diretrizes de Desenvolvimento

### Code Style

- TypeScript for all source code
- Follow existing patterns in the codebase
- Immutable data patterns (no mutation)
- Small, focused files (200-400 lines, max 800)
- Functions under 50 lines

### Commit Messages

```
<type>: <description>

Types: feat, fix, refactor, docs, test, chore, perf, ci
```

### Testing

- Write tests for new functionality
- Ensure existing tests pass: `pnpm test`
- Build must pass: `pnpm build`

### What We Accept

- Bug fixes with clear reproduction steps
- Performance improvements with benchmarks
- Documentation improvements
- New features that align with the project's goals

### What We Probably Won't Accept

- Changes that break backward compatibility without discussion
- Features that significantly increase complexity without clear benefit
- Code that doesn't follow existing patterns

---

## Project Structure

```
devforge/
├── packages/
│   ├── frontend/     # Next.js 15 (port 3000)
│   ├── backend/      # Express + Dockerode (port 8000)
│   └── shared/       # Shared types
├── scripts/          # Management scripts
└── docker/           # Container Dockerfiles
```

---

## Questions? / Duvidas?

- Open an issue: https://github.com/pir0c0pter0/devforge/issues
- Email: mariostjr@gmail.com

---

Copyright (c) 2024-2026 MJr (pir0c0pter0)

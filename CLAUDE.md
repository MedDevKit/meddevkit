# MedDevKit - Claude Code Instructions

## Project Overview

MedDevKit is an open-source medical development toolkit. The project provides TypeScript utilities for processing medical text in AI applications.

## Project Structure

```
MedDevKit/
├── packages/
│   └── chunker/                  # @meddevkit/chunker package
│       ├── src/
│       │   ├── MedicalChunker.ts # Core chunking class
│       │   ├── types.ts          # TypeScript interfaces
│       │   ├── patterns/         # Detection patterns
│       │   │   ├── vitals.ts     # BP, HR, RR, Temp, O2
│       │   │   ├── sections.ts   # CC, HPI, PE, Assessment
│       │   │   ├── phi.ts        # PHI detection
│       │   │   └── negation.ts   # Negation detection
│       │   ├── tokenizer/        # Token estimation
│       │   └── utils/            # Boundary, normalize utilities
│       └── tests/
├── package.json                  # Root monorepo config
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Essential Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm dev                    # Watch mode for all packages
pnpm test:watch             # Test watch mode

# Build & Test
pnpm build                  # Build all packages
pnpm test                   # Run all tests
pnpm lint                   # Lint all packages
pnpm typecheck              # Type check all packages

# Single Package
pnpm --filter @meddevkit/chunker build
pnpm --filter @meddevkit/chunker test
```

## Code Quality Standards

**ALWAYS run before committing:**
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Key Patterns

The chunker preserves medical context through pattern detection:

### 1. Vital Signs (`src/patterns/vitals.ts`)
Never split on these measurements:
- Blood pressure: `BP: 120/80 mmHg`
- Heart rate: `HR 72 bpm`
- Temperature: `T 98.6°F`
- O2 saturation: `O2 sat 98%`

### 2. Clinical Sections (`src/patterns/sections.ts`)
Recognize standard note sections:
- Chief Complaint (CC)
- History of Present Illness (HPI)
- Physical Exam (PE)
- Assessment & Plan (A/P)

### 3. PHI Detection (`src/patterns/phi.ts`)
Basic patterns for flagging potential PHI:
- Dates, MRN, phone, email, SSN
- **Note:** Basic detection only, not HIPAA-compliant

### 4. Negation Detection (`src/patterns/negation.ts`)
Identify negated findings:
- "no chest pain", "denies fever"
- "ruled out MI", "negative for"

## Open Source vs Private

This is an **open-source** project with basic patterns.

**Keep in open source:**
- ~10 patterns per category
- Standard confidence values
- Common use cases

**NOT included (keep private):**
- Tuned production thresholds
- 50+ PHI patterns
- Specialty-specific patterns
- HIPAA-compliant redaction strategies

## Testing Requirements

- Minimum 80% code coverage
- All patterns need positive AND negative tests
- Integration tests with realistic clinical notes
- No real PHI in test fixtures (use synthetic data)

## Development Guidelines

1. **Run tests after pattern changes** - Medical patterns are sensitive
2. **Verify PHI detection** - Both positive and negative cases
3. **Check vital preservation** - Ensure measurements aren't split
4. **Document new patterns** - Add JSDoc comments

## Git Commit Style

```
feat(chunker): Add respiratory rate pattern detection

- Added RR pattern with /min support
- Updated tests for edge cases
```

## Dependencies

- Node.js >= 18
- pnpm >= 8.15

## Package Publishing

1. Create changeset: `pnpm changeset`
2. Version packages: `pnpm changeset version`
3. Build: `pnpm build`
4. Publish: `pnpm changeset publish`

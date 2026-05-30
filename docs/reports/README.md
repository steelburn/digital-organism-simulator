# Generated Reports

This folder contains generated evidence and validation artifacts for the simulation runtime.

## Current Report Areas

- [Conformance evidence](conformance/README.md)
- `config-audit/latest.json`
- `replay/latest.json`

## Report Generation

Generate the baseline artifacts with:

```bash
node scripts/generate_priority4_artifacts.mjs
```

## How to Use the Reports

- Treat the config audit as the current registry coverage snapshot.
- Treat the replay output as the seed and determinism evidence scaffold.
- Refer to the conformance report when filling out the checklist or closure plan.
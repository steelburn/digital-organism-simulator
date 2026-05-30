# Conformance Evidence Reports

This folder stores the conformance evidence snapshot for Blueprint v2.1.

For the full report map, start with [docs/reports/README.md](../README.md).

Primary evidence files:

- [Config audit](../config-audit/latest.json)
- [Replay template](../replay/latest.json)

Generate baseline artifacts with:

```bash
node scripts/generate_priority4_artifacts.mjs
```

Then attach report references in:

- [Conformance checklist template](../../../Conformance_Checklist_v2.1_Template.md)
- [Implementation profile template](../../../Implementation_Profile_Template_v2.1.md)

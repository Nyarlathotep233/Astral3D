# H3D Agent Guidelines

This repository has been renamed to **H3D (Haolink 3D)**.

## Naming Principle
- For all new user-facing names, labels, file suffixes, and prompts, prefer:
  - `H3D`
  - `Haolink 3D`
  - `Haolink 3D Editor`
- Avoid introducing new `astral3d` naming in newly added logic.
- Legacy `astral3d` identifiers may remain when changing them could break compatibility.

## Project Package Principle
- New project package file suffixes should use `h3d` or `haolink3d`.
- Current preferred suffixes:
  - `.h3d-project.json`
  - `.h3d-project.zip`
- Keep compatibility with legacy package formats when practical.

## Change Safety Principle
- Do not break existing save/upload/import chains.
- Prefer additive branches and compatibility checks over destructive replacement.

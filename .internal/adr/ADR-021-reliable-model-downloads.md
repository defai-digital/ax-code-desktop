# ADR-021: Reliable account-optional model downloads

Status: Accepted and implemented locally, 2026-10-19; not released.

Keep downloads in AX Engine, orchestration in AX Code, and environment capture/presentation in Desktop. Public Hub models remain anonymously downloadable. Structured stdout failures take precedence over warnings; diagnostic data is bounded and redacted. Global sanitization remains unchanged; only the official Hub download boundary receives user HF credentials, while custom endpoints have implicit auth disabled. Desktop forwards only approved model-related shell values, with explicit launcher env taking precedence. No silent anonymous retry of denied access is introduced.

HF remains the active source. A generated public model/download inventory records the reviewed collection and verified R2 entries without automatically admitting models or activating mirrors. Publisher events and schedules propose documentation changes for review. No signed runtime/SDK pin or deployment changes in this work.

Related plan: AX Code PRD-2026-10-19-reliable-model-downloads. See SPEC-2026-10-19-reliable-model-downloads for implementation and validation.

# Dynamic UI Schema Guide

## Objective

ACOMED is evolving into an agnostic SaaS audit engine.

Frontend applications (Mobile and Web) must not rely on hardcoded audit screens. Instead, each screen and field is generated dynamically from template JSON returned by the backend.

## Core Principle: Backend-Driven UI

- Fetch template JSON from `GET /api/templates/:id`.
- Loop through the `questions` array.
- Render UI controls based on each question `answer_type`.
- Apply conditional visibility logic using `parent_question_id` and `prerequisite_condition`.

## Rendering Rules by `answer_type`

- `TEXT` -> render text input component
- `BOOLEAN` -> render checkbox/toggle component
- `PHOTO` -> render camera/upload button component
- `NUMBER` -> render numeric input component
- `DATE` -> render date picker component

The app should be extensible so new answer types can be mapped by a single renderer registry without changing screen-level logic.

## Example Template Response

```json
{
  "success": true,
  "message": "Template fetched successfully.",
  "data": {
    "id": "TPL-GMP-001",
    "code": "GMP-WAREHOUSE-001",
    "name": "Warehouse GMP Compliance Audit",
    "version": 3,
    "status": "ACTIVE",
    "metadata": {
      "domain": "quality",
      "industry": "pharma",
      "language": "en",
      "timezone": "UTC",
      "created_by": "system",
      "tags": ["gmp", "warehouse", "cold-chain"]
    },
    "scoring": {
      "enabled": true,
      "max_score": 100,
      "pass_threshold": 85
    },
    "sections": [
      {
        "id": "SEC-GEN",
        "title": "General Information",
        "order": 1
      },
      {
        "id": "SEC-TEMP",
        "title": "Temperature Control",
        "order": 2
      }
    ],
    "questions": [
      {
        "id": "Q-001",
        "section_id": "SEC-GEN",
        "order": 1,
        "question_text": "Inspector full name",
        "answer_type": "TEXT",
        "required": true,
        "parent_question_id": null,
        "prerequisite_condition": null,
        "validation": {
          "min_length": 2,
          "max_length": 120
        }
      },
      {
        "id": "Q-003",
        "section_id": "SEC-TEMP",
        "order": 2,
        "question_text": "Is there a cold room on site?",
        "answer_type": "BOOLEAN",
        "required": true,
        "parent_question_id": null,
        "prerequisite_condition": null
      },
      {
        "id": "Q-004",
        "section_id": "SEC-TEMP",
        "order": 3,
        "question_text": "Cold room temperature (in Celsius)",
        "answer_type": "NUMBER",
        "required": true,
        "parent_question_id": "Q-003",
        "prerequisite_condition": {
          "operator": "EQUALS",
          "value": true
        },
        "validation": {
          "min": -30,
          "max": 12
        }
      },
      {
        "id": "Q-005",
        "section_id": "SEC-TEMP",
        "order": 4,
        "question_text": "Attach a photo of the thermometer display",
        "answer_type": "PHOTO",
        "required": false,
        "parent_question_id": "Q-003",
        "prerequisite_condition": {
          "operator": "EQUALS",
          "value": true
        },
        "media": {
          "min_photos": 1,
          "max_photos": 3
        }
      }
    ],
    "updated_at": "2026-04-22T00:00:00.000Z"
  }
}
```

## Conditional Logic: `parent_question_id` + `prerequisite_condition`

Frontend visibility rules must be evaluated at runtime.

### Rule Model

- `parent_question_id`: references the controlling question.
- `prerequisite_condition`: defines when current question is visible.

Example:

- Question `Q-004` is shown only if answer of `Q-003` equals `true`.
- Question `Q-005` is shown only if answer of `Q-003` equals `true`.

### Suggested Frontend Logic

1. Build an answer map keyed by question id.
2. For each question:
   - If `parent_question_id` is null, render directly.
   - Otherwise evaluate `prerequisite_condition` against parent answer.
3. Render only when condition passes.
4. Recompute visibility whenever parent answers change.

## Mandatory Frontend Requirement

Mobile and Web apps MUST NOT hardcode audit forms or fixed screens per template.

They MUST:

- Fetch template by id.
- Dynamically iterate through `questions`.
- Select input component by `answer_type`.
- Evaluate and apply conditional logic from schema data.

This is required to support multi-tenant, multi-domain template evolution without releasing new app versions for each template change.

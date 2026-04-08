# n8n Operating Model

Mission Control should treat n8n as a local automation layer for both project work and business workflows, not as a replacement backend.

## Roles

- Mission Control is the source of truth for project context, docs, quests, notes, reports, and session briefs.
- n8n is the orchestration layer for repeatable automation, both technical and operational.
- Codex/OpenClaw remain the implementation layer inside the IDE and local workspace.

## Required Setup

1. Set `OPENCLAW_AUTOMATION_TOKEN` in the Mission Control `.env` file.
2. Set `MISSION_CONTROL_BASE_URL` so n8n can call Mission Control by absolute URL.
3. Set `N8N_BASE_URL` and optionally `N8N_WEBHOOK_BASE_URL` and `N8N_API_KEY` in Mission Control.
4. Restart Mission Control after changing `.env`.
5. In n8n, send the token through the `x-openclaw-automation-token` header.
6. Select the target project with either:
   - `projectId` query param
   - `x-openclaw-project` header

## Core Endpoints

### Build Session Brief

`GET /api/automation/session-brief`

Query params:

- `projectId`
- `focusType=workspace|quest_focus|doc_focus|graph_focus`
- `focusId`
- `format=json|markdown|handoff`

What it returns:

- full context pack JSON
- prompt-pack markdown
- session handoff markdown
- automation hints for follow-up calls

Use this before starting IDE work or when a workflow needs fresh project context.

### Write Automation Report

`POST /api/automation/reports`

Payload:

```json
{
  "title": "Daily workspace review",
  "content": "Mission Control scanned the workspace and found two stale quests.",
  "category": "maintenance",
  "status": "info",
  "source": "n8n",
  "topics": ["automation", "n8n"],
  "metadata": {
    "workflow": "daily-review"
  }
}
```

Use this when n8n finishes a durable task and you want the result to appear in Reports and context files.

### Create Automation Quest

`POST /api/automation/quests`

Payload:

```json
{
  "goal": "Create the first active n8n workflow and replace the placeholder automation token.",
  "difficulty": "normal",
  "source": "n8n",
  "topics": ["n8n", "automation"],
  "metadata": {
    "workflow": "setup-followup"
  }
}
```

Use this when an automation identifies a next action that should land in the Quest queue instead of only being written as a report.

### Inspect n8n Connection

`GET /api/automation/n8n/status`

What it returns:

- current n8n connectivity summary
- whether Mission Control can reach the local n8n instance
- active workflow count when `N8N_API_KEY` is configured
- the exact Mission Control endpoints n8n should call

## Recommended Workflows

### 0. OpenClaw Router

Goal: let OpenClaw send one local payload to n8n and have n8n route it into Mission Control as either a Quest or a Report.

Live workflow:

- n8n workflow name: `Mission Control - OpenClaw Router`
- webhook path: `POST /webhook/mission-control/openclaw-router`
- patch script: `C:\Users\User\.openclaw\workspace\patch_n8n.ps1`

Payload shape:

```json
{
  "text": "quest: wire the first OpenClaw to n8n workflow",
  "projectId": "mission-control",
  "source": "openclaw",
  "topics": ["n8n", "automation"]
}
```

Supported fields:

- `text`: required input text
- `projectId`: optional, defaults to `mission-control`
- `source`: optional, defaults to `openclaw`
- `action`: optional explicit route, one of `quest` or `report`
- `title`: optional title override for report mode
- `category`: optional report category
- `status`: optional report status
- `topics`: optional string array used for graph topics and report/quest organization

Routing rules:

- `action=report` forces report mode
- `action=quest` forces quest mode
- text starting with `report:`, `log:`, `summary:`, or `status:` becomes a Report
- text starting with `quest:`, `task:`, `todo:`, or `follow-up:` becomes a Quest
- otherwise it defaults to a Quest

Current Mission Control write targets:

- Quest mode -> `POST /api/automation/quests`
- Report mode -> `POST /api/automation/reports`

### 1. Session Brief Webhook

Goal: fetch a fresh prompt pack for Codex/OpenClaw before implementation starts.

Flow:

1. Trigger: manual webhook or chat command
2. HTTP Request: `GET /api/automation/session-brief?projectId=mission-control&focusType=workspace&format=markdown`
3. Output: send markdown back to the operator or save it to a temporary note

### 2. Daily Workspace Review

Goal: create a durable report summarizing project health once per day.

Flow:

1. Trigger: Cron
2. HTTP Request: `GET /api/automation/session-brief?projectId=mission-control`
3. Optional transform in n8n
4. HTTP Request: `POST /api/automation/reports`

Suggested report topics:

- changed files
- missing inputs from collaboration guide
- open quests
- code-intelligence gaps

### 3. Business Workflow Log

Goal: use Mission Control as the durable record for business-facing automations.

Flow:

1. Trigger: CRM event, form submission, Telegram bot, scheduler, or billing event
2. Normalize payload in n8n
3. Optionally fetch Mission Control session brief for the related project or operating area
4. Write a report to Mission Control

Examples:

- inbound lead qualification summary
- invoice or payment follow-up status
- content pipeline progress
- customer support handoff notes
- sales or operations daily digest

### 4. External Tool Handoff

Goal: record what happened outside the IDE so later sessions inherit it.

Flow:

1. Trigger: webhook, Telegram, or another local tool
2. Normalize payload in n8n
3. HTTP Request: `POST /api/automation/reports`

Examples:

- test lab output
- deployment notes
- sync/import results
- local watchdog alerts

### 5. Outbound n8n Webhook Flow

Goal: let Mission Control-aware tools call into business or operational workflows in n8n.

Use cases:

- trigger a local business workflow after a report is created
- kick off a review pipeline when a Prompt Pack is generated
- launch customer or ops automation from a stable local webhook

## Rules

- Keep automations local-first.
- Never move core app logic into n8n.
- Use Reports for durable automation outcomes.
- Use Quests for automation-generated follow-up actions.
- Use Session Brief for IDE bootstrap, not long-term memory.
- If a workflow changes project decisions, update Docs as a separate step.
- Keep business automations and code/project automations separate by workflow naming and tags.
- Add 1-3 stable `topics` to quests and reports so the project graph stays clean.
- Prefer explicit reports over silent automation side effects.

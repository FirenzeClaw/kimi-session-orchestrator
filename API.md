# Kimi Server REST API 接口文档

> 版本: 0.20.1 | 自动提取自 kimi-openapi.json

## GET /api/v1/healthz

**Health check**

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| ok | boolean |  |

---

## GET /api/v1/meta

**meta · Get server metadata**

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| server_version | string |  |
| capabilities | object |  |
| server_id | string |  |
| started_at |  |  |
| open_in_apps | array |  |

---

## GET /api/v1/auth

**auth · Get server auth readiness snapshot**

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| ready | boolean |  |
| providers_count | integer |  |
| default_model | string |  |
| managed_provider | object |  |

---

## GET /api/v1/config

**config · Get the global Kimi configuration (secrets redacted)**

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| providers | object |  |
| default_provider | string |  |
| default_model | string |  |
| models | object |  |
| thinking |  |  |
| plan_mode | boolean |  |
| yolo | boolean |  |
| default_thinking | boolean |  |
| default_permission_mode | string |  |
| default_plan_mode | boolean |  |
| permission |  |  |
| hooks | array |  |
| services |  |  |
| merge_all_available_skills | boolean |  |
| extra_skill_dirs | array |  |
| loop_control |  |  |
| background |  |  |
| experimental | object |  |
| telemetry | boolean |  |
| raw | object |  |

---

## POST /api/v1/config

**config · Update the global Kimi configuration (merge semantics)**

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| providers | object | 否 |  |
| default_provider | string | 否 |  |
| default_model | string | 否 |  |
| models | object | 否 |  |
| thinking | object | 否 |  |
| plan_mode | boolean | 否 |  |
| yolo | boolean | 否 |  |
| default_thinking | boolean | 否 |  |
| default_permission_mode | string | 否 |  |
| default_plan_mode | boolean | 否 |  |
| permission | object | 否 |  |
| hooks | array | 否 |  |
| services | object | 否 |  |
| merge_all_available_skills | boolean | 否 |  |
| extra_skill_dirs | array | 否 |  |
| loop_control | object | 否 |  |
| background | object | 否 |  |
| experimental | object | 否 |  |
| telemetry | boolean | 否 |  |

---

## GET /api/v1/connections

**connections · List active WebSocket clients connected to the server**

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| connections | array |  |

---

## POST /api/v1/oauth/login

**auth · Start an OAuth device-code flow**

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| provider | string minLen=1 | 否 |  |

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| flow_id | string |  |
| provider | string |  |
| verification_uri | string |  |
| verification_uri_complete | string |  |
| user_code | string |  |
| expires_in | integer |  |
| interval | integer |  |
| status | `pending` |  |
| expires_at |  |  |

---

## GET /api/v1/oauth/login

**auth · Poll the current OAuth device-code flow**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| provider | query | 否 | string |  |

### 响应 data 字段

---

## DELETE /api/v1/oauth/login

**auth · Cancel the current OAuth device-code flow**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| provider | query | 否 | string |  |

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| cancelled | boolean |  |
| status | `pending` | `authenticated` | `denied` | `expired` | `cancelled` |  |

---

## POST /api/v1/oauth/logout

**auth · Logout the managed OAuth provider**

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| provider | string minLen=1 | 否 |  |

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| logged_out | `true` |  |
| provider | string |  |

---

## GET /api/v1/models

**models · List configured model aliases**

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| items | array |  |

---

## POST /api/v1/models/{tail}

**models · Set the global default model alias**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| tail | path | 是 | string |  |

---

## GET /api/v1/providers

**providers · List configured providers**

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| items | array |  |

---

## POST /api/v1/providers{refresh_oauth}

**providers · Refresh OAuth-backed provider model metadata**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| refresh_oauth | path | 是 | string |  |

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| changed | array |  |
| unchanged | array |  |
| failed | array |  |

---

## GET /api/v1/providers/{provider_id}

**providers · Get a configured provider by ID**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| provider_id | path | 是 | string |  |

---

## POST /api/v1/sessions

**sessions · Create a new session**

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string minLen=1 | 否 |  |
| metadata | object | 否 |  |
| agent_config | object | 否 |  |
| workspace_id | string | 否 |  |

---

## GET /api/v1/sessions

**sessions · List sessions**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| before_id | query | 否 | string |  |
| after_id | query | 否 | string |  |
| page_size | query | 否 | integer |  |
| status | query | 否 | string |  |
| include_archive | query | 是 | boolean |  |
| workspace_id | query | 否 | string |  |

---

## GET /api/v1/sessions/{session_id}

**sessions · Get a session by ID**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |

---

## GET /api/v1/sessions/{session_id}/profile

**sessions · Get session profile**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |

---

## POST /api/v1/sessions/{session_id}/profile

**sessions · Update session profile (title, metadata, agent_config)**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string minLen=1 | 否 |  |
| metadata | object | 否 |  |
| agent_config | object | 否 |  |
| permission_rules | array | 否 |  |

---

## GET /api/v1/sessions/{session_id}/children

**sessions · List child sessions**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| before_id | query | 否 | string |  |
| after_id | query | 否 | string |  |
| page_size | query | 否 | integer |  |
| status | query | 否 | string |  |
| session_id | path | 是 | string |  |

---

## POST /api/v1/sessions/{session_id}/children

**sessions · Create a child session**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string minLen=1 | 否 |  |
| metadata | object | 否 |  |

---

## GET /api/v1/sessions/{session_id}/status

**sessions · Get realtime session status**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |

---

## GET /api/v1/sessions/{session_id}/warnings

**sessions · Get session-level warnings (e.g. oversized AGENTS.md)**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |

---

## POST /api/v1/shutdown

**meta · Gracefully shut down the server and terminate its process**

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| ok | `true` |  |

---

## GET /api/v1/sessions/{session_id}/snapshot

**sessions · Atomic session snapshot for client rebuild: state + as_of_seq watermark + epoch**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| as_of_seq | integer |  |
| epoch | string |  |
| session | object |  |
| messages | object |  |
| in_flight_turn | object |  |
| pending_approvals | array |  |
| pending_questions | array |  |

---

## GET /api/v1/sessions/{session_id}/messages

**messages · List messages for a session**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| before_id | query | 否 | string |  |
| after_id | query | 否 | string |  |
| page_size | query | 否 | integer |  |
| role | query | 否 | string |  |
| session_id | path | 是 | string |  |

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| items | array |  |
| has_more | boolean |  |

---

## GET /api/v1/sessions/{session_id}/messages/{message_id}

**messages · Get a message by ID**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |
| message_id | path | 是 | string |  |

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string |  |
| session_id | string |  |
| role | `user` | `assistant` | `tool` | `system` |  |
| content | array |  |
| created_at |  |  |
| prompt_id | string |  |
| parent_message_id | string |  |
| metadata | object |  |

---

## GET /api/v1/sessions/{session_id}/prompts

**prompts · List the active prompt and queued prompts for a session**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |

---

## POST /api/v1/sessions/{session_id}/prompts

**prompts · Submit a prompt to a session**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| content | array min=1 | 是 |  |
| metadata | object | 否 |  |
| agent_id | string minLen=1 | 否 |  |
| model | string minLen=1 | 否 |  |
| thinking | `off` | `low` | `medium` | `high` | `xhigh` | `max` | 否 |  |
| permission_mode | `manual` | `yolo` | `auto` | 否 |  |
| plan_mode | boolean | 否 |  |
| swarm_mode | boolean | 否 |  |
| goal_objective | string | 否 |  |
| goal_control | `pause` | `resume` | `cancel` | 否 |  |

---

## POST /api/v1/sessions/{session_id}/prompts:steer

**prompts · Steer queued prompts into the active turn**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| prompt_ids | array min=1 | 是 |  |

---

## POST /api/v1/sessions/{session_id}/prompts/{tail}

**prompts · Abort a running prompt or steer a queued prompt**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |
| tail | path | 是 | string |  |

---

## GET /api/v1/sessions/{session_id}/approvals

**approvals · List pending approval requests for a session**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| status | query | 是 | string |  |
| session_id | path | 是 | string |  |

---

## POST /api/v1/sessions/{session_id}/approvals/{approval_id}

**approvals · Resolve an approval request**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |
| approval_id | path | 是 | string |  |

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| decision | `approved` | `rejected` | `cancelled` | 是 |  |
| scope | `session` | 否 |  |
| feedback | string | 否 |  |
| selected_label | string | 否 |  |

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| resolved | `true` |  |
| resolved_at |  |  |

---

## GET /api/v1/sessions/{session_id}/questions

**questions · List pending questions for a session**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| status | query | 是 | string |  |
| session_id | path | 是 | string |  |

---

## POST /api/v1/sessions/{session_id}/questions/{tail}

**questions · Resolve or dismiss a question Resolve uses the question response body; `:dismiss` sends an empty body.**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |
| tail | path | 是 | string |  |

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| answers | object | 是 |  |
| method | `enter` | `space` | `number_key` | `click` | 否 |  |
| note | string | 否 |  |

---

## GET /api/v1/tools

**tools · List available tools**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | query | 否 | string |  |

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| tools | array |  |

---

## GET /api/v1/mcp/servers

**tools · List configured MCP servers**

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| servers | array |  |

---

## POST /api/v1/mcp/servers/{tail}

**tools · Restart an MCP server by ID**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| tail | path | 是 | string |  |

---

## GET /api/v1/sessions/{session_id}/skills

**skills · List the skills available to a session**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |

---

## POST /api/v1/sessions/{session_id}/skills/{tail}

**skills · Activate a skill in a session (REST analogue of the /<skill> slash command)**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |
| tail | path | 是 | string |  |

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| args | string | 否 |  |

---

## GET /api/v1/sessions/{session_id}/tasks

**tasks · List background tasks for a session**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| status | query | 否 | string |  |
| session_id | path | 是 | string |  |

---

## GET /api/v1/sessions/{session_id}/tasks/{task_id}

**tasks · Get a background task by ID**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| with_output | query | 否 | boolean |  |
| output_bytes | query | 否 | integer |  |
| session_id | path | 是 | string |  |
| task_id | path | 是 | string |  |

---

## POST /api/v1/sessions/{session_id}/tasks/{tail}

**tasks · Cancel a background task**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |
| tail | path | 是 | string |  |

---

## GET /api/v1/sessions/{session_id}/terminals

**terminals · List terminals for a session**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |

---

## POST /api/v1/sessions/{session_id}/terminals

**terminals · Create a terminal for a session**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| cwd | string minLen=1 | 否 |  |
| shell | string minLen=1 | 否 |  |
| cols | integer | 否 |  |
| rows | integer | 否 |  |

---

## GET /api/v1/sessions/{session_id}/terminals/{terminal_id}

**terminals · Get a terminal by ID**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |
| terminal_id | path | 是 | string |  |

---

## POST /api/v1/sessions/{session_id}/terminals/{tail}

**terminals · Close a terminal**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |
| tail | path | 是 | string |  |

---

## POST /api/v1/sessions/{session_id}/{tail}

**fs · Filesystem action dispatcher. Supported actions: list, read, list_many, stat, stat_many, mkdir, search, grep, git_status, diff, open, reveal. The request and response schemas depend on the `fs:<action>` path tail and are represented as OpenAPI `oneOf` unions.**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |
| tail | path | 是 | string |  |

---

## GET /api/v1/sessions/{session_id}/fs/{*}

**fs · Download a file from the session workspace**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |
| * | path | 是 | string |  |

---

## POST /api/v1/files

**files · Upload a file**

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string |  |
| name | string |  |
| media_type | string |  |
| size | integer |  |
| created_at |  |  |
| expires_at |  |  |

---

## GET /api/v1/files/{file_id}

**files · Download a file by ID**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| file_id | path | 是 | string |  |

---

## DELETE /api/v1/files/{file_id}

**files · Delete a file by ID**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| file_id | path | 是 | string |  |

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| deleted | `true` |  |

---

## GET /api/v1/workspaces

**workspaces · List registered workspaces**

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| items | array |  |

---

## POST /api/v1/workspaces

**workspaces · Register a workspace (idempotent on root)**

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| root | string minLen=1 | 是 |  |
| name | string minLen=1 | 否 |  |

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string |  |
| root | string |  |
| name | string |  |
| is_git_repo | boolean |  |
| branch | string |  |
| created_at |  |  |
| last_opened_at |  |  |
| session_count | integer |  |

---

## PATCH /api/v1/workspaces/{workspace_id}

**workspaces · Rename a workspace (display name only)**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| workspace_id | path | 是 | string |  |

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string minLen=1 | 是 |  |

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string |  |
| root | string |  |
| name | string |  |
| is_git_repo | boolean |  |
| branch | string |  |
| created_at |  |  |
| last_opened_at |  |  |
| session_count | integer |  |

---

## DELETE /api/v1/workspaces/{workspace_id}

**workspaces · Unregister a workspace (does not remove on-disk content)**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| workspace_id | path | 是 | string |  |

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| deleted | `true` |  |

---

## GET /api/v1/fs:browse

**workspaces · Browse local directories (server folder picker backend)**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| path | query | 否 | string |  |

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| path | string |  |
| parent | string |  |
| entries | array |  |

---

## GET /api/v1/fs:home

**workspaces · Folder picker landing payload: $HOME + recent workspace roots**

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| home | string |  |
| recent_roots | array |  |

---

## GET /asyncapi.json

****

---

## GET /openapi.json

****

---

## GET /

****

---

## GET /{*}

****

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| * | path | 是 | string |  |

---

## POST /api/v1/sessions/{session_id}:fork

**sessions · Run a session action**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string minLen=1 | 否 |  |
| metadata | object | 否 |  |
| instruction | string | 否 |  |
| count | integer | 否 |  |
| page_size | integer | 否 |  |

---

## POST /api/v1/sessions/{session_id}:compact

**sessions · Run a session action**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string minLen=1 | 否 |  |
| metadata | object | 否 |  |
| instruction | string | 否 |  |
| count | integer | 否 |  |
| page_size | integer | 否 |  |

---

## POST /api/v1/sessions/{session_id}:undo

**sessions · Run a session action**

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| session_id | path | 是 | string |  |

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| count | integer | 否 |  |
| page_size | integer | 否 |  |

### 响应 data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| messages | object |  |
| status | object |  |

---

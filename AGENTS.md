# Crew Editor — Agent Instructions

## Что это

Визуальный редактор для CrewAI Flow (наш RouterFlow). Форк crew_editor, переделанный под Flow-архитектуру.

## Где что лежит

- **Код:** `/home/sintez/crew-editor/`
- **Документация:** AGENTS.md, ARCHITECTURE.md, TASKS.md
- **Прод-версия:** `http://sintez.local:8999/` (собирается и деплоится через systemd)
- **Оригинал:** `https://github.com/glenwrhodes/crew_editor`
- **Наш форк:** `https://github.com/akrhin/crew-editor` (origin)

## Что нужно знать

### Текущая архитектура (обычный Crew — agents/tasks)
- `AgentNode.tsx` — узел агента (role, goal, backstory, tools)
- `TaskNode.tsx` — узел задачи (description, expected_output)
- `BeginNode.tsx` — точка входа
- `RerouteNode.tsx` — перенаправление

### Что надо сделать (CrewAI Flow — @start/@listen/@router)
Нужно добавить новые типы нод:

| Тип | Что делает | Поля |
|-----|-----------|------|
| **StartNode** | `@start()` | method_name |
| **ListenNode** | `@listen(event)` | method_name, event_names[] |
| **RouterNode** | `@router(method)` | method_name, events[] (исходящие) |
| **AgentNode** | привязка тулзов к методу | role, goal, backstory, tools, llm |

### Event-based рёбра
В отличие от оригинала (source→target = assignment), в Flow связь = event-name:
- Ребро с меткой `"sage"` = `classify_request → @listen("sage")`
- Ребро с меткой `or_(["approved","blocked","escalated"])` = множественный триггер
- Ребро от Agent к методу = привязка тулзов

### Генерация Python
Вместо `@CrewBase` → `persist(flow_persistence)`, `Flow[RouterState]`:
```python
@persist(flow_persistence)
class RouterFlow(Flow[RouterState]):
    @start()
    def receive_query(self): ...
    
    @listen("builder")
    def builder_plan(self) -> str:
        agent = Agent(role=..., goal=..., ...)
        return _kickoff(agent, ...)
```

### MCP сервера доступные агентам
Через `_get_base_mcps()` — context7, siyuan, portainer, serena (условно).
gbrain — только через `@tool` обёртки (GBRAIN_TOOLS_*).

### Память
`_AGENT_MEMORIES["sage"]`, `_AGENT_MEMORIES["builder"]` и т.д. — изолированные scopes.

## Важные ограничения
1. НЕ переписывай export.ts целиком — добавляй `generateFlowPython()` рядом с существующими функциями
2. НЕ трогай функционал обычных Crew — он должен остаться рабочим
3. НЕ создавай новые тест-файлы — фикси только баги
4. После каждого изменения — `npm run build` и проверка `http://sintez.local:8999/`
5. Коммиты в `origin/main`, пушить после каждой завершённой задачи
6. Если не уверен в подходе — спроси в чате

## Сборка и деплой
```bash
npm install          # зависимости (один раз)
npm run build        # сборка → dist/
./deploy.sh          # копирование в ~/.hermes/local-docs/ + systemctl restart hermes-docs
```

## CI
GitHub Actions (оригинал) — деплой на gh-pages. В форке пока нет CI.

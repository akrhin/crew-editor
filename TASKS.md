# TASKS — Crew Editor Flow Edition

План разработки форка. Задачи выполняются по порядку.
Статус: `[ ]` — ожидает, `[→]` — в работе, `[✓]` — готово.

---

## Фаза 1: Базовый Flow-редактор

Цель: добавить Start/Listen/Router ноды на канвас, базовая PropertiesPanel.

### [ ] 1.1 Новые типы (types.ts)
- Добавить `FlowNodeType`: `'start' | 'listen' | 'router' | 'legacy_begin' | 'legacy_agent' | 'legacy_task' | 'legacy_reroute'`
- Добавить `FlowMethodData`: method_name, node_type, listen_events[], router_events[], agent (AgentData?)
- Добавить `FlowEdgeData`: event_names[], condition_type ('single' | 'or_' | 'and_')
- Обновить `migrateNodeData()` — преобразование legacy нод в новые типы

**Check:** `npm run build` проходит

### [ ] 1.2 StartNode
- Копия BeginNode, но:
  - Заголовок: `@start`
  - Поле: method_name (редактируется)
  - Цвет: зелёный
  - Только один выход (right handle)
- **Файл:** `src/components/nodes/StartNode.tsx`

**Check:** Можно добавить на канвас, отредактировать method_name

### [ ] 1.3 ListenNode
- Аналог TaskNode, но:
  - Заголовок: `@listen(event)`
  - Поля: method_name, event_names[] (редактируемый список строк)
  - Входы: left handle (1)
  - Выходы: right handle (1)
  - Цвет: синий
- **Файл:** `src/components/nodes/ListenNode.tsx`
- **Поля в PropertiesPanel:** method_name, event_names (chips/tags input)

**Check:** Можно добавить, ввести method_name и event_name

### [ ] 1.4 RouterNode
- Аналог ListenNode, но:
  - Заголовок: `@router`
  - Поля: method_name, outgoing_events[] (события, которые эмитит)
  - Выходы: по одному на каждое событие (right handles, динамические)
  - Цвет: оранжевый
- **Файл:** `src/components/nodes/RouterNode.tsx`
- **Поля в PropertiesPanel:** method_name, outgoing_events

**Check:** Можно добавить, указать события, увидеть динамические выходы

### [ ] 1.5 PropertiesPanel — Flow-режим
- При выборе Start/Listen/Router ноды — показывать соответствующие поля
- Для ListenNode: method_name + event_names (chips input)
- Для RouterNode: method_name + outgoing_events
- Функция `debouncedSync()` — сохранять изменения немедленно
- **Файл:** `src/components/PropertiesPanel.tsx`

**Check:** Клик по ноде — панель показывает её поля. Изменение — нода обновляется

### [ ] 1.6 Sidebar — секция Flow
- Добавить секцию "Flow" в Sidebar:
  - Start Node (зелёный)
  - Listen Node (синий)
  - Router Node (оранжевый)
- Legacy секция "Crew" остаётся (Begin, Agent, Task)
- **Файл:** `src/components/Sidebar.tsx`

**Check:** Все 3 новых ноды можно перетащить на канвас

### [ ] 1.7 Event-based рёбра
- При соединении RouterNode → ListenNode:
  - Запрашивать event_name (модалка или inline ввод)
  - Сохранять в `EdgeData.event_names[]`
  - На ребре отображать метку с event_name
- При соединении с condition_type='or_':
  - Поддерживать `or_(["event1", "event2"])` — множественные события
- **Файлы:** `App.tsx` (логика соединения), `types.ts` (EdgeData)

**Check:** Соединение нод — появление метки на ребре

---

## Фаза 2: Экспорт в Python Flow

### [ ] 2.1 generateFlowPython()
- Новая функция в `export.ts` (не трогать существующую)
- Генерирует:
  ```python
  @persist(flow_persistence)
  class FlowName(Flow[RouterState]):
      @start()
      def method_name(self): ...
      
      @listen("event_name")
      def method_name(self) -> str:
          agent = Agent(role=..., goal=..., ...)
          return _kickoff(agent, ...)
  ```
- Учитывает: импорты из gbrain_tools, shell_tools, persona_tools
- MCP: `_get_base_mcps()` (не MCPServerAdapter)

**Файл:** `src/utils/export.ts`
**Check:** `generateFlowPython()` возвращает валидный Python код

### [ ] 2.2 Экспорт в UI
- Добавить кнопку "Flow Python" в ExportModal
- Отдельная вкладка от YAML и обычного Python
- **Файл:** `src/components/modals/ExportModal.tsx`

**Check:** Кнопка есть, экспорт работает

---

## Фаза 3: Импорт, Backend, Docker

### [ ] 3.1 Import — парсинг main.py → граф
- Загрузка существующего main.py → парсинг → граф
- AST-парсинг: найти `@start`, `@listen`, `@router`, Agent constructs
- Восстановить весь граф с event-ребрами

### [✓] 3.2 FastAPI бэкенд
- Сохранение/загрузка графов (JSON → файл)
- API: POST /save, GET /load, GET /list
- Сохранение истории (опционально)

### [✓] 3.3 Docker
- Dockerfile: nginx + статика
- docker-compose.yml
- Заменить systemd на compose

---

## Фаза 4: gbrain + доработки

### [ ] 4.1 Заливка документации в gbrain
- ARCHITECTURE.md, AGENTS.md, TASKS.md уже в gbrain

### [ ] 4.2 Улучшения
- Undo/Redo для Flow-нод
- Поиск по нодам
- Валидация графа (нет ли циклов, все ли события резолвятся)
- Экспорт в gbrain как версия конфига

---

## Текущий прогресс

| Задача | Статус | Когда |
|--------|--------|-------|
| 1.1 types.ts | [✓] | 26 июл |
| 1.2 StartNode | [✓] | 26 июл |
| 1.3 ListenNode | [✓] | 26 июл |
| 1.4 RouterNode | [✓] | 26 июл |
| 1.5 PropertiesPanel | [ ] | — |
| 1.6 Sidebar | [ ] | — |
| 1.7 Event-based рёбра | [ ] | — |
| 2.1 export.ts | [ ] | — |
| 2.2 ExportModal | [ ] | — |
| 3.1 Import | [ ] | — |
| 3.2 Backend | [✓] | 27 июл |
| 3.3 Docker | [✓] | 27 июл |
| 4.1 gbrain | [ ] | — |

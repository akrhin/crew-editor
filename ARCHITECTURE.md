# Crew Editor — Flow Edition

Форк [glenwrhodes/crew_editor](https://github.com/glenwrhodes/crew_editor) — визуальный редактор CrewAI Flow.

## Что это

React Flow редактор для CrewAI Flow-based архитектуры (`@start/@listen/@router`). 
Позволяет визуально проектировать pipeline, редактировать агентов и экспортировать в Python код.

## Архитектура

```
crew-editor/
├── src/
│   ├── types.ts              # Типы: FlowMethodData, NodeType, event-ребра
│   ├── components/
│   │   ├── nodes/
│   │   │   ├── StartNode.tsx      # @start() — точка входа
│   │   │   ├── ListenNode.tsx     # @listen(event)
│   │   │   ├── RouterNode.tsx     # @router(method)
│   │   │   └── AgentNode.tsx      # Agent(role, goal, tools...)
│   │   ├── PropertiesPanel.tsx    # Редактор выбранной ноды
│   │   ├── Sidebar.tsx           # Drag-and-drop палитра
│   │   └── Toolbar.tsx           # Export/Save/Load
│   └── utils/
│       ├── export.ts             # Генерация Python Flow-кода
│       └── templates.ts          # Шаблоны 
├── TASKS.md                     # Текущий план работ
└── AGENTS.md                    # Инструкции для CrewAI агентов
```

## Связь с оригиналом

Оригинал делает editors для обычных Crew (agents + tasks + sequential).
Форк переделывает под Flow: start/listen/router ноды + event-based рёбра.

## Ключевые технологии

- React + TypeScript + Vite
- React Flow (граф)
- Material-UI (компоненты)
- CrewAI SDK (кодогенерация)

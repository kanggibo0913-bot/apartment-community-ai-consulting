# AI Agent Instructions for apartment-community-ai-consulting

## Project overview
- SPA frontend MVP built with React 18, TypeScript, and Vite.
- Internal dashboard for apartment community center operations and AI consulting scenario.
- No backend or external API integration in this repository.
- State is managed locally in `src/App.tsx` and persisted to `window.localStorage` under `LOCAL_STORAGE_KEY = 'apartmentCommunityData'`.

## Key files
- `src/App.tsx` - main application container, page routing, state shape, and local storage persistence.
- `src/pages/` - nine page screens for dashboard, apartment info, facility info, operation info, cost/revenue, complaints, AI analysis, and report draft.
- `src/components/` - shared UI components: `Sidebar`, `PageHeader`, `Card`, `FormGroup`, `Button`, `StatBox`.
- `src/types/CommunityData.ts` - shared domain types for the app state.
- `vite.config.ts` - Vite config, development server opens on port `5173`.
- `package.json` - install/build/dev/lint scripts.
- `README.md` - project goals, feature summary, and setup instructions.

## Agent guidance
- Prefer changes that keep the repository small and dependency-light.
- Use existing plain CSS styling rather than introducing a new UI framework unless there is a strong need.
- Preserve the current file structure: components under `src/components`, pages under `src/pages`, and shared types under `src/types`.
- Keep React components functional with hooks; the codebase uses `useState` and `useEffect` only.
- Do not assume there is a backend or database; persistence is currently client-side only.
- For bug fixes or enhancements, update the relevant page component and, when needed, the shared types in `src/types/CommunityData.ts`.

## Useful commands
- `npm install`
- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run lint`

## Known constraints
- No test framework is configured in this repository.
- There is no authentication or authorization logic present.
- The current UI is intended as an MVP and focuses on data input + display flows.

## When to ask for clarification
- If a change requires backend API design or external data integration.
- If a request would add global state management beyond `useState`/`useEffect`.
- If the feature request suggests a large dependency jump (for example, adding chart or data libraries).

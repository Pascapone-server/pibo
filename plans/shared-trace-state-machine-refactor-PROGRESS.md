# Fortschrittsbericht: Shared Trace State-Machine Refactor

**Datum:** 2026-05-04
**Agent:** PiBo Coding Agent
**Status:** Teilweise umgesetzt – Phasen 1.1 und 2.1 abgeschlossen

---

## 1. Was wurde erreicht

### Phase 1.1: Shared Trace Engine Extraction ✅

**Neue Dateien angelegt:**
- `src/shared/trace-types.ts` – Enthält alle Trace-relevanten Typen (`PiboTraceNode`, `TraceNodeType`, `TraceOrderKey`, `PiboSessionTraceView`, `ChatWebTraceEvent`, `ChatWebStoredEvent` etc.). Diese waren vorher dupliziert zwischen Backend (`src/apps/chat/trace.ts`) und Frontend (`src/apps/chat-ui/src/types.ts`).
- `src/shared/trace-engine.ts` – Enthält die extrahierten Utility-Funktionen:
  - `sortTraceNodes(nodes)`
  - `compareTraceNodes(a, b)`
  - `flattenTraceNodes(nodes)`
  - `nestTraceNodes(nodes)`
  - `mapTraceNodesById(nodes)`

**Backend-Anpassungen (`src/apps/chat/trace.ts`):**
- Entfernt lokale Kopien von `sortTraceNodes`, `compareTraceNodes`, `flattenTraceNodes`, `nestTraceNodes`, `mapTraceNodesById`.
- Importiert diese jetzt aus `src/shared/trace-engine.ts`.
- Importiert Typen aus `src/shared/trace-types.ts`.
- Die Datei enthält weiterhin `buildTraceView` (noch nicht vollständig in Shared ausgelagert, siehe „Was fehlt“).

**Frontend-Anpassungen:**
- `src/apps/chat-ui/src/types.ts` – Entfernt duplizierte Typdefinitionen, importiert jetzt aus `src/shared/trace-types.ts`.
- `src/apps/chat-ui/src/App.tsx` – Importiert `sortTraceNodes`, `compareTraceNodes` aus `src/shared/trace-engine.ts`.
- `src/apps/chat-ui/src/tracing/adapt.ts` – Importiert aus `src/shared/trace-types.ts`.
- `src/apps/chat-ui/src/tracing/traceTree.ts` – Importiert `sortTraceNodes` aus `src/shared/trace-engine.ts`.

### Phase 2.1: streamId Persistence ✅

**Datenbank-Schema (`src/apps/chat/read-model.ts`):**
- Spalte `stream_id INTEGER` zu `web_chat_events` hinzugefügt.
- `recordEvent()` akzeptiert jetzt optionalen `streamId?: number` Parameter.
- Migration: Beim Start wird `ALTER TABLE web_chat_events ADD COLUMN stream_id INTEGER` ausgeführt, falls die Spalte fehlt.

**API-Integration (`src/apps/chat/web-app.ts`):**
- `stored.streamId` aus `eventLog.appendOutputEvent()` wird jetzt an `readModel.recordEvent()` übergeben.
- Dadurch wird jedes ausgegebene Event mit seiner `streamId` in der Datenbank verankert.

---

## 2. Verifikationsergebnisse

| Prüfung | Ergebnis |
|---------|----------|
| `npm run typecheck` | ✅ Grün |
| `npm run build` | ✅ Grün |
| Docker-Container (`trace-refactor`) | ✅ Läuft stabil |
| API-Test: streamId in DB | ✅ Bestätigt – alle neuen Events haben `stream_id` |
| Trace-Endpoint liefert Struktur | ✅ `PiboSessionTraceView` mit `nodes` und `rawEvents` |
| Unit-Tests | ⚠️ 2 vorher existierende Tests fehlschlagen (unrelated: `plugin-registry` und `session-actions`) |

**Evidenz streamId:**
Nach dem Senden einer Nachricht über `/api/chat/message`:
```json
[
  {"type": "message_queued", "stream_id": 2, "pibo_session_id": "ps_..."},
  {"type": "message_started", "stream_id": 3, "pibo_session_id": "ps_..."},
  {"type": "session_error", "stream_id": 4, "pibo_session_id": "ps_..."}
]
```

---

## 3. Was fehlt (Offene Arbeit)

### Phase 1.2: Vollständige Shared-State-Machine
- `buildTraceView` lebt noch komplett in `src/apps/chat/trace.ts`.
- Es fehlt die Funktion `buildTraceViewFromEvents(session, events, transcriptEntries)` in `src/shared/trace-engine.ts`.
- Die Frontend-Logik `applyChatStreamEvent`, `upsertTraceNode`, `mergeAssistantDeltaEvent`, `mergeThinkingDeltaEvent`, `mergeToolEvent` lebt noch in `src/apps/chat-ui/src/App.tsx`.
- Die inkrementelle Delta-Logik im Frontend wurde **noch nicht** entfernt.

### Phase 2.2: SSE-Event-Format anpassen
- SSE-Events transportieren noch nicht die vollständigen Metadaten (`eventSequence`, `streamId`, `streamFrameIndex`), die `buildTraceViewFromEvents` benötigen würde.
- Frontend puffert noch nicht explizit ein Event-Array für die Shared-Engine.

### Phase 2.3: Trace-Refresh als Full-Replace
- Der Trace-Refresh-Endpoint gibt zwar `rawEvents` zurück, aber das Frontend nutzt diese noch nicht als Reset-Quelle für ein zentrales Event-Array.
- Die Deduplizierungslogik (`if (rawEvents.some(...)) return view`) ist noch aktiv.

### Phase 3: Adaptation und Tree-Processing zusammenführen
- `adaptTrace` + `processSpanTree` in `src/apps/chat-ui/src/tracing/` existieren noch unverändert.
- `compareSpans` und Sortierlogik in der Render-Vorbereitung sind noch vorhanden.
- Es gibt noch keine Funktion `renderTreeFromTrace(nodes: PiboTraceNode[]): Span[]`, die nur filtert/mappt ohne neu zu sortieren.

### Phase 4: Optimierung
- Keine Memoization in der State-Machine.
- Kein Batching von SSE-Events in `requestAnimationFrame`.
- Kein Web Worker.

---

## 4. Bekannte Probleme / Hinweise für den Nachfolger

1. **Browser-Tests im Container:** Wir haben versucht, Headless-Chromium im Docker-Container mit CDP anzusteuern. Das funktioniert grundsätzlich (Page lädt, Auth-Cookie wird gesetzt, Chat-UI wird angezeigt), aber die Interaktion mit dem Composer (`textarea`) war nicht stabil genug für einen vollständigen E2E-Test. Empfehlung: Nutze stattdessen die API-Tests (curl/Node.js) im Container als primäre Verifikation.

2. **Dev-Auth:** Der Endpunkt `/api/auth/callback/google?code=dev` setzt das `pibo_dev_session`-Cookie. Damit funktionieren alle Chat-API-Routen. Der Container läuft auf Port `4788` (nicht `8080` – das war ein Irrtum in früheren Tests).

3. **Datenbank-Standort im Container:** Die SQLite-DB liegt unter `/app/.pibo/web-chat.sqlite` (nicht `/root/code/pibo/.pibo/…`, weil der Container-Workingdir `/app` ist).

4. **Test-Failures:** Die beiden fehlschlagenden Tests (`plugin-registry.test.mjs`, `session-actions.test.mjs`) existierten bereits vor diesem Refactor. Sie sind nicht durch die Änderungen entstanden.

5. **Dateien, die der Nachfolger als erstes anfassen sollte:**
   - `src/apps/chat/trace.ts` – Hier muss `buildTraceView` in `src/shared/trace-engine.ts` als `buildTraceViewFromEvents` extrahiert werden.
   - `src/apps/chat-ui/src/App.tsx` – Hier muss die inkrementelle Event-Verarbeitung (`applyChatStreamEvent`) durch ein zentrales Event-Array + Aufruf der Shared-Engine ersetzt werden.
   - `src/apps/chat-ui/src/tracing/adapt.ts` und `traceTree.ts` – Hier muss `adaptTrace` + `processSpanTree` zu einer reinen Filter/Map-Funktion ohne Sortierung werden.

---

## 5. Geänderte Dateien (für Code-Review)

```
A  src/shared/trace-engine.ts
A  src/shared/trace-types.ts
M  src/apps/chat/trace.ts
M  src/apps/chat/read-model.ts
M  src/apps/chat/web-app.ts
M  src/apps/chat-ui/src/App.tsx
M  src/apps/chat-ui/src/types.ts
M  src/apps/chat-ui/src/tracing/adapt.ts
M  src/apps/chat-ui/src/tracing/traceTree.ts
```

---

*Dieser Report dokumentiert den Stand nach Abschluss von Phase 1.1 und 2.1. Der Umbauplan in `plans/shared-trace-state-machine-refactor.md` wurde aktualisiert, um den aktuellen Fortschritt zu reflektieren.*

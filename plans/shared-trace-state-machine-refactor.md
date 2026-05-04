# Umbauplan: Shared Trace State-Machine

**Datum:** 2026-05-04
**Status:** Teilweise umgesetzt – Phase 1.1 und 2.1 abgeschlossen
**Letzter Agent:** PiBo Coding Agent
**Fortschrittsbericht:** `plans/shared-trace-state-machine-refactor-PROGRESS.md`

---

## 0. Wichtig: Aktueller Stand für den Nachfolger

**Was bereits funktioniert:**
- `src/shared/trace-types.ts` und `src/shared/trace-engine.ts` existieren und werden von Backend und Frontend importiert.
- `streamId` wird in `web_chat_events` persistiert (Migration läuft automatisch).
- `npm run typecheck` und `npm run build` sind grün.
- Docker-Container `trace-refactor` läuft und ist testbar.

**Was als nächstes gemacht werden muss:**
1. `buildTraceView` aus `src/apps/chat/trace.ts` in `src/shared/trace-engine.ts` als `buildTraceViewFromEvents` extrahieren.
2. Die Frontend-Delta-Logik (`applyChatStreamEvent`, `upsertTraceNode`, etc.) in `App.tsx` durch ein zentrales Event-Array + Aufruf der Shared-Engine ersetzen.
3. `adaptTrace` + `processSpanTree` zu einer reinen Filter/Map-Funktion ohne Sortierung umbauen.

---

## 1. Ist-Zustand

```
Schicht 1: Backend    buildTraceView()          → PiboTraceNode[]
Schicht 2: API        GET /api/chat/trace       → Transport
Schicht 3: Frontend   applyChatStreamEvent()    → inkrementelles Patching + eigene sortTraceNodes()
Schicht 4: Frontend   adaptTrace() + processSpanTree() → Span[] + zweite Sortierung
Schicht 5: Frontend   flattenVisibleSpans() + Virtuoso → DOM
```

**Probleme:**
- `compareTraceNodes` existiert zweimal (Backend + Frontend) mit leicht unterschiedlichen Fallback-Ketten.
- `applyChatStreamEvent` implementiert inkrementelle Merge-Logik (`upsertTraceNode`), die nur lokale Ebenen neu sortiert.
- `streamId` wird in `web_chat_events` nicht persistiert → Backend-Refresh und Live-Zustand nutzen divergierende `orderKey`-Quellen.
- `adaptTrace` + `processSpanTree` sind eine zweite State-Machine mit eigener Sortierung (`compareSpans`), die auf ein anderes Datenmodell (`Span`) arbeitet.

---

## 2. Ziel-Zustand (3 Schichten)

```
Schicht A: Shared Engine    src/shared/trace-engine.ts  → PiboTraceNode[]
Schicht B: Transport        API + SSE                   → Snapshot oder Event-Log
Schicht C: Render           React / Virtuoso            → flache Liste + DOM
```

**Prinzip:**
- Die komplette Logik zum Aufbau, Sortieren und Nesten eines Trace aus einem Event-Log lebt in **einem** Modul (`src/shared/trace-engine.ts`).
- Backend und Frontend importieren und nutzen denselben Code.
- Das Frontend führt bei jedem eingehenden Event denselben `buildTraceView`-Aufruf durch wie das Backend.
- Es gibt keine inkrementelle Patch-Logik mehr. Der Input ist ein Event-Array, der Output ist eine komplette Trace-View.

---

## 3. Phasenplan

### Phase 1: Extraktion der State-Machine

#### 1.1 ✅ Shared Trace Types und Engine-Utilities
**Status:** Abgeschlossen.

- `src/shared/trace-types.ts` angelegt mit allen Shared-Typen.
- `src/shared/trace-engine.ts` angelegt mit `sortTraceNodes`, `compareTraceNodes`, `flattenTraceNodes`, `nestTraceNodes`, `mapTraceNodesById`.
- Backend (`src/apps/chat/trace.ts`) und Frontend (`src/apps/chat-ui/src/types.ts`, `App.tsx`, `tracing/adapt.ts`, `tracing/traceTree.ts`) importieren aus Shared.

#### 1.2 🔲 `buildTraceView` in Shared extrahieren
**Status:** Offen – **dies ist der nächste Schritt.**

**Ziel:** Die komplette `buildTraceView`-Logik aus `src/apps/chat/trace.ts` wandert in `src/shared/trace-engine.ts` als `buildTraceViewFromEvents`.

**Schritte:**
1. In `src/shared/trace-engine.ts` eine neue Funktion `buildTraceViewFromEvents` implementieren:
   ```ts
   export function buildTraceViewFromEvents(
     session: PiboSession,
     events: ChatWebStoredEvent[],
     transcriptEntries?: SessionEntry[],
   ): PiboSessionTraceView
   ```
   - Kopiere die Logik aus dem bestehenden `buildTraceView` in `src/apps/chat/trace.ts`.
   - Entferne Backend-spezifische Importe (z.B. `node:crypto`, `node:fs`). Akzeptiere stattdessen reine Datenstrukturen.
   - Stelle sicher, dass `compareTraceNodes` eindeutig auf `compareTraceOrder` aus `src/shared/trace-order.ts` basiert.

2. In `src/apps/chat/trace.ts`:
   - Importiere `buildTraceViewFromEvents` aus `src/shared/trace-engine.ts`.
   - Mache den lokalen `buildTraceView` zu einem dünnen Wrapper, der Session-Daten lädt und die Shared-Engine aufruft.
   - Entferne alle Funktionen, die jetzt in `src/shared/trace-engine.ts` leben.

3. **Verifikation:**
   - `npm run typecheck` muss durchlaufen.
   - Ein API-Test muss zeigen, dass `GET /api/chat/trace` identische Daten liefert wie vorher.

#### 1.3 🔲 Frontend-Delta-Logik entfernen
**Status:** Offen.

**Ziel:** Das Frontend sammelt eingehende SSE-Events in einem lokalen Array und ruft bei jedem Event `buildTraceViewFromEvents` auf.

**Schritte:**
1. In `src/apps/chat-ui/src/App.tsx`:
   - Entferne die lokalen Kopien von `applyChatStreamEvent`, `upsertTraceNode`, `mergeAssistantDeltaEvent`, `mergeThinkingDeltaEvent`, `mergeToolEvent`.
   - Führe ein neues State-Feld ein: `allEvents: ChatWebStoredEvent[]`.
   - Bei jedem eingehenden SSE-Event: hänge das Event an `allEvents` an.
   - Berechne die Trace-View mit `useMemo`:
     ```ts
     const view = useMemo(() =>
       buildTraceViewFromEvents(session, allEvents, transcriptEntries),
       [session, allEvents, transcriptEntries]
     );
     ```
   - `traceView` im State wird ersetzt durch das `useMemo`-Ergebnis.

2. **Verifikation:**
   - `npm run typecheck`.
   - API-Test mit mehreren Events in Folge muss korrekte Reihenfolge zeigen.

---

### Phase 2: Event-Transport angleichen

#### 2.1 ✅ `streamId` persistieren
**Status:** Abgeschlossen.

- `stream_id INTEGER` wurde zu `web_chat_events` hinzugefügt.
- `readModel.recordEvent()` akzeptiert optionalen `streamId`.
- Migration läuft automatisch beim Start.
- `web-app.ts` übergibt `stored.streamId` an `recordEvent()`.

#### 2.2 🔲 SSE-Event-Format anpassen
**Status:** Offen.

**Ziel:** SSE-Events transportieren die vollständigen Metadaten, die `buildTraceViewFromEvents` benötigt.

**Schritte:**
1. In `src/apps/chat/stream.ts` (oder wo SSE-Events generiert werden):
   - Stelle sicher, dass jedes SSE-Event die Felder `eventSequence`, `streamId`, `streamFrameIndex` enthält.
   - Das Frontend muss diese Metadaten nutzen, um sein `allEvents`-Array korrekt zu erweitern.

2. **Verifikation:**
   - Nach einem Stream muss `allEvents` im Frontend die gleiche Länge haben wie Events in der DB.

#### 2.3 🔲 Trace-Refresh als Full-Replace
**Status:** Offen.

**Ziel:** Bei einem Trace-Refresh setzt das Frontend sein `allEvents`-Array zurück.

**Schritte:**
1. In `src/apps/chat/web-app.ts`:
   - Der Trace-Endpoint liefert bereits `PiboSessionTraceView` inkl. `rawEvents`.
   - Prüfe, ob `rawEvents` vollständig sind (alle Events, nicht nur gefilterte).

2. In `src/apps/chat-ui/src/App.tsx`:
   - Wenn ein Trace-Refresh-Response ankommt: setze `allEvents` auf `trace.rawEvents`.
   - Entferne die Deduplizierungslogik (`if (rawEvents.some(...)) return view`).

3. **Verifikation:**
   - Nach Trace-Refresh und Live-Stream muss die Reihenfolge identisch sein.

---

### Phase 3: Zusammenführung von Adaption und Tree-Processing

#### 3.1 🔲 Kanonisches Datenmodell definieren
**Status:** Offen.

**Entscheidung:** `PiboTraceNode` bleibt das kanonische Modell. `Span` ist ein reines View-Modell. Filterregeln (`model.request` ausblenden, `agent.run`-Kinder hochziehen) sind View-Regeln und wandern in eine dünne `toSpanTree`-Funktion.

#### 3.2 🔲 `adaptTrace` + `processSpanTree` ersetzen
**Status:** Offen – **dies ist der wichtigste Schritt nach Phase 1.**

**Ziel:** Eine neue Funktion `renderTreeFromTrace(nodes)` ersetzt `adaptTrace` + `processSpanTree`.

**Schritte:**
1. Neue Funktion in `src/apps/chat-ui/src/tracing/` (z.B. `renderTree.ts`):
   ```ts
   export function renderTreeFromTrace(nodes: PiboTraceNode[]): Span[]
   ```
   - Diese Funktion macht das, was `adaptTrace` + `processSpanTree` heute tun.
   - Sie sortiert **nicht neu**. Sie vertraut darauf, dass Input-`nodes` bereits korrekt sortiert sind (von der Shared-Engine garantiert).
   - Sie filtert und mappt nur.

2. In `src/apps/chat-ui/src/tracing/traceTree.ts`:
   - Entferne `compareSpans` und jede Sortierlogik.
   - Wenn `compareSpans` noch existiert, ist das ein Bug.

3. In `src/apps/chat-ui/src/tracing/adapt.ts`:
   - Ersetze `adaptTrace` durch `renderTreeFromTrace` oder integriere es direkt.

4. **Verifikation:**
   - `npm run typecheck`.
   - Visueller Test: Tab-Wechsel, Streaming, Tool-Calls müssen ohne "Rutschen" funktionieren.

#### 3.3 🔲 Frontend-Delta-Logik vollständig entfernen
**Status:** Offen (Teil von 1.3, aber erst nach 3.2 sinnvoll).

---

### Phase 4: Optimierung

#### 4.1 🔲 Memoization innerhalb der State-Machine
**Status:** Offen.

- `buildTraceViewFromEvents` sollte intern memoizen:
  - Transcript-Einträge cachen.
  - `nestTraceNodes` und `sortTraceNodes` auf stabilen IDs arbeiten lassen.
- Optional: `TraceViewBuilder`-Klasse mit inkrementellem Update.

#### 4.2 🔲 Batching von Events
**Status:** Offen.

- SSE-Events in einen `requestAnimationFrame`-Buffer schreiben.
- Pro Frame maximal ein `buildTraceViewFromEvents`-Aufruf.

#### 4.3 🔲 Optional: Web Worker
**Status:** Offen.

- Wenn Performance bei langen Sessions (> 1000 Events) leidet, State-Machine in Web Worker auslagern.

**Verifikation:**
- Performance-Profiling: Ein `TEXT_MESSAGE_CONTENT`-Delta darf nicht mehr als 5ms Rendering-Block verursachen.

---

## 4. Dateien und ihre Zukunft

| Datei | Aktuell | Nach Umbau |
|-------|---------|------------|
| `src/shared/trace-order.ts` | `compareTraceOrder`, `liveTraceOrder` | Unverändert |
| `src/shared/trace-engine.ts` | Utilities (`sortTraceNodes`, etc.) | + `buildTraceViewFromEvents`, + ggf. `TraceViewBuilder` |
| `src/shared/trace-types.ts` | Typen | Unverändert (ggf. Erweiterungen) |
| `src/apps/chat/trace.ts` | Backend-Trace-Logik | Dünner Wrapper um `src/shared/trace-engine.ts` |
| `src/apps/chat/read-model.ts` | SQLite-Schema mit `stream_id` | Unverändert |
| `src/apps/chat/web-app.ts` | API-Endpoint | Liefert `PiboSessionTraceView` + `rawEvents` |
| `src/apps/chat/stream.ts` | SSE-Generierung | Enthält `streamId` in jedem Event |
| `src/apps/chat-ui/src/App.tsx` | `applyChatStreamEvent`, `upsertTraceNode`, eigene `sortTraceNodes` | Nur noch Event-Sammler und Aufrufer der Shared-Engine |
| `src/apps/chat-ui/src/tracing/adapt.ts` | `adaptTrace` | Wird zu `renderTreeFromTrace` oder in `traceTree.ts` integriert |
| `src/apps/chat-ui/src/tracing/traceTree.ts` | `processSpanTree`, `compareSpans` | Enthält nur noch Filter/Map-Logik, keine Sortierung |
| `src/apps/chat-ui/src/tracing/TraceTimeline.tsx` | `flattenVisibleSpans`, Virtuoso | Unverändert (nur Schicht 5) |

---

## 5. Risiken und Gegenmaßnahmen

| Risiko | Wahrscheinlichkeit | Gegenmaßnahme |
|--------|-------------------|---------------|
| **Performance-Regression** durch Full-Rebuild pro Delta | Mittel | Phase 4 (Memoization, Batching, ggf. Web Worker). Vorher Benchmark mit 500+ Events. |
| **Breaking Change** im SSE-Protokoll | Niedrig | Neue SSE-Version oder Rückwärtskompatibilität: Frontend erkennt altes Format und fällt auf alte Logik zurück (wird nach 1 Woche entfernt). |
| **Transcript-Einträge vs. Events** weiterhin inkonsistent | Mittel | `buildTraceViewFromEvents` muss die Merge-Logik exakt so implementieren, wie sie heute im Backend ist. Unit-Tests mit gespeicherten Session-Logs vorher aufzeichnen. |
| **Virtuoso-Tab-Wechsel-Bug** bleibt bestehen | Unklar | Wenn der Bug rein renderseitig war, bleibt er. Aber mit einer stabilen Daten-Ebene ist er leichter zu isolieren. |

---

## 6. Schnellstart für den Nachfolger

**Empfohlene Reihenfolge:**

1. **Lies den Fortschrittsbericht:** `plans/shared-trace-state-machine-refactor-PROGRESS.md`
2. **Baue das Projekt:** `npm run typecheck` sollte grün sein.
3. **Starte den Docker-Container:**
   ```bash
   cd ~/code/pibo
   docker build -t pibo-refactor .
   docker run -d --name trace-refactor -p 4788:4788 pibo-refactor
   ```
4. **Phase 1.2 beginnen:**
   - Öffne `src/apps/chat/trace.ts` und `src/shared/trace-engine.ts`.
   - Extrahiere `buildTraceView` in `buildTraceViewFromEvents`.
   - Führe `npm run typecheck` nach jedem Schritt.
5. **Teste mit API-Test (im Container):**
   ```bash
   docker exec trace-refactor bash -c '
     curl -s -c /tmp/cookies.txt -b /tmp/cookies.txt "http://localhost:4788/api/auth/callback/google?code=dev" > /dev/null
     SESSION=$(curl -s -b /tmp/cookies.txt "http://localhost:4788/api/chat/sessions" | node -e "const d=require("fs").readFileSync(0,"utf8");const j=JSON.parse(d);console.log(j[0]?.piboSessionId||"");")
     curl -s -b /tmp/cookies.txt -H "Content-Type: application/json" -H "Origin: http://localhost:4788" -d "{\"text\":\"hello\",\"piboSessionId\":\"$SESSION\"}" "http://localhost:4788/api/chat/message"
     curl -s -b /tmp/cookies.txt "http://localhost:4788/api/chat/trace?piboSessionId=$SESSION"
   '
   ```

---

## 7. Erfolgskriterien

- [x] `compareTraceNodes` existiert nur noch an einer Stelle im gesamten Repo.
- [ ] `buildTraceView` existiert nur noch in `src/shared/trace-engine.ts`.
- [ ] `applyChatStreamEvent`, `upsertTraceNode`, `mergeAssistantDeltaEvent` sind aus `App.tsx` entfernt.
- [ ] `adaptTrace` + `processSpanTree` sortieren nicht neu.
- [ ] Ein Tab-Wechsel während des Streamings führt zu keiner sichtbaren Reihenfolgen-Veränderung (3/3 manuelle Tests).
- [ ] Ein Trace-Refresh während des Streamings führt zu keinem "Rutschen" (3/3 manuelle Tests).
- [x] `npm run typecheck` ist grün.
- [ ] Ein Chat mit > 500 Events zeigt keine spürbare Performance-Degeneration beim Streaming.

---

*Plan aktualisiert auf Basis des Fortschrittsberichts vom 2026-05-04.*

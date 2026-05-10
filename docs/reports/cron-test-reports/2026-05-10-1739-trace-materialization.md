# Trace-Materialisierung und Live-Patching Test Review

Datum: 2026-05-10 17:39 Europe/Berlin  
Bereich: Chat-Web-Trace-Materialisierung, Trace-Versionierung und Live-Patching-Identität

## Untersuchte Dateien

- `GLOSSARY.md`
- `package.json`
- `test/chat-trace-materialization.test.mjs`
- `test/trace-patch-identity.test.mjs`
- `src/shared/trace-engine.ts`
- `src/shared/trace-order.ts`
- `src/apps/chat/trace.ts`
- `src/apps/chat-ui/src/traceLiveReducer.ts`
- Ausschnitt aus `src/apps/chat-ui/src/App.tsx` über Trace-Query-/Live-Overlay-Nutzung per `rg`

## Ausgeführter begrenzter Check

```bash
node --test test/chat-trace-materialization.test.mjs test/trace-patch-identity.test.mjs
```

Ergebnis: 8 Tests bestanden in ca. 1,21 s. Kein Komplettlauf, weil der Lauf gezielt die Trace-Materialisierung und das Live-Patching bewertet; Build-, Gateway- und Browser-Suites wären dafür zu breit.

## Was bereits gut funktioniert

- `test/chat-trace-materialization.test.mjs` prüft zwei wichtige Produktentscheidungen: Raw Events sind standardmäßig nicht im Trace-Payload enthalten, und ein explizit angeforderter Raw-Event-Tail ist begrenzt. Das schützt gegen große Response-Payloads.
- Die Versionierungs-Tests in derselben Datei decken relevante Cache-Invalidierungsquellen ab: Transcript-Metadaten sowie Änderungen an Child-/Origin-Sessions.
- `test/trace-patch-identity.test.mjs` ist ein gutes Beispiel für ein sehr granuläres Frontend-Performance-Subset: Es prüft nicht nur fachlichen Output, sondern auch Objektidentität unveränderter Trace-Nodes. Das passt direkt zu React-Rendering- und Virtualisierungskosten.
- `src/shared/trace-engine.ts` bündelt Build- und Patch-Logik in einer gemeinsamen Engine. Dadurch lassen sich Node-Tests ohne Browser starten und trotzdem zentrale UI-Annahmen absichern.
- `src/apps/chat-ui/src/traceLiveReducer.ts` trennt Stream-Event-Normalisierung von der eigentlichen Trace-Engine. Das ist eine gute Schnittstelle für kleine Reducer-Tests.

## Schwächen und Risiken

1. **Die vorhandenen Tests importieren `dist` statt Source.**  
   Beide Testdateien importieren aus `../dist/...`. Als Paket-Smoke ist das sinnvoll; als Entwicklungs-Subset kann es aber Source-Änderungen verdecken, wenn vorher kein Build gelaufen ist. Für Trace-Arbeit sollte klar zwischen `npm run build && node --test ...` und schnellen Source-nahen Tests unterschieden werden.

2. **Trace-Order-Regeln sind kaum direkt getestet.**  
   `src/shared/trace-order.ts` definiert Source-Ranks, Phase-Ranks und Vergleichslogik für Transcript-, Event-Log- und Live-Nodes. Die aktuellen Tests beobachten Ordnung nur indirekt über einfache Node-Listen. Risiko: Änderungen an `compareTraceOrder()` oder `TRACE_PHASE_RANK` können UI-Reihenfolge, Terminal-Ansicht und Trace-Timeline verschieben, ohne dass die kleinen Tests anschlagen.

3. **Live-Reducer ist trotz eigener Datei ungetestet.**  
   `applyTraceLiveEvents()` normalisiert `RAW_EVENT`, Text-/Reasoning-Deltas, Tool-Starts, Tool-Args und Tool-Results. Außerdem ersetzt finale Assistant-/Thinking-/Tool-Finished-Events passende Delta-/Update-Events. Diese Logik ist für flüssige Live-Anzeige kritisch, wird aber in den untersuchten Tests nicht direkt ausgeführt.

4. **Dedupe-Strategien sind verteilt und nur punktuell abgesichert.**  
   `patchTraceViewWithEvent()` dedupliziert über Raw-Events, während `traceLiveReducer.ts` Stream-Events über `streamId` oder Event-ID dedupliziert. Es gibt einen guten Test für doppelte Raw Events, aber keine Matrix für Stream-ID-Duplikate, fehlende `streamFrameId`s oder gleiche IDs mit unterschiedlichen Eventtypen.

5. **Transcript/Event-Echo-Vermeidung ist nicht granular sichtbar.**  
   `buildTraceViewFromEvents()` hat Schutzlogik gegen Transcript-Echo-Events und stale Tool-Call-Echos, sobald persistierte Transcript-Einträge existieren. Die aktuellen Tests erzeugen keine Transcript-Einträge. Das ist ein Risiko, weil doppelte Assistant-/Tool-Nodes in der UI oft erst in längeren realen Sessions sichtbar werden.

6. **Versionierung betrachtet nur den Event-Tail.**  
   `createTraceViewVersion()` verwendet bei Events nur letzte Sequence, letztes `createdAt` und `latestStreamId`. Das ist wahrscheinlich bewusst für Cache-Effizienz, sollte aber mit Tests gegen zwei Fälle abgesichert werden: ältere History wird nachgeladen und `includeRawEvents`/Limit-Parameter ändern die Page-Darstellung, ohne dass die Basisversion missverstanden wird.

## Fehlende oder anzupassende Tests

### 1. Schmale Trace-Order-Suite

Empfohlen: `test/trace-order.test.mjs`.

Fälle:

- Transcript-Nodes sortieren vor Event-Log-Nodes, Event-Log vor Live-Nodes.
- Innerhalb eines Turns kommt `user.message` vor `agent.turn`, Reasoning, Tool und Assistant.
- `streamId` und `streamFrameIndex` bestimmen Live-Reihenfolge deterministisch.
- Nodes ohne Zeit oder Order-Key fallen stabil auf ID-Sortierung zurück.

### 2. Live-Reducer-Suite

Empfohlen: `test/trace-live-reducer.test.mjs` oder ein Source-nahes Frontend-Unit-Subset.

Fälle:

- `TEXT_MESSAGE_CONTENT` erzeugt `assistant_delta` mit `assistantIndex` aus `messageId`.
- `REASONING_MESSAGE_CONTENT` erzeugt `thinking_delta` mit `thinkingIndex`.
- Finales `assistant_message` entfernt passende `assistant_delta`-Events, aber nicht Deltas anderer Runs oder anderer Content-Indizes.
- `tool_execution_finished` entfernt passende `tool_execution_updated`-Events für denselben `toolCallId`.
- Doppelte Stream-Frames werden über `streamId`/Typ dedupliziert.

### 3. Transcript/Echo-Materialisierung

Empfohlen: `test/trace-transcript-echo.test.mjs`.

Fälle:

- Persistierte Assistant-Transcript-Einträge plus `assistant_message`-Echo erzeugen keinen doppelten Assistant-Node.
- Offener laufender Turn darf passende Deltas behalten, solange der Transcript-Eintrag noch nicht final ist.
- Tool-Call-Echos werden bei persistiertem Transcript nicht doppelt dargestellt.
- Finaler Fehler schließt den passenden Agent-Turn über `turnClosedAt()`.

### 4. Versionierungs- und Page-Parameter-Klarheit

Empfohlen: vorhandene `test/chat-trace-materialization.test.mjs` erweitern, aber klein halten.

Fälle:

- Änderung von `latestStreamId` ändert die Version.
- Änderung eines älteren Events ohne Tail-Änderung ändert die Version nicht; falls das bewusst ist, sollte der Test diese Annahme dokumentieren.
- Raw-Event-Limit beeinflusst nur die zurückgegebene Page, nicht die semantische Trace-Version.

## Empfohlene granulare Test-Kommandos/Subsets

Aktuell als schneller, post-build-orientierter Trace-Smoke:

```bash
node --test test/chat-trace-materialization.test.mjs test/trace-patch-identity.test.mjs
```

Sicherer bei Source-Änderungen, weil die vorhandenen Tests `dist` importieren:

```bash
npm run build && node --test test/chat-trace-materialization.test.mjs test/trace-patch-identity.test.mjs
```

Nach vorgeschlagener Aufteilung als Entwicklungs-Subsets:

```bash
node --test test/trace-order.test.mjs
node --test test/trace-live-reducer.test.mjs
node --test test/trace-transcript-echo.test.mjs
```

Vor UI-/Trace-Deployment, aber noch ohne Browser-E2E:

```bash
npm run build && node --test \
  test/chat-trace-materialization.test.mjs \
  test/trace-patch-identity.test.mjs \
  test/chat-ui-integration.test.mjs
```

## Konkrete nächste Schritte

1. `traceLiveReducer.ts` mit einer kleinen Reducer-Suite absichern. Das ist der größte unmittelbare Gewinn, weil Stream-Normalisierung und Delta-Ersetzung direkt die Live-UI betreffen.
2. Danach `trace-order.test.mjs` ergänzen, damit Änderungen an `TRACE_PHASE_RANK` oder `compareTraceOrder()` nicht zufällig UI-Reihenfolgen brechen.
3. Transcript/Echo-Fälle separat testen, statt sie in breite Chat-UI-Integration zu packen. Diese Fälle erklären reale Doppelanzeige-Bugs besser als ein Browser-Test.
4. Die vorhandenen `dist`-Tests entweder ausdrücklich als Build-Smoke dokumentieren oder für schnelle Entwicklung um Source-nahe Varianten ergänzen.
5. Bei künftigen Trace-UI-Änderungen zuerst die Node-Subsets laufen lassen; Browser-Checks erst danach für Rendering, Scroll- und Layout-Fragen verwenden.

## Bewertung

Die Trace-Tests sind ungewöhnlich wertvoll, weil sie Performance-Annahmen wie Objektidentität und Payload-Begrenzung prüfen. Die größte Lücke liegt nicht in einer fehlenden großen E2E-Suite, sondern in drei kleinen Subsets: Trace-Order, Live-Reducer und Transcript/Echo-Vermeidung. Diese Subsets würden schnelle Entwicklung an Chat-Web-Traces deutlich sicherer machen.

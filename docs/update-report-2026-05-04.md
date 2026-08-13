# AMR Kachaka — Update Report
**Date:** May 4, 2026
**Branch:** main
**Commit:** `59c8f98` — "new update"

---

## 1. Task Runner Stability Fix

**Problem:** Tasks were stopping unexpectedly in the middle of execution — the robot would halt during pickup or delivery without completing the task.

**Root causes identified and fixed:**

### 1.1 Pause Race Condition
When the user paused the robot, the async `CancelCommand` call caused the robot to transition from `COMMAND_STATE_RUNNING` to `COMMAND_STATE_PENDING`. The status loop (running every 0.5s) detected this transition and incorrectly called `handleArrival()`, thinking the robot had reached its destination.

**Fix:** Set `runner.paused = true` **before** the async cancel call so the status loop skips arrival detection while a pause is in progress.

```js
// robotSocket.js
socket.on('robot:pause', async () => {
  if (runner.taskId) runner.paused = true  // set BEFORE async
  const result = await robotService.pauseRobot()
  ...
})
```

### 1.2 Command ID Watchdog
If an external command replaced the runner's active move command (e.g., accidental manual move from the UI), the task would silently stall.

**Fix:** Track `commandId` of every move command issued by the runner. If the robot's current `commandId` doesn't match for 4 consecutive ticks (~2 seconds), automatically re-issue the correct move command.

### 1.3 Arrival Detection Guard
Added `ourCommandCompleted` check to ensure `handleArrival()` only fires when the command that completed was the one the runner actually issued — not an unrelated command.

### 1.4 Block Manual Moves During Active Task
`robot:move`, `robot:dock`, `robot:undock`, and `robot:return-home` commands are now rejected with an error while a task is running. Only `pause`, `resume`, and `emergency-stop` are allowed during an active task.

---

## 2. Multi-language Support (i18n)

**New files:**
- `frontEnd/src/i18n/index.js` — translation dictionary (English / Vietnamese), 483 lines
- `frontEnd/src/composables/useI18n.js` — `useI18n()` composable with `t(key)` translation function and `setLang()`, persisted to `localStorage`

**Applied to all UI components:**
- `AppSidebar.vue`, `AppTopbar.vue`
- All views: Dashboard, Robot Status, Create Task, Task History, Logs, Settings, Shelf Management, User Management, Login, Register

Language preference is saved in the browser and restored on next visit. Changing language takes effect after clicking **Save** in Settings.

---

## 3. Remove Email from User Accounts

**Problem:** User accounts previously required an email field, which was unnecessary for this system.

**Changes:**
- `authService.js` — removed `email` from `register()`, `login()` response, and `listUsers()` query
- `db.js` — removed `email` column from the `users` table schema (new installs)
- Added automatic migration: on server startup, if the `email` column exists in an existing database it is dropped and the table is rebuilt without it

**Error message updated:** `"Username or email already exists"` → `"Username already exists"`

---

## 4. Dashboard Map Sync Fix

**Problem:** The floor map on the Dashboard showed stale location data when switching between the real robot and the mock server. Locations were only fetched once on page load and cached in `localStorage`.

**Fix:** Re-fetch locations from `GET /api/robot/locations` every time the socket connection is established (including reconnects). The cache is updated with the latest data so the map always reflects the currently connected server.

```js
// DashboardView.vue
const onConnect = async () => {
  connected.value = true
  try {
    const locRes = await getLocations()
    locations.value = locRes.data.data
    saveLocationsCache(locations.value)
  } catch {}
}
```

---

## Summary of Changed Files

| File | Change |
|------|--------|
| `backEnd/src/socket/robotSocket.js` | Task runner stability — pause fix, commandId watchdog, arrival guard, manual move block |
| `backEnd/src/services/authService.js` | Removed email field from all user operations |
| `backEnd/src/config/db.js` | Removed email column from schema + auto migration |
| `backEnd/src/routes/robot.js` | Minor updates |
| `backEnd/src/services/settingsService.js` | Minor updates |
| `backEnd/src/services/taskService.js` | Minor updates |
| `frontEnd/src/i18n/index.js` | **New** — translation dictionary (EN/VI) |
| `frontEnd/src/composables/useI18n.js` | **New** — i18n composable |
| `frontEnd/src/views/DashboardView.vue` | Map location sync on reconnect + i18n |
| `frontEnd/src/views/SettingsView.vue` | Language setting + i18n |
| `frontEnd/src/views/*.vue` (9 files) | i18n applied across all views |
| `frontEnd/src/components/AppSidebar.vue` | i18n |
| `frontEnd/src/components/AppTopbar.vue` | i18n |

---

*Report generated: 2026-05-04*

# Mudlet: Developer & Admin Guide

Welcome to the internal guide for maintaining and managing the Mudlet codebase. This document covers how to update game data, manage the server, and use administrative tools.

## 🛠️ Server Management

### Starting and Stopping
*   **Start:** Run `./start.sh` from the root directory. This clears the console and launches the Node.js server.
*   **Stop:** Run `./stop.sh`. This uses `pkill` to safely find and terminate the running server process and displays a shutdown confirmation.

### Clean Boot / Reset
To perform a fresh start of the MUD (clearing all player progress and world state):
1. Run `./stop.sh`.
2. Delete player files: `rm data/players/*.json`.
3. Delete world state: `rm data/world_state.json`.
4. Run `./start.sh`.

## 📂 Updating Game Data

All game content is defined in JSON files within the `data/` directory.

### Adding/Editing Mobs (`data/mobs/`)
*   **Fields:** `id`, `name`, `keywords`, `description`, `hp`, `level`, `damage` `[min, max]`.
*   **AI:** Hostile mobs use an `ai` array to define special behaviors (`heal`, `drain_stamina`, `drain_mp`, `buff_dmg`).
*   **Bosses:** Set `"isBoss": true` for global victory announcements and special attack patterns.
*   **NPCs:** Set `"isNpc": true` to prevent players from attacking them. Humanoid characters should always be NPCs.

### Adding/Editing Items (`data/items/`)
*   **Types:** `weapon`, `armor`, `consumable`, `item`.
*   **Slots:** Equipment must specify a `slot` (`head`, `body`, `arms`, `legs`, `feet`, `hands`, `main_hand`, `off_hand`).
*   **Stats:** Weapons use `damage: [min, max]`, Armor uses `ac: value`, Consumables use `effect` (`heal`, `food`, `drink`) and `value`.

### Quests (`data/quests/`)
*   Define quests with a unique `id`, `type` (`kill` or `fetch`), `targetId`, and `required` count.
*   Link quests to NPCs by adding `"givesQuest": "quest_id"` to the mob template.

## ⚡ Administrative Controls

Admins are defined in `config/settings.js` under the `ADMINS` array.

| Command | Usage | Description |
| :--- | :--- | :--- |
| `teleport` | `teleport <room_id>` | Warp yourself to any room. |
| `teleport` | `teleport <player> <room_id>` | Warp another player to a room. |
| `spawn` | `spawn <mob_id>` | Create a mob instance in your current room. |
| `kick` | `kick <player>` | Disconnect a player immediately. |
| `ban` | `ban <player>` | Prevent a player from ever logging in again. |
| `shutdown` | `shutdown` | Save all world state and kill the server process. |

## ⚖️ Economy & Balance
*   **Gold Drops:** Controlled by `MOB_GOLD_MULTIPLIER` in `config/settings.js`. Currently tuned low to make equipment purchases feel significant.
*   **Regeneration:** HP/MP regeneration is halved. Stamina **only** recharges when a player is in the `RESTING` or `SLEEPING` state.

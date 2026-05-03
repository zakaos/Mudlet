require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const CONFIG = require('../config/settings');
console.log("DEBUG: CONFIG loaded:", CONFIG ? "YES" : "NO");
console.log("DEBUG: CONFIG.GAME_DATA_DIR:", CONFIG.GAME_DATA_DIR);
const commands = require('./commands');
const PORT = CONFIG.PORT;

const rooms = {};
const itemTemplates = {};
const mobTemplates = {};
const questTemplates = {};
const players = new Map();
const activeMobs = [];
const activeCorpses = [];
const deathQueue = [];
let bans = [];

// --- HELPERS ---
function loadBans() {
    console.log("DEBUG: loadBans called, GAME_DATA_DIR is:", CONFIG.GAME_DATA_DIR);
    const bPath = path.join(CONFIG.GAME_DATA_DIR, 'bans.json');
    if (fs.existsSync(bPath)) {
        try {
            bans = JSON.parse(fs.readFileSync(bPath));
        } catch (e) {
            console.error("Error loading bans:", e);
            bans = [];
        }
    }
}

function saveBans() {
    const bPath = path.join(CONFIG.DATA_DIR, 'bans.json');
    fs.writeFileSync(bPath, JSON.stringify(bans, null, 2));
}

function saveWorldState() {
    const state = {
        roomItems: {},
        activeCorpses: activeCorpses.map(c => ({
            ...c,
            // Don't save circular or unnecessary data if any
        }))
    };
    Object.keys(rooms).forEach(roomId => {
        if (rooms[roomId].items && rooms[roomId].items.length > 0) {
            state.roomItems[roomId] = rooms[roomId].items;
        }
    });
    const wPath = path.join(CONFIG.DATA_DIR, 'world_state.json');
    fs.writeFileSync(wPath, JSON.stringify(state, null, 2));
}

function loadWorldState() {
    const wPath = path.join(CONFIG.DATA_DIR, 'world_state.json');
    if (fs.existsSync(wPath)) {
        try {
            const state = JSON.parse(fs.readFileSync(wPath));
            if (state.roomItems) {
                Object.keys(state.roomItems).forEach(roomId => {
                    if (rooms[roomId]) rooms[roomId].items = state.roomItems[roomId];
                });
            }
            if (state.activeCorpses) {
                state.activeCorpses.forEach(c => activeCorpses.push(c));
            }
        } catch (e) {
            console.error("Error loading world state:", e);
        }
    }
}

function broadcast(msg) {
    players.forEach((p, ws) => {
        commands.sendTo(ws, `\n{bold}{M}[WORLD EVENT]{x} ${msg}\n`);
    });
}

function getStatBonus(stat) {
    if (stat <= 3) return -3;
    if (stat <= 5) return -2;
    if (stat <= 8) return -1;
    if (stat <= 12) return 0;
    if (stat <= 15) return 1;
    if (stat <= 17) return 2;
    return 3;
}

function roll3d6() {
    return Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
}

// --- DATA PERSISTENCE ---
function sanitizePlayer(player) {
    const classData = CONFIG.CLASSES[player.class] || CONFIG.CLASSES.coder;
    const sanitized = {
        username: player.username,
        password: player.password,
        class: player.class || 'coder',
        level: player.level || 1,
        exp: player.exp || 0,
        gold: player.gold || 0,
        tp: player.tp || 0,
        roomId: player.roomId || CONFIG.STARTING_ROOM,
        hp: player.hp !== undefined ? player.hp : classData.hp,
        maxHp: player.maxHp || classData.hp,
        mp: player.mp !== undefined ? player.mp : classData.mp,
        maxMp: player.maxMp || classData.mp,
        stamina: player.stamina !== undefined ? player.stamina : 100,
        hunger: player.hunger !== undefined ? player.hunger : 100,
        thirst: player.thirst !== undefined ? player.thirst : 100,
        inventory: Array.isArray(player.inventory) ? player.inventory : [],
        equipment: player.equipment || {},
        abilities: Array.isArray(player.abilities) ? player.abilities.map(a => typeof a === 'object' ? a.id : a) : [],
        intellect: player.intellect || classData.intellect,
        speed: player.speed || classData.speed,
        creativity: player.creativity || classData.creativity,
        endurance: player.endurance || classData.endurance,
        quests: Array.isArray(player.quests) ? player.quests : [],
        party: player.party || null,
        state: player.state || 'standing'
    };
    return sanitized;
}

async function loadPlayer(username) {
    const pPath = path.join(CONFIG.DATA_DIR, 'players', `${username}.json`);
    if (fs.existsSync(pPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(pPath));
            return sanitizePlayer(data);
        } catch (e) {
            console.error(`Error loading player ${username}:`, e);
            return null;
        }
    }
    return null;
}

function savePlayer(player) {
    const data = { ...player };
    delete data.ws;
    delete data.fighting;
    
    // Ensure we don't save any other objects that might have circular refs
    // and keep the file clean.
    const cleanData = sanitizePlayer(data);
    
    const pPath = path.join(CONFIG.DATA_DIR, 'players', `${player.username}.json`);
    const pDir = path.dirname(pPath);
    if (!fs.existsSync(pDir)) fs.mkdirSync(pDir, { recursive: true });
    fs.writeFileSync(pPath, JSON.stringify(cleanData, null, 2));
}

// --- WORLD INITIALIZATION ---
function loadData() {
    loadBans();
    ['rooms', 'items', 'mobs', 'quests'].forEach(type => {
        const dir = path.join(CONFIG.GAME_DATA_DIR, type);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.readdirSync(dir).forEach(file => {
            if (file.endsWith('.json')) {
                const data = JSON.parse(fs.readFileSync(path.join(dir, file)));
                if (type === 'rooms') rooms[data.id] = { mobs: [], items: [], ...data };
                if (type === 'items') itemTemplates[data.id] = data;
                if (type === 'mobs') mobTemplates[data.id] = data;
                if (type === 'quests') questTemplates[data.id] = data;
            }
        });
    });
    loadWorldState();
    Object.values(rooms).forEach(room => {
        if (room.mobs && Array.isArray(room.mobs)) {
            const templates = [...room.mobs];
            room.mobs = [];
            templates.forEach(tId => spawnMob(tId, room.id));
        }
    });
}

// Save world state every 5 minutes
setInterval(saveWorldState, 300000);

function spawnMob(templateId, roomId) {
    const template = mobTemplates[templateId];
    if (!template) return;
    const mob = {
        ...template,
        instanceId: Math.random().toString(36).substr(2, 9),
        currentHp: template.hp,
        roomId: roomId,
        fighting: null
    };
    activeMobs.push(mob);
}

// --- GAME LOOPS ---
// Player Combat Loop (Players attack Mobs)
setInterval(() => {
    players.forEach((p, ws) => {
        if (p.fighting) {
            const mob = p.fighting;
            if (mob.roomId !== p.roomId || mob.currentHp <= 0) {
                p.fighting = null;
                return;
            }
            const classData = CONFIG.CLASSES[p.class] || CONFIG.CLASSES.coder;
            const primaryStat = classData.primary || 'intellect';
            const statBonus = getStatBonus(p[primaryStat] || 10);
            const creativeBonus = Math.floor((p.creativity || 10) / 3); // Creativity bonus
            
            // Calculate Player Damage
            let weaponDmg = [0, 5]; // Base unarmed damage
            Object.values(p.equipment || {}).forEach(itemId => {
                const item = itemTemplates[itemId];
                if (item && item.type === 'weapon' && item.damage) {
                    weaponDmg = item.damage;
                }
            });
            
            let dmg = Math.max(1, Math.floor(Math.random() * (weaponDmg[1] - weaponDmg[0] + 1)) + weaponDmg[0] + statBonus + creativeBonus);
            
            // Stamina modifier
            if (p.stamina < 20) {
                dmg = Math.floor(dmg * 0.8);
            } else if (p.stamina >= 80) {
                dmg = Math.floor(dmg * 1.1);
            }
            
            mob.currentHp -= dmg;
            p.stamina = Math.max(0, p.stamina - 2); // Combat consumes stamina
            
            commands.sendTo(ws, `You hit ${mob.name} for {Y}${dmg}{x} damage! (Bonus: ${statBonus + creativeBonus})`);
            
            // Set mob target if it doesn't have one or if we just hit it
            mob.fighting = p;

            if (mob.currentHp <= 0) handleMobDeath(mob, ws);
        }
    });
}, CONFIG.COMBAT_TICK_RATE);

// Mob Combat Loop (Mobs attack Players independently)
setInterval(() => {
    activeMobs.forEach(mob => {
        if (mob.fighting && mob.currentHp > 0) {
            const p = mob.fighting;
            // Check if player is still there and alive
            if (p.roomId !== mob.roomId || p.hp <= -10 || !p.ws || p.ws.readyState !== 1) {
                mob.fighting = null;
                return;
            }

            // Calculate Player AC & Speed Dodge
            let totalAc = 0;
            let dodgeChance = (p.speed >= 15) ? 0.20 : 0; 
            Object.values(p.equipment || {}).forEach(itemId => {
                const item = itemTemplates[itemId];
                if (item && item.ac) totalAc += item.ac;
            });

            // Check dodge
            if (Math.random() < dodgeChance) {
                commands.sendTo(p.ws, `{G}You expertly dodged ${mob.name}'s attack!{x}`);
            } else {
                // Advanced AI Behaviors (30% chance to use an AI ability instead of basic attack)
                if (mob.ai && Array.isArray(mob.ai) && Math.random() < 0.3) {
                    const behavior = mob.ai[Math.floor(Math.random() * mob.ai.length)];
                    
                    if (behavior.type === 'heal' && mob.currentHp < mob.hp * 0.4) {
                        const healVal = behavior.value || Math.floor(mob.hp * 0.15);
                        mob.currentHp = Math.min(mob.hp, mob.currentHp + healVal);
                        commands.sendTo(p.ws, `{M}${mob.name} ${behavior.msg || "refactors its code, recovering health!"} (+${healVal} HP){x}`);
                        return;
                    }
                    if (behavior.type === 'drain_stamina') {
                        const drain = behavior.value || 15;
                        p.stamina = Math.max(0, p.stamina - drain);
                        commands.sendTo(p.ws, `{R}${mob.name} ${behavior.msg || "drains your energy!"} (-${drain} Stamina){x}`);
                        return;
                    }
                    if (behavior.type === 'drain_mp') {
                        const drain = behavior.value || 15;
                        p.mp = Math.max(0, p.mp - drain);
                        commands.sendTo(p.ws, `{R}${mob.name} ${behavior.msg || "disrupts your focus!"} (-${drain} MP){x}`);
                        return;
                    }
                    if (behavior.type === 'buff_dmg') {
                        mob.dmgBuff = (mob.dmgBuff || 0) + (behavior.value || 2);
                        commands.sendTo(p.ws, `{R}${mob.name} ${behavior.msg || "goes into an overclocked state!"} (Damage Increased!){x}`);
                        return;
                    }
                }

                let mobDmgRange = mob.damage || [1, 3];
                let attackMsg = `{R}${mob.name} hits you for {dmg} damage!{x}`;

                // 20% chance for special attack if mob has them
                if (mob.specialAttacks && Math.random() < 0.2) {
                    const spec = mob.specialAttacks[Math.floor(Math.random() * mob.specialAttacks.length)];
                    mobDmgRange = spec.damage;
                    attackMsg = `{R}${mob.name} ${spec.msg} for {dmg} damage!{x}`;
                }

                const rawMobDmg = Math.floor(Math.random() * (mobDmgRange[1]-mobDmgRange[0]+1)) + mobDmgRange[0] + (mob.dmgBuff || 0);
                let mobDmg = Math.max(1, rawMobDmg - Math.floor(totalAc / 2));
                
                // Stamina damage taken modifier
                if (p.stamina < 20) {
                    mobDmg = Math.floor(mobDmg * 1.2);
                }
                
                p.hp -= mobDmg;
                commands.sendTo(p.ws, attackMsg.replace('{dmg}', mobDmg) + (totalAc > 0 ? ` (AC blocked ${rawMobDmg - mobDmg})` : ""));
                if (p.hp <= 0) handlePlayerDeath(p);
            }
        }
    });
}, CONFIG.COMBAT_TICK_RATE);

setInterval(() => {
    players.forEach(p => {
        // Depletion
        p.hunger = Math.max(0, p.hunger - 1);
        p.thirst = Math.max(0, p.thirst - 1);
        
        // Hunger/Thirst Damage over time
        if (p.hunger === 0 || p.thirst === 0) {
            p.hp = Math.max(-10, p.hp - 5);
            commands.sendTo(p.ws, "{R}You are starving or dehydrated and losing HP!{x}");
            if (p.hp <= 0) handlePlayerDeath(p);
        }

        // Regeneration factor
        let regenFactor = 1;
        if (p.hunger > 80 && p.thirst > 80) regenFactor = 2;
        else if (p.hunger < 20 || p.thirst < 20) regenFactor = 0.5;

        if (!p.fighting) {
            const hpRegen = Math.floor(2 * regenFactor);
            const mpRegen = Math.floor(2 * regenFactor);
            let changed = false;
            
            if (hpRegen > 0 && p.hp < p.maxHp) {
                p.hp = Math.min(p.maxHp, p.hp + hpRegen);
                changed = true;
            }
            if (mpRegen > 0 && p.mp < p.maxMp) {
                p.mp = Math.min(p.maxMp, p.mp + mpRegen);
                changed = true;
            }
            
            // Stamina ONLY recharges via resting/sleeping
            if (p.state === 'resting') {
                const stRegen = Math.floor(10 * regenFactor);
                p.stamina = Math.min(100, p.stamina + stRegen);
                changed = true;
            } else if (p.state === 'sleeping') {
                const stRegen = Math.floor(20 * regenFactor);
                p.stamina = Math.min(100, p.stamina + stRegen);
                const sleepExtraHp = Math.floor(3 * regenFactor);
                p.hp = Math.min(p.maxHp, p.hp + sleepExtraHp);
                changed = true;
            }
            
            if (changed) {
                commands.sendPrompt(p.ws, p);
            }
        }
    });
    const now = Date.now();
    for (let i = deathQueue.length - 1; i >= 0; i--) {
        if (now >= deathQueue[i].respawnTime) {
            spawnMob(deathQueue[i].templateId, deathQueue[i].roomId);
            deathQueue.splice(i, 1);
        }
    }
    for (let i = activeCorpses.length - 1; i >= 0; i--) {
        const decayTime = activeCorpses[i].type === 'player' ? 300000 : 120000;
        if (now - activeCorpses[i].timestamp > decayTime) activeCorpses.splice(i, 1);
    }
}, CONFIG.REGEN_TICK_RATE);

function checkLevelUp(p) {
    const nextLevelXp = p.level * p.level * CONFIG.LEVEL_XP_BASE;
    if (p.exp >= nextLevelXp) {
        p.level++;
        const hpGain = Math.floor(Math.random() * 8) + 1;
        const mpGain = Math.floor(Math.random() * 5) + 1;
        p.maxHp += hpGain; p.maxMp += mpGain; p.hp = p.maxHp; p.tp += 1;
        commands.sendTo(p.ws, `\n{bold}{G}*** YOU HAVE LEVELED UP TO LEVEL ${p.level}! ***{x}\n`);
        commands.sendTo(p.ws, `{G}You gained ${hpGain} HP and ${mpGain} MP!{x}\n`);
        savePlayer(p);
    }
}

function handleMobDeath(mob, ws) {
    const p = players.get(ws);
    commands.sendTo(ws, `{G}You defeated ${mob.name}!{x}`);
    
    // Quest Progress
    if (p.quests && p.quests.length > 0) {
        p.quests.forEach(q => {
            if (q.type === 'kill' && q.targetId === mob.id) {
                q.current = Math.min(q.required, q.current + 1);
                if (q.current >= q.required) {
                    commands.sendTo(ws, `{G}Quest progress updated: ${q.name} (${q.current}/${q.required}) - Ready to complete!{x}`);
                } else {
                    commands.sendTo(ws, `{G}Quest progress updated: ${q.name} (${q.current}/${q.required}){x}`);
                }
            }
        });
    }

    if (mob.isBoss) {
        broadcast(`{G}${p.username} has conquered ${mob.name}! The codebase is slightly more stable... for now.{x}`);
    }

    let xp = (mob.level || 1) * CONFIG.MOB_EXP_MULTIPLIER;
    let gold = (mob.level || 1) * CONFIG.MOB_GOLD_MULTIPLIER;

    // Party Reward Sharing
    if (p.party) {
        const partyMembers = Array.from(players.values()).filter(other => other.party === p.party && other.roomId === p.roomId);
        if (partyMembers.length > 1) {
            xp = Math.floor(xp / partyMembers.length);
            gold = Math.floor(gold / partyMembers.length);
            partyMembers.forEach(member => {
                if (member !== p) {
                   member.exp += xp;
                   member.gold += gold;
                   commands.sendTo(member.ws, `{G}Party Reward: You gain ${xp} EXP and {Y}${gold} gold{x} from ${mob.name}'s defeat!`);
                   checkLevelUp(member);
                }
            });
        }
    }

    p.exp += xp;
    p.gold += gold;
    commands.sendTo(ws, `You gain ${xp} EXP and {Y}${gold} gold{x}.`);
    checkLevelUp(p);

    activeCorpses.push({ 
        name: mob.name, 
        roomId: mob.roomId, 
        timestamp: Date.now(), 
        items: mob.drops || [], 
        gold: Math.floor(gold / 2),
        type: 'mob' 
    });
    
    const mobIndex = activeMobs.indexOf(mob);
    if (mobIndex !== -1) {
        activeMobs.splice(mobIndex, 1);
    }
    
    deathQueue.push({ templateId: mob.id, roomId: mob.roomId, respawnTime: Date.now() + CONFIG.MOB_RESPAWN_DELAY });
    p.fighting = null;
    savePlayer(p);
}

function handlePlayerDeath(p) {
    if (!p) return;
    
    if (p.ws) {
        commands.sendTo(p.ws, "{bold}{R}YOU HAVE BEEN DEFEATED!{x}\nYour digital essence flickers and you lose your belongings...");
        
        // Ensure equipment and inventory are initialized
        p.inventory = p.inventory || [];
        p.equipment = p.equipment || {};

        // Create player corpse with inventory and equipment
        const corpseItems = [...p.inventory, ...Object.values(p.equipment).filter(id => id !== null)];
        
        activeCorpses.push({ 
            name: `${p.username}'s remains`, 
            roomId: p.roomId, 
            timestamp: Date.now(), 
            items: corpseItems, 
            gold: p.gold || 0,
            type: 'player' 
        });

        // Clear player inventory, equipment, and gold
        p.inventory = [];
        p.equipment = {};
        p.gold = 0;
        p.hp = -10; 
        p.hunger = 100;
        p.thirst = 100;
        p.roomId = CONFIG.STARTING_ROOM; 
        p.fighting = null;
        p.state = 'sleeping';

        commands.handleLook(p.ws, rooms[p.roomId], players, activeMobs, activeCorpses);
        savePlayer(p);
    }
}

wss.on('connection', (ws) => {
    let state = 'LOGIN_NAME';
    let tempUser = null;
    commands.sendTo(ws, "{bold}Welcome to Where Developers Dwell{x}\nEnter your username:");
    ws.on('message', async (message) => {
        try {
            const msg = JSON.parse(message);
            const input = (msg.content || msg.username || "").trim();
            if (!input && state !== 'PLAYING') return;
            if (state === 'LOGIN_NAME') {
                tempUser = input;
                if (bans.includes(tempUser)) {
                    commands.sendTo(ws, "{R}Your account has been banned.{x}");
                    ws.close();
                    return;
                }
                const p = await loadPlayer(tempUser);
                state = p ? 'LOGIN_PASS' : 'CREATE_PASS';
                commands.sendTo(ws, p ? "Enter password:" : "New developer! Enter a password:");
            } else if (state === 'LOGIN_PASS') {
                const p = await loadPlayer(tempUser);
                if (await bcrypt.compare(input, p.password)) {
                    p.ws = ws; p.equipment = p.equipment || {}; players.set(ws, p); state = 'PLAYING';
                    commands.sendTo(ws, `{G}Welcome back, ${p.username}.{x}`);
                    commands.sendTo(ws, CONFIG.MOTD);
                    commands.handleLook(ws, rooms[p.roomId], players, itemTemplates, activeMobs, activeCorpses);
                    commands.sendPrompt(ws, p);
                } else {
                    commands.sendTo(ws, "{R}Wrong password.{x} Enter username:"); state = 'LOGIN_NAME';
                }
            } else if (state === 'CREATE_PASS') {
                ws.tempPass = await bcrypt.hash(input, 10);
                state = 'CHOOSE_CLASS';
                commands.sendTo(ws, `Choose discipline: {C}${Object.keys(CONFIG.CLASSES).join(', ')}{x}`);
            } else if (state === 'CHOOSE_CLASS') {
                const choice = input.toLowerCase().trim();
                console.log(`DEBUG: User '${tempUser}' selected class: '${choice}'`);
                if (CONFIG.CLASSES[choice]) {
                    console.log(`DEBUG: Class '${choice}' exists.`);
                    const classData = CONFIG.CLASSES[choice];
                    let p = {
                        username: tempUser, password: ws.tempPass, class: choice, level: 1, exp: 0, gold: 100, tp: 0,
                        roomId: CONFIG.STARTING_ROOM, hp: classData.hp, maxHp: classData.hp, mp: classData.mp, maxMp: classData.mp,
                        inventory: [], equipment: {}, abilities: [],
                        intellect: roll3d6(), speed: roll3d6(), creativity: roll3d6(), endurance: roll3d6()
                    };
                    p = sanitizePlayer(p);
                    p.ws = ws; players.set(ws, p); savePlayer(p); state = 'PLAYING';
                    commands.sendTo(ws, `{G}Profile created. Welcome, ${p.username}.{x}`);
                    commands.sendTo(ws, `\n{bold}{M}Welcome to the world of Mudlet!{x}\n` +
                        `You are a developer in a digital realm. Your goal is to level up, gear up, and defeat the buggy code monsters.\n` +
                        `Type 'help' to see available commands, and 'look' to see your surroundings. Good luck!\n`);
                    commands.sendTo(ws, `Your Stats: INT:${p.intellect}, SPD:${p.speed}, CRE:${p.creativity}, END:${p.endurance}`);
                    commands.handleLook(ws, rooms[p.roomId], players, itemTemplates, activeMobs, activeCorpses);
                    commands.sendPrompt(ws, p);
                } else { 
                    console.log(`DEBUG: Class '${choice}' does not exist.`);
                    commands.sendTo(ws, "Invalid discipline. Choose: " + Object.keys(CONFIG.CLASSES).join(', ')); 
                }
            } else if (state === 'PLAYING') {
                const parts = input.split(' ');
                const cmd = parts[0].toLowerCase();
                const args = parts.slice(1);
                const p = players.get(ws);
                if (!p) return;

                // Death check for commands
                const allowedWhileDead = ['look', 'l', 'score', 'sc', 'i', 'inv', 'inventory', 'help', 'say', 'talk'];
                if (p.hp <= 0 && !allowedWhileDead.includes(cmd)) {
                    commands.sendTo(ws, "{R}You are incapacitated and cannot do that.{x}");
                    return;
                }

                if (p.state === 'sleeping' && !['stand', 'wake', 'help', 'score', 'sc'].includes(cmd)) {
                    commands.sendTo(ws, "{M}You are fast asleep. Use 'wake' or 'stand' to get up.{x}");
                    return;
                }

                const isAdmin = CONFIG.ADMINS.includes(p.username);

                switch(cmd) {
                    case 'teleport':
                        if (!isAdmin) { commands.sendTo(ws, "Unknown command. Type 'help'."); break; }
                        if (args.length === 1) {
                            const targetRoomId = args[0];
                            if (rooms[targetRoomId]) {
                                p.roomId = targetRoomId;
                                commands.handleLook(ws, rooms[p.roomId], players, itemTemplates, activeMobs, activeCorpses);
                                commands.sendTo(ws, `{G}Teleported to ${targetRoomId}.{x}`);
                            } else { commands.sendTo(ws, "Room not found."); }
                        } else if (args.length === 2) {
                            const targetName = args[0];
                            const targetRoomId = args[1];
                            const target = Array.from(players.values()).find(other => other.username.toLowerCase() === targetName.toLowerCase());
                            if (target && rooms[targetRoomId]) {
                                target.roomId = targetRoomId;
                                if (target.ws) {
                                    commands.handleLook(target.ws, rooms[target.roomId], players, itemTemplates, activeMobs, activeCorpses);
                                    commands.sendTo(target.ws, `{G}You have been teleported to ${targetRoomId}.{x}`);
                                }
                                commands.sendTo(ws, `{G}Teleported ${target.username} to ${targetRoomId}.{x}`);
                            } else { commands.sendTo(ws, "Player or room not found."); }
                        } else { commands.sendTo(ws, "Usage: teleport <room_id> or teleport <player> <room_id>"); }
                        break;
                    case 'kick':
                        if (!isAdmin) { commands.sendTo(ws, "Unknown command. Type 'help'."); break; }
                        const kickTarget = Array.from(players.values()).find(other => other.username.toLowerCase() === (args[0]||"").toLowerCase());
                        if (kickTarget) {
                            commands.sendTo(kickTarget.ws, "{R}You have been kicked by an admin.{x}");
                            kickTarget.ws.close();
                            commands.sendTo(ws, `{G}Kicked ${kickTarget.username}.{x}`);
                        } else { commands.sendTo(ws, "Player not found."); }
                        break;
                    case 'ban':
                        if (!isAdmin) { commands.sendTo(ws, "Unknown command. Type 'help'."); break; }
                        const banUsername = (args[0]||"").toLowerCase();
                        if (banUsername) {
                            if (!bans.includes(banUsername)) {
                                bans.push(banUsername);
                                saveBans();
                                const banTarget = Array.from(players.values()).find(other => other.username.toLowerCase() === banUsername);
                                if (banTarget) {
                                    commands.sendTo(banTarget.ws, "{R}You have been banned by an admin.{x}");
                                    banTarget.ws.close();
                                }
                                commands.sendTo(ws, `{G}Banned ${banUsername}.{x}`);
                            } else { commands.sendTo(ws, "User is already banned."); }
                        } else { commands.sendTo(ws, "Usage: ban <player>"); }
                        break;
                    case 'spawn':
                        if (!isAdmin) { commands.sendTo(ws, "Unknown command. Type 'help'."); break; }
                        const mobTemplateId = args[0];
                        if (mobTemplates[mobTemplateId]) {
                            spawnMob(mobTemplateId, p.roomId);
                            commands.sendTo(ws, `{G}Spawned ${mobTemplates[mobTemplateId].name} in this room.{x}`);
                        } else { commands.sendTo(ws, "Mob template not found."); }
                        break;
                    case 'shutdown':
                        if (!isAdmin) { commands.sendTo(ws, "Unknown command. Type 'help'."); break; }
                        broadcast("{R}Server is shutting down... saving world state.{x}");
                        players.forEach(player => savePlayer(player));
                        saveWorldState();
                        process.exit(0);
                        break;
                    case 'who': commands.handleWho(ws, players); break;
                    case 'tell': commands.handleTell(ws, args[0], args.slice(1).join(' '), players); break;
                    case 'look': case 'l': commands.handleLook(ws, rooms[p.roomId], players, itemTemplates, activeMobs, activeCorpses); break;
                    case 'n': case 'north': commands.handleMove(ws, 'north', rooms, players, itemTemplates, activeMobs, activeCorpses); break;
                    case 's': case 'south': commands.handleMove(ws, 'south', rooms, players, itemTemplates, activeMobs, activeCorpses); break;
                    case 'e': case 'east': commands.handleMove(ws, 'east', rooms, players, itemTemplates, activeMobs, activeCorpses); break;
                    case 'w': case 'west': commands.handleMove(ws, 'west', rooms, players, itemTemplates, activeMobs, activeCorpses); break;
                    case 'say': commands.handleSay(ws, args.join(' '), players); break;
                    case 'gossip': case 'chat': commands.handleGossip(ws, args.join(' '), players); break;
                    case 'talk': commands.handleTalk(ws, args[0], players, activeMobs, questTemplates, itemTemplates); break;
                    case 'quests': commands.handleQuests(ws, p); break;
                    case 'skills': commands.handleSkills(ws, p); break;
                    case 'party': commands.handleParty(ws, args[0], args[1], players); break;
                    case 'i': case 'inv': case 'inventory': commands.handleInventory(ws, p, itemTemplates); break;
                    case 'get': commands.handleGet(ws, args[0], rooms, players, itemTemplates); break;
                    case 'drop': commands.handleDrop(ws, args[0], rooms, players, itemTemplates); break;
                    case 'wear': case 'equip': commands.handleWear(ws, args[0], players, itemTemplates); break;
                    case 'remove': case 'unequip': commands.handleRemove(ws, args[0], players, itemTemplates); break;
                    case 'loot': commands.handleLoot(ws, args[0], rooms, players, activeCorpses, itemTemplates); break;
                    case 'flee': case 'run': commands.handleFlee(ws, rooms, players, itemTemplates, activeMobs, activeCorpses); break;
                    case 'score': case 'sc': commands.handleScore(ws, p, itemTemplates); break;
                    case 'eq': case 'equipment': commands.handleEquipment(ws, p, itemTemplates); break;
                    case 'list': commands.handleList(ws, rooms, players, activeMobs, itemTemplates); break;
                    case 'buy': commands.handleBuy(ws, args[0], rooms, players, activeMobs, itemTemplates); break;
                    case 'sell': commands.handleSell(ws, args[0], rooms, players, activeMobs, itemTemplates); break;
                    case 'train': commands.handleTrain(ws, args[0], players, activeMobs); break;
                    case 'eat': commands.handleEat(ws, args[0], players, itemTemplates); break;
                    case 'drink': commands.handleDrink(ws, args[0], players, itemTemplates); break;
                    case 'rest': commands.handleRest(ws, p); break;
                    case 'sleep': commands.handleSleep(ws, p); break;
                    case 'stand': case 'wake': commands.handleStand(ws, p); break;
                    case 'quit': commands.handleQuit(ws); break;
                    case 'use': case 'quaff':
                        commands.handleUse(ws, args[0], players, itemTemplates);
                        break;
                    case 'laugh': case 'dance': case 'cry': case 'smile': case 'wave': commands.handleEmote(ws, cmd, args[0], players); break;
                    case 'k': case 'kill': case 'attack':
                        const targetName = args.join(' ').toLowerCase();
                        let target = null;
                        if (targetName === "") {
                            target = activeMobs.find(m => m.roomId === p.roomId && !m.isNpc);
                        } else {
                            target = activeMobs.find(m => m.roomId === p.roomId && m.name.toLowerCase().includes(targetName));
                        }

                        if (target) { 
                            if (target.isNpc) {
                                commands.sendTo(ws, "You can't attack them!");
                            } else {
                                p.fighting = target; 
                                target.fighting = p;
                                commands.sendTo(ws, `You attack ${target.name}!`); 
                            }
                        }
                        else { commands.sendTo(ws, "You don't see that here."); }
                        break;
                    case 'help': 
                        let helpMsg = "\n{bold}Available Commands:{x}\n" +
                            "  {C}Move:{x}      n, s, e, w, north, south, east, west\n" +
                            "  {C}Chat:{x}      say, gossip (chat), tell\n" +
                            "  {C}Action:{x}    look (l), talk, get, drop, wear/equip, remove/unequip, loot, kill (k), flee, buy, list, sell, train, use, eat, drink, party, rest, sleep, stand, quit\n" +
                            "  {C}Info:{x}      score (sc), equipment (eq), inventory (i/inv), quests, skills, who, help\n" +
                            "  {C}Social:{x}    laugh, dance, cry, smile, wave\n";

                        if (isAdmin) {
                            helpMsg += "\n{bold}{R}Admin Commands:{x}\n" +
                            "  teleport [player] <room_id>, kick <player>, ban <player>, spawn <mob_id>, shutdown\n";
                        }
                        commands.sendTo(ws, helpMsg); break;
                    default: 
                        if (!commands.handleAbility(ws, cmd, args.join(' '), players, activeMobs, handleMobDeath)) {
                            commands.sendTo(ws, "Unknown command. Type 'help'.");
                        }
                        break;
                }
                // Send prompt after every command
                commands.sendPrompt(ws, p);
            }
        } catch (e) { console.error("Msg Error:", e); }
    });
    ws.on('close', () => { const p = players.get(ws); if (p) savePlayer(p); players.delete(ws); });
});

// Ambience Loop
setInterval(() => {
    players.forEach((p, ws) => {
        const room = rooms[p.roomId];
        if (room && room.ambience && room.ambience.length > 0 && Math.random() < 0.15) {
            const msg = room.ambience[Math.floor(Math.random() * room.ambience.length)];
            commands.sendTo(ws, `\n{C}${msg}{x}\n`);
        }
    });
}, 45000);

loadData();
app.use(express.static(path.join(__dirname, '../public')));
server.listen(PORT, '0.0.0.0', () => console.log(`Mudlet server running on port ${PORT}`));

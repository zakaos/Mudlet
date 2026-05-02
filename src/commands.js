const CONFIG = require('../config/settings');

const sendTo = (ws, msg) => { 
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'message', content: msg })); 
};

function handleLook(ws, room, players, itemTemplates, activeMobs, activeCorpses) {
    if (!activeCorpses) activeCorpses = [];
    let output = `\n{bold}${room.name}{x}\n${room.description}\n\n{bold}Exits:{x} ${Object.keys(room.exits).join(', ')}\n`;
    const roomPlayers = Array.from(players.values()).filter(p => p.roomId === room.id && p.ws !== ws);
    roomPlayers.forEach(p => output += `{G}${p.username} is standing here.{x}\n`);
    const roomMobs = activeMobs.filter(m => m.roomId === room.id);
    roomMobs.forEach(m => {
        const color = m.isNpc ? '{C}' : '{R}';
        output += `${color}${m.name} is here.{x}\n`;
    });
    const roomCorpses = activeCorpses.filter(c => c.roomId === room.id);
    roomCorpses.forEach(c => output += `{M}The digital remains of ${c.name} are lying here.{x}\n`);
    room.items.forEach(i => {
        const item = itemTemplates[i];
        if (item) output += `{Y}A ${item.name} is lying here.{x}\n`;
    });
    sendTo(ws, output);
}

function handleMove(ws, dir, rooms, players, itemTemplates, activeMobs, activeCorpses, force = false) {
    const p = players.get(ws);
    if (p.hp <= 0 && !force) {
        sendTo(ws, "You are too weak to move! You must recover your strength first.");
        return;
    }
    if (p.state !== 'standing' && !force) {
        sendTo(ws, `You cannot move while ${p.state}! Use 'stand' first.`);
        return;
    }
    if (p.fighting && !force) {
        sendTo(ws, "You can't leave the room while fighting! Use 'flee' to run away.");
        return;
    }
    const room = rooms[p.roomId];
    if (room.exits[dir]) {
        p.roomId = room.exits[dir];
        p.stamina = Math.max(0, p.stamina - 1);
        
        // Aggro check: aggressive mobs attack on entry
        const roomMobs = activeMobs.filter(m => m.roomId === p.roomId);
        roomMobs.forEach(mob => {
            if (mob.aggressive && !mob.fighting && !p.fighting && !mob.isNpc) {
                mob.fighting = p;
                p.fighting = mob;
                sendTo(ws, `{R}${mob.name} senses your presence and attacks!{x}`);
            }
        });

        handleLook(ws, rooms[p.roomId], players, itemTemplates, activeMobs, activeCorpses);
    } else {
        sendTo(ws, "You can't go that way.");
    }
}

function handleFlee(ws, rooms, players, itemTemplates, activeMobs, activeCorpses) {
    const p = players.get(ws);
    if (!p.fighting) {
        sendTo(ws, "You aren't fighting anyone!");
        return;
    }

    const room = rooms[p.roomId];
    const exits = Object.keys(room.exits);
    if (exits.length === 0) {
        sendTo(ws, "There's nowhere to run!");
        return;
    }

    const dir = exits[Math.floor(Math.random() * exits.length)];
    sendTo(ws, "{R}You panic and flee from combat!{x}");
    p.fighting = null;
    handleMove(ws, dir, rooms, players, itemTemplates, activeMobs, activeCorpses, true);
}

function handleSay(ws, msg, players) {
    const p = players.get(ws);
    sendTo(ws, `{G}You say: ${msg}{x}`);
    Array.from(players.values()).forEach(target => {
        if (target.roomId === p.roomId && target.ws !== ws) {
            sendTo(target.ws, `{G}${p.username} says: ${msg}{x}`);
        }
    });
}

function handleInventory(ws, p, itemTemplates) {
    if (!p.inventory || p.inventory.length === 0) {
        sendTo(ws, "You are carrying nothing.");
    } else {
        let output = "\n{bold}Your Inventory:{x}\n";
        p.inventory.forEach(itemId => {
            const item = itemTemplates[itemId];
            if (item) {
                const slotInfo = item.slot ? ` {C}[${item.slot}]{x}` : "";
                output += ` - ${item.name}${slotInfo}\n`;
            } else {
                output += ` - Unknown Item (${itemId})\n`;
            }
        });
        sendTo(ws, output);
    }
}

function handleGet(ws, itemName, rooms, players, itemTemplates) {
    const p = players.get(ws);
    const room = rooms[p.roomId];
    if (!room || !room.items) { sendTo(ws, "Nothing to get here."); return; }
    const itemIndex = room.items.findIndex(i => {
        const item = itemTemplates[i];
        return item && item.keywords && item.keywords.some(k => k.includes(itemName.toLowerCase()));
    });
    if (itemIndex !== -1) {
        const itemId = room.items.splice(itemIndex, 1)[0];
        p.inventory.push(itemId);
        sendTo(ws, `You get ${itemTemplates[itemId] ? itemTemplates[itemId].name : 'an item'}.`);
    } else {
        sendTo(ws, "You don't see that here.");
    }
}

function handleDrop(ws, itemName, rooms, players, itemTemplates) {
    const p = players.get(ws);
    const itemIndex = p.inventory.findIndex(i => {
        const item = itemTemplates[i];
        return item && item.keywords && item.keywords.some(k => k.includes(itemName.toLowerCase()));
    });
    if (itemIndex !== -1) {
        const itemId = p.inventory.splice(itemIndex, 1)[0];
        if (!rooms[p.roomId].items) rooms[p.roomId].items = [];
        rooms[p.roomId].items.push(itemId);
        sendTo(ws, `You drop ${itemTemplates[itemId] ? itemTemplates[itemId].name : 'an item'}.`);
    } else {
        sendTo(ws, "You aren't carrying that.");
    }
}

function handleWear(ws, itemName, players, itemTemplates) {
    const p = players.get(ws);
    const itemIndex = p.inventory.findIndex(id => {
        const item = itemTemplates[id];
        return item && item.keywords && item.keywords.some(k => k.includes(itemName.toLowerCase()));
    });
    if (itemIndex === -1) { sendTo(ws, "You aren't carrying that."); return; }
    const itemId = p.inventory[itemIndex];
    const item = itemTemplates[itemId];
    if (!item) { sendTo(ws, "That item seems to be corrupted."); return; }
    if (!item.slot) { sendTo(ws, "You can't wear that."); return; }
    if (p.equipment[item.slot]) { sendTo(ws, `You are already wearing something on your ${item.slot}.`); return; }
    p.inventory.splice(itemIndex, 1);
    p.equipment[item.slot] = itemId;
    sendTo(ws, `You wear ${item.name}.`);
}

function handleRemove(ws, itemName, players, itemTemplates) {
    const p = players.get(ws);
    let slot = Object.keys(p.equipment).find(s => {
        const itemId = p.equipment[s];
        const item = itemId ? itemTemplates[itemId] : null;
        return item && item.keywords && item.keywords.some(k => k.includes(itemName.toLowerCase()));
    });
    if (!slot && CONFIG.SLOTS.includes(itemName.toLowerCase())) slot = itemName.toLowerCase();
    if (slot && p.equipment[slot]) {
        const itemId = p.equipment[slot];
        const item = itemTemplates[itemId];
        p.equipment[slot] = null;
        p.inventory.push(itemId);
        sendTo(ws, `You remove ${item ? item.name : 'an item'}.`);
    } else { sendTo(ws, "You aren't wearing that."); }
}

function handleLoot(ws, targetName, rooms, players, activeCorpses, itemTemplates) {
    const p = players.get(ws);
    const corpse = activeCorpses.find(c => {
        if (c.roomId !== p.roomId) return false;
        if (!targetName || targetName.toLowerCase() === 'corpse') return true;
        return c.name.toLowerCase().includes(targetName.toLowerCase());
    });
    if (!corpse) { sendTo(ws, "You don't see that corpse here."); return; }
    if (corpse.items.length === 0 && corpse.gold === 0) {
        sendTo(ws, "The corpse is empty.");
    } else {
        corpse.items.forEach(itemId => {
            p.inventory.push(itemId);
            sendTo(ws, `You loot ${itemTemplates[itemId] ? itemTemplates[itemId].name : 'an item'} from the remains.`);
        });
        corpse.items = [];
        if (corpse.gold > 0) {
            p.gold += corpse.gold;
            sendTo(ws, `You find {Y}${corpse.gold} gold{x} in the remains.`);
            corpse.gold = 0;
        }
    }
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

function handleScore(ws, p, itemTemplates) {
    const classData = CONFIG.CLASSES[p.class] || CONFIG.CLASSES.coder;
    const nextLevelXp = (p.level || 1) * (p.level || 1) * CONFIG.LEVEL_XP_BASE;
    
    // Calculate Damage and AC
    let weaponDmg = [0, 5]; // Match server unarmed damage
    let totalAc = 0;
    Object.values(p.equipment || {}).forEach(itemId => {
        const item = itemId ? itemTemplates[itemId] : null;
        if (item) {
            if (item.type === 'weapon' && item.damage) {
                weaponDmg = item.damage;
            }
            if (item.ac) totalAc += item.ac;
        }
    });
    
    const primaryStat = classData.primary || 'intellect';
    const statBonus = getStatBonus(p[primaryStat] || 10);
    const finalDmg = [weaponDmg[0] + statBonus, weaponDmg[1] + statBonus];

    let output = `\n{bold}Developer Profile: ${p.username}{x}\n`;
    output += `Discipline: ${(p.class || 'none').toUpperCase()}  Level: ${p.level || 1}  State: {G}${p.state.toUpperCase()}{x}\n`;
    output += `HP: {R}${p.hp || 0}/${p.maxHp || 0}{x}  MP: {B}${p.mp || 0}/${p.maxMp || 0}{x}\n`;
    output += `Stamina: {G}${p.stamina || 0}/100{x}  Hunger: {Y}${p.hunger || 0}/100{x}  Thirst: {C}${p.thirst || 0}/100{x}\n`;
    output += `EXP: ${p.exp || 0} / ${nextLevelXp}  Gold: {Y}${p.gold || 0}{x}  TP: ${p.tp || 0}\n\n`;
    
    output += `{bold}Attributes:{x}\n`;
    output += ` Intellect:  ${p.intellect || 0}  Speed:      ${p.speed || 0}\n`;
    output += ` Creativity: ${p.creativity || 0}  Endurance:  ${p.endurance || 0}\n\n`;
    
    output += `{bold}Combat Stats:{x}\n`;
    output += ` Damage:     {Y}${Math.max(1, finalDmg[0])}-${Math.max(1, finalDmg[1])}{x} (Stat bonus: ${statBonus >= 0 ? '+' : ''}${statBonus})\n`;
    output += ` AC:         {G}${totalAc}{x}\n`;
    
    sendTo(ws, output);
}

function handleEquipment(ws, p, itemTemplates) {
    let output = "\n{bold}Your Current Loadout:{x}\n";
    CONFIG.SLOTS.forEach(slot => {
        const itemId = p.equipment[slot];
        const item = itemId ? itemTemplates[itemId] : null;
        const label = `[${slot.replace('_', ' ').toUpperCase()}]`.padEnd(12);
        let details = item ? `{G}${item.name}{x}` : '{D}empty{x}';
        if (item) {
            let mods = [];
            if (item.damage) mods.push(`Dmg: ${item.damage[0]}-${item.damage[1]}`);
            if (item.ac) mods.push(`AC: ${item.ac}`);
            if (mods.length > 0) details += ` (${mods.join(', ')})`;
        }
        output += ` ${label} : ${details}\n`;
    });
    sendTo(ws, output);
}

function handleList(ws, rooms, players, activeMobs, itemTemplates) {
    const p = players.get(ws);
    const shopMob = activeMobs.find(m => m.roomId === p.roomId && m.shop);
    if (!shopMob) { sendTo(ws, "There is no shop here."); return; }
    let output = `\n{bold}${shopMob.name}'s Inventory:{x}\n`;
    shopMob.shop.forEach(itemId => {
        const item = itemTemplates[itemId];
        if (item) output += ` - ${item.name.padEnd(25)} : {Y}${item.price || CONFIG.ITEM_BUY_PRICE} gold{x}\n`;
        else output += ` - Unknown Item (${itemId})\n`;
    });
    sendTo(ws, output);
}

function handleBuy(ws, itemName, rooms, players, activeMobs, itemTemplates) {
    const p = players.get(ws);
    const shopMob = activeMobs.find(m => m.roomId === p.roomId && m.shop);
    if (!shopMob) { sendTo(ws, "There is no shop here."); return; }
    const itemId = shopMob.shop.find(id => {
        const item = itemTemplates[id];
        return item && item.keywords && item.keywords.some(k => k.includes(itemName.toLowerCase()));
    });
    if (!itemId) { sendTo(ws, "They don't sell that here."); return; }
    const item = itemTemplates[itemId];
    const cost = item.price || CONFIG.ITEM_BUY_PRICE;
    if (p.gold < cost) { sendTo(ws, "You can't afford that."); return; }
    p.gold -= cost;
    p.inventory.push(itemId);
    sendTo(ws, `You buy ${item.name} for {Y}${cost} gold{x}.`);
}

function handleSell(ws, itemName, rooms, players, activeMobs, itemTemplates) {
    const p = players.get(ws);
    const shopMob = activeMobs.find(m => m.roomId === p.roomId && m.shop);
    if (!shopMob) { sendTo(ws, "There is no shop here."); return; }

    const itemIndex = p.inventory.findIndex(id => {
        const item = itemTemplates[id];
        return item && item.keywords && item.keywords.some(k => k.includes(itemName.toLowerCase()));
    });
    if (itemIndex === -1) { sendTo(ws, "You aren't carrying that."); return; }

    const itemId = p.inventory.splice(itemIndex, 1)[0];
    const item = itemTemplates[itemId];
    const price = Math.floor((item ? (item.price || CONFIG.ITEM_BUY_PRICE) : CONFIG.ITEM_BUY_PRICE) / 2);
    
    p.gold += price;
    sendTo(ws, `You sell ${item ? item.name : 'an item'} for {Y}${price} gold{x}.`);
}

function handleTrain(ws, action, players, activeMobs) {
    const p = players.get(ws);
    const trainer = activeMobs.find(m => m.roomId === p.roomId && m.isTrainer);
    if (!trainer) { sendTo(ws, "There is no trainer here."); return; }

    const classData = CONFIG.CLASSES[p.class];
    const attributes = ['intellect', 'speed', 'creativity', 'endurance'];

    if (action === 'list') {
        let output = `\n{bold}${trainer.name}'s Training List (TP: ${p.tp}, Gold: ${p.gold}):{x}\n`;
        output += `{bold}Attributes (1 TP each):{x}\n`;
        attributes.forEach(attr => {
            output += ` - ${attr.charAt(0).toUpperCase() + attr.slice(1).padEnd(14)} : 1 TP, 0 G\n`;
        });
        output += `\n{bold}Abilities:{x}\n`;
        classData.abilities.forEach(ab => {
            const known = (p.abilities || []).includes(ab.id);
            const status = known ? "{G}[Known]{x}" : (p.level >= ab.level ? "{Y}[Ready]{x}" : `{R}[Lvl ${ab.level}]{x}`);
            output += ` - ${ab.name.padEnd(15)} : ${ab.tp} TP, ${ab.cost} G ${status} - ${ab.desc}\n`;
        });
        sendTo(ws, output);
    } else if (action) {
        const targetAttr = action.toLowerCase();
        if (attributes.includes(targetAttr)) {
            if (p.tp < 1) { sendTo(ws, "You need 1 TP to train an attribute."); return; }
            p.tp -= 1;
            p[targetAttr] = (p[targetAttr] || 10) + 1;
            
            // Recalculate max HP/MP if endurance or intellect changed
            if (targetAttr === 'endurance') {
                p.maxHp += 2;
                p.hp += 2;
                sendTo(ws, `{G}Your endurance increases! Your max HP has also increased.{x}`);
            } else if (targetAttr === 'intellect') {
                p.maxMp += 2;
                p.mp += 2;
                sendTo(ws, `{G}Your intellect increases! Your max MP has also increased.{x}`);
            } else {
                sendTo(ws, `{G}Your ${targetAttr} increases!{x}`);
            }
            return;
        }

        const ab = classData.abilities.find(a => a.id === action.toLowerCase() || a.name.toLowerCase() === action.toLowerCase());
        if (!ab) { sendTo(ws, "They can't teach you that. Try training an attribute or an ability."); return; }
        p.abilities = p.abilities || [];
        if (p.abilities.includes(ab.id)) { sendTo(ws, "You already know that."); return; }
        if (p.level < ab.level) { sendTo(ws, "You aren't experienced enough yet."); return; }
        if (p.tp < ab.tp) { sendTo(ws, "You need more training points (TP)."); return; }
        if (p.gold < ab.cost) { sendTo(ws, "You don't have enough gold."); return; }

        p.tp -= ab.tp;
        p.gold -= ab.cost;
        p.abilities.push(ab.id);
        sendTo(ws, `{G}You have learned ${ab.name}!{x}`);
    } else { sendTo(ws, "Try 'train list', 'train <attribute>', or 'train <ability>'."); }
}

function handleAbility(ws, cmd, targetName, players, activeMobs, onMobDeath) {
    const p = players.get(ws);
    const classData = CONFIG.CLASSES[p.class];
    if (!classData) return false;
    const ab = classData.abilities.find(a => a.id === cmd);
    if (!ab || !(p.abilities || []).includes(ab.id)) return false;

    if (p.mp < ab.mp) { sendTo(ws, "You don't have enough MP."); return true; }

    if (ab.type === 'heal') {
        p.mp -= ab.mp;
        const heal = ab.value + Math.floor(p.intellect / 2);
        p.hp = Math.min(p.maxHp, p.hp + heal);
        sendTo(ws, `{M}You use ${ab.name}!{x} Restoring {G}${heal}{x} HP.`);
        return true;
    }

    if (ab.type === 'buff') {
        p.mp -= ab.mp;
        // Temporary stat boost (e.g., strength/damage)
        p.dmgBuff = (p.dmgBuff || 0) + ab.value;
        sendTo(ws, `{M}You use ${ab.name}!{x} Your power increases for this encounter.`);
        return true;
    }

    const roomMobs = activeMobs.filter(m => m.roomId === p.roomId);
    let target = null;
    if (targetName) {
        target = roomMobs.find(m => m.name.toLowerCase().includes(targetName.toLowerCase()));
    } else if (p.fighting) {
        target = p.fighting;
    } else {
        // Find first hostile mob
        target = roomMobs.find(m => !m.isNpc);
    }

    if (!target) { sendTo(ws, "Use that on who?"); return true; }
    if (target.isNpc) { sendTo(ws, "You can't use that on them."); return true; }

    p.mp -= ab.mp;
    p.fighting = target;
    target.fighting = p; // Ensure mob fights back immediately

    if (ab.type === 'debuff') {
        target.dmgBuff = Math.max(0, (target.dmgBuff || 0) - ab.value);
        sendTo(ws, `{M}You use ${ab.name} on ${target.name}!{x} Their strength fades.`);
    } else {
        const dmg = (ab.value || 0) + Math.floor((p.intellect || 0) / 2);
        target.currentHp -= dmg;
        sendTo(ws, `{M}You use ${ab.name} on ${target.name}!{x} Dealing {Y}${dmg}{x} damage.`);
    }

    if (target.currentHp <= 0 && onMobDeath) {
        onMobDeath(target, ws);
    }

    return true;
}

function sendPrompt(ws, p) {
    const hpColor = p.hp < p.maxHp * 0.3 ? '{R}' : (p.hp < p.maxHp * 0.7 ? '{Y}' : '{G}');
    const stColor = p.stamina < 30 ? '{R}' : (p.stamina < 70 ? '{Y}' : '{G}');
    const prompt = `\n${hpColor}HP:${p.hp}/${p.maxHp}{x} {M}MP:${p.mp}/${p.maxMp}{x} ${stColor}ST:${p.stamina}/100{x} {Y}H:${p.hunger}{x} {C}T:${p.thirst}{x} > `;
    sendTo(ws, prompt);
}

function handleQuests(ws, p) {
    if (!p.quests || p.quests.length === 0) {
        sendTo(ws, "You have no active quests.");
        return;
    }
    let output = "\n{bold}Active Quests:{x}\n";
    p.quests.forEach(q => {
        output += ` - {G}${q.name}{x}: ${q.desc}\n   Progress: ${q.current}/${q.required}\n`;
    });
    sendTo(ws, output);
}

function handleParty(ws, action, targetName, players) {
    const p = players.get(ws);
    const allPlayers = Array.from(players.values());

    if (action === 'invite') {
        if (!targetName) { sendTo(ws, "Invite who?"); return; }
        const target = allPlayers.find(other => other.username.toLowerCase() === targetName.toLowerCase());
        if (!target) { sendTo(ws, "Player not found."); return; }
        if (target === p) { sendTo(ws, "You can't invite yourself."); return; }
        if (target.party && target.party === p.party) { sendTo(ws, "They are already in your party."); return; }
        
        target.pendingInvite = p.username;
        sendTo(ws, `You invited ${target.username} to your party.`);
        sendTo(target.ws, `\n{bold}{G}${p.username} has invited you to a party!{x}\nType 'party accept' to join.\n`);
    } else if (action === 'accept') {
        if (!p.pendingInvite) { sendTo(ws, "You have no pending invites."); return; }
        const inviter = allPlayers.find(other => other.username === p.pendingInvite);
        if (!inviter) { sendTo(ws, "Inviter is no longer online."); p.pendingInvite = null; return; }

        let partyId = inviter.party || Math.random().toString(36).substr(2, 9);
        inviter.party = partyId;
        p.party = partyId;
        p.pendingInvite = null;

        sendTo(ws, `{G}You have joined ${inviter.username}'s party!{x}`);
        sendTo(inviter.ws, `{G}${p.username} has joined your party!{x}`);
        
        allPlayers.forEach(other => {
            if (other.party === partyId && other !== p && other !== inviter) {
                sendTo(other.ws, `{G}${p.username} has joined the party!{x}`);
            }
        });
    } else if (action === 'leave') {
        if (!p.party) { sendTo(ws, "You aren't in a party."); return; }
        const oldPartyId = p.party;
        p.party = null;
        sendTo(ws, "You left the party.");
        allPlayers.forEach(other => {
            if (other.party === oldPartyId) {
                sendTo(other.ws, `{R}${p.username} has left the party.{x}`);
            }
        });
    } else if (action === 'list') {
        if (!p.party) { sendTo(ws, "You aren't in a party."); return; }
        let output = "\n{bold}Party Members:{x}\n";
        allPlayers.forEach(other => {
            if (other.party === p.party) {
                output += ` - ${other.username} (Lvl ${other.level} ${other.class})\n`;
            }
        });
        sendTo(ws, output);
    } else {
        sendTo(ws, "Usage: party <invite|accept|leave|list> [player]");
    }
}

function handleSkills(ws, p) {
    const classData = CONFIG.CLASSES[p.class];
    if (!classData) return;
    
    let output = `\n{bold}Learned Skills for ${classData.name}:{x}\n`;
    if (!p.abilities || p.abilities.length === 0) {
        output += " You haven't learned any skills yet. Visit a trainer!\n";
    } else {
        p.abilities.forEach(abId => {
            const ab = classData.abilities.find(a => a.id === abId);
            if (ab) {
                output += ` - {M}${ab.name.padEnd(15)}{x} : ${ab.desc} (MP: ${ab.mp})\n`;
            }
        });
    }
    sendTo(ws, output);
}

function handleRest(ws, p) {
    if (p.fighting) { sendTo(ws, "You can't rest during combat!"); return; }
    if (p.state === 'resting') { sendTo(ws, "You are already resting."); return; }
    p.state = 'resting';
    sendTo(ws, "{G}You sit down and begin to rest.{x}");
}

function handleSleep(ws, p) {
    if (p.fighting) { sendTo(ws, "You can't sleep during combat!"); return; }
    if (p.state === 'sleeping') { sendTo(ws, "You are already asleep."); return; }
    p.state = 'sleeping';
    sendTo(ws, "{M}You lie down and drift into a deep sleep.{x}");
}

function handleStand(ws, p) {
    if (p.state === 'standing') { sendTo(ws, "You are already standing."); return; }
    p.state = 'standing';
    sendTo(ws, "{G}You stand back up.{x}");
}

function handleTalk(ws, targetName, players, activeMobs, questTemplates, itemTemplates) {
    const p = players.get(ws);
    const roomMobs = activeMobs.filter(m => m.roomId === p.roomId);
    const target = roomMobs.find(m => m.name.toLowerCase().includes((targetName || "").toLowerCase()));

    if (!target) {
        sendTo(ws, "Talk to who?");
        return;
    }

    if (!target.isNpc) {
        sendTo(ws, `${target.name} doesn't seem interested in talking.`);
        return;
    }

    // Quest Completion Check
    if (p.quests && p.quests.length > 0) {
        const completedQuestIndex = p.quests.findIndex(q => q.giverId === target.id && q.current >= q.required);
        if (completedQuestIndex !== -1) {
            const q = p.quests.splice(completedQuestIndex, 1)[0];
            sendTo(ws, `\n{bold}{G}COMPLETED QUEST: ${q.name}!{x}`);
            
            // Rewards
            if (q.reward) {
                if (q.reward.xp) {
                    p.exp += q.reward.xp;
                    sendTo(ws, `You gain ${q.reward.xp} EXP.`);
                }
                if (q.reward.gold) {
                    p.gold += q.reward.gold;
                    sendTo(ws, `You gain {Y}${q.reward.gold} gold{x}.`);
                }
                if (q.reward.items) {
                    q.reward.items.forEach(itemId => {
                        p.inventory.push(itemId);
                        sendTo(ws, `You receive: ${itemTemplates[itemId] ? itemTemplates[itemId].name : itemId}`);
                    });
                }
            }
            sendTo(ws, `{C}${target.name} says: "Excellent work! Here is your reward."{x}\n`);
            return;
        }
        
        // Check for fetch quest progress during talk
        p.quests.forEach(q => {
            if (q.type === 'fetch' && q.giverId === target.id) {
                const count = p.inventory.filter(id => id === q.targetId).length;
                if (count > q.current) {
                    q.current = count;
                    if (q.current >= q.required) {
                        sendTo(ws, `{G}Quest progress updated: ${q.name} (${q.current}/${q.required}) - Ready to complete!{x}`);
                    } else {
                        sendTo(ws, `{G}Quest progress updated: ${q.name} (${q.current}/${q.required}){x}`);
                    }
                }
            }
        });
    }

    // Give Quest if NPC has one
    if (target.givesQuest && questTemplates[target.givesQuest]) {
        const alreadyHas = p.quests.some(q => q.id === target.givesQuest);
        if (!alreadyHas) {
            const template = questTemplates[target.givesQuest];
            const newQuest = {
                ...template,
                giverId: target.id,
                current: 0
            };
            // Initial check for fetch quest if they already have the item
            if (newQuest.type === 'fetch') {
                newQuest.current = p.inventory.filter(id => id === newQuest.targetId).length;
            }

            p.quests.push(newQuest);
            sendTo(ws, `\n{bold}{C}NEW QUEST: ${newQuest.name}{x}\n${newQuest.desc}\n`);
            sendTo(ws, `{C}${target.name} says: "I have a task for you. ${newQuest.desc}"{x}\n`);
            return;
        }
    }

    let dialogue = "";
    if (target.dialogue && target.dialogue.length > 0) {
        dialogue = target.dialogue[Math.floor(Math.random() * target.dialogue.length)];
    } else if (target.shop) {
        dialogue = "Welcome to my shop! Use 'list' to see my wares, 'buy <item>' to purchase, and 'sell <item>' to trade.";
    } else if (target.isTrainer) {
        dialogue = "I can help you improve your skills. Use 'train list' to see what I can teach you, or 'train <ability>' to learn.";
    } else {
        dialogue = "Hello there, developer. Ready to push some code?";
    }

    // NPC "says" it to the room
    const msg = `\n{C}${target.name} says: "${dialogue}"{x}\n`;
    Array.from(players.values()).forEach(player => {
        if (player.roomId === p.roomId) {
            sendTo(player.ws, msg);
        }
    });
}

function handleEmote(ws, emote, targetName, players) {
    const p = players.get(ws);
    const emotes = {
        laugh: "laughs", dance: "dances", cry: "cries", smile: "smiles", wave: "waves"
    };
    const verb = emotes[emote];
    if (!verb) return;

    if (targetName) {
        const target = Array.from(players.values()).find(other => other.roomId === p.roomId && other.username.toLowerCase() === targetName.toLowerCase());
        if (target) {
            sendTo(ws, `You ${emote} at ${target.username}.`);
            sendTo(target.ws, `${p.username} ${verb} at you.`);
            Array.from(players.values()).forEach(other => {
                if (other.roomId === p.roomId && other !== p && other !== target) {
                    sendTo(other.ws, `${p.username} ${verb} at ${target.username}.`);
                }
            });
            return;
        }
    }
    
    sendTo(ws, `You ${emote}.`);
    Array.from(players.values()).forEach(other => {
        if (other.roomId === p.roomId && other !== p) {
            sendTo(other.ws, `${p.username} ${verb}.`);
        }
    });
}

function handleUse(ws, itemName, players, itemTemplates) {
    const p = players.get(ws);
    const itemIndex = p.inventory.findIndex(id => {
        const item = itemTemplates[id];
        return item && item.keywords && item.keywords.some(k => k.includes(itemName.toLowerCase()));
    });
    if (itemIndex === -1) { sendTo(ws, "You aren't carrying that."); return; }
    
    const itemId = p.inventory[itemIndex];
    const item = itemTemplates[itemId];
    if (!item) { sendTo(ws, "That item seems to be corrupted."); return; }
    
    if (item.type === 'consumable') {
        let msg = `You use ${item.name}. `;
        if (item.heal) {
            const healVal = Math.floor(Math.random() * (item.heal[1] - item.heal[0] + 1)) + item.heal[0];
            p.hp = Math.min(p.maxHp, p.hp + healVal);
            msg += `{G}You regain ${healVal} HP.{x} `;
        }
        
        if (item.effect === 'heal') {
            p.hp = Math.min(p.maxHp, p.hp + item.value);
            p.inventory.splice(itemIndex, 1);
            sendTo(ws, `You use ${item.name}. {G}You feel revitalized!{x} HP: ${p.hp}/${p.maxHp}`);
        } else if (item.effect === 'food') {
            p.hunger = Math.min(100, p.hunger + item.value);
            p.inventory.splice(itemIndex, 1);
            sendTo(ws, msg + `{Y}Your hunger is satisfied.{x} Hunger: ${p.hunger}/100`);
        } else if (item.effect === 'drink') {
            p.thirst = Math.min(100, p.thirst + item.value);
            p.inventory.splice(itemIndex, 1);
            sendTo(ws, msg + `{C}Your thirst is quenched.{x} Thirst: ${p.thirst}/100`);
        } else {
            sendTo(ws, "This item has no effect.");
        }
    } else {
        sendTo(ws, "You can't use that.");
    }
}

function handleEat(ws, itemName, players, itemTemplates) {
    handleUse(ws, itemName, players, itemTemplates);
}

function handleDrink(ws, itemName, players, itemTemplates) {
    handleUse(ws, itemName, players, itemTemplates);
}

function handleQuit(ws) {
    sendTo(ws, "Saving your progress and disconnecting...");
    ws.close();
}

function handleGossip(ws, msg, players) {
    const p = players.get(ws);
    if (!msg) {
        sendTo(ws, "What do you want to gossip?");
        return;
    }
    const gossipMsg = `\n{bold}{Y}[GOSSIP] ${p.username}: ${msg}{x}\n`;
    players.forEach(target => {
        sendTo(target.ws, gossipMsg);
    });
}

function handleWho(ws, players) {
    let output = `\n{bold}Developers currently online:{x}\n`;
    players.forEach(p => {
        output += ` - ${p.username} (${p.class.toUpperCase()}, Level ${p.level})\n`;
    });
    sendTo(ws, output);
}

function handleTell(ws, targetName, msg, players) {
    const p = players.get(ws);
    if (!targetName || !msg) {
        sendTo(ws, "Usage: tell <player> <message>");
        return;
    }
    const target = Array.from(players.values()).find(other => other.username.toLowerCase() === targetName.toLowerCase());
    if (!target) {
        sendTo(ws, "Player not found.");
        return;
    }
    sendTo(ws, `{M}You tell ${target.username}: ${msg}{x}`);
    sendTo(target.ws, `{M}${p.username} tells you: ${msg}{x}`);
}

module.exports = { 
    sendTo, handleLook, handleMove, handleSay, handleInventory, 
    handleGet, handleDrop, handleWear, handleRemove, 
    handleLoot, handleScore, handleEquipment,
    handleList, handleBuy, handleSell, handleTrain, handleAbility,
    handleEmote, handleUse, handleFlee, handleTalk, handleEat, handleDrink, handleQuit,
    handleGossip, handleQuests, handleParty, sendPrompt, handleSkills,
    handleRest, handleSleep, handleStand, handleWho, handleTell
};

module.exports = {
    PORT: process.env.PORT || 3000,
    MOTD: "{bold}{C}--- WELCOME TO MUDLET: WHERE DEVELOPERS DWELL ---{x}\n{Y}Version 1.0.0{x}\n{G}Remember to 'look' around and 'talk' to NPCs for quests!{x}",
    STARTING_ROOM: 'entry',
    ADMINS: process.env.ADMIN_LIST ? process.env.ADMIN_LIST.split(',') : [],
    
    // --- TIMING ---
    COMBAT_TICK_RATE: 2000,
    REGEN_TICK_RATE: 5000,
    RESPAWN_CHECK_RATE: 10000,
    MOB_RESPAWN_DELAY: 30000,

    // --- PROGRESSION ---
    LEVEL_XP_BASE: 1000,
    MOB_EXP_MULTIPLIER: 50,
    MOB_GOLD_MULTIPLIER: 5,
    ITEM_BUY_PRICE: 100,

    // --- EQUIPMENT SLOTS ---
    SLOTS: ["head", "body", "arms", "legs", "feet", "hands", "main_hand", "off_hand"],

    // --- CLASSES & STATS ---
    CLASSES: {
        coder: { 
            name: "Coder", primary: "intellect", intellect: 18, speed: 12, creativity: 14, endurance: 10, hp: 10, mp: 20,
            abilities: [
                { id: 'refactor', name: 'Refactor', level: 1, cost: 0, tp: 0, mp: 5, type: 'heal', value: 5, desc: 'Optimize your health.' },
                { id: 'debug', name: 'Debug', level: 2, cost: 100, tp: 1, mp: 8, type: 'damage', value: 8, desc: 'Remove a bug with logic.' },
                { id: 'lint', name: 'Lint', level: 2, cost: 100, tp: 1, mp: 8, type: 'damage', value: 6, desc: 'Clean up the opponent.' },
                { id: 'compile', name: 'Compile', level: 5, cost: 300, tp: 1, mp: 15, type: 'damage', value: 15, desc: 'Execute a powerful logic burst.' },
                { id: 'script', name: 'Script', level: 5, cost: 300, tp: 1, mp: 12, type: 'damage', value: 12, desc: 'Automate some damage.' },
                { id: 'patch', name: 'Patch', level: 5, cost: 300, tp: 1, mp: 15, type: 'heal', value: 10, desc: 'A quick fix for your HP.' },
                { id: 'logic_bomb', name: 'Logic Bomb', level: 10, cost: 1000, tp: 1, mp: 25, type: 'damage', value: 35, desc: 'A devastating logical error.' },
                { id: 'recursion', name: 'Recursion', level: 10, cost: 1000, tp: 1, mp: 20, type: 'damage', value: 25, desc: 'Damage that repeats.' },
                { id: 'deploy', name: 'Deploy', level: 10, cost: 1000, tp: 1, mp: 25, type: 'heal', value: 30, desc: 'Push to production (full recovery).' },
                { id: 'unit_test', name: 'Unit Test', level: 10, cost: 1000, tp: 1, mp: 15, type: 'damage', value: 20, desc: 'Check for vulnerabilities.' },
                { id: 'overclock', name: 'Overclock', level: 10, cost: 1000, tp: 1, mp: 30, type: 'damage', value: 40, desc: 'Max out your CPU for damage.' }
            ]
        },
        artist: { 
            name: "Artist", primary: "creativity", intellect: 14, speed: 10, creativity: 18, endurance: 12, hp: 12, mp: 15,
            abilities: [
                { id: 'sketch', name: 'Sketch', level: 1, cost: 0, tp: 0, mp: 5, type: 'damage', value: 7, desc: 'Draw a quick attack.' },
                { id: 'palette', name: 'Palette', level: 2, cost: 100, tp: 1, mp: 8, type: 'heal', value: 8, desc: 'Add some color to your life.' },
                { id: 'shade', name: 'Shade', level: 2, cost: 100, tp: 1, mp: 8, type: 'damage', value: 10, desc: 'Darken the mood.' },
                { id: 'render', name: 'Render', level: 5, cost: 300, tp: 1, mp: 15, type: 'damage', value: 18, desc: 'Process a heavy attack.' },
                { id: 'hue', name: 'Hue', level: 5, cost: 300, tp: 1, mp: 12, type: 'heal', value: 12, desc: 'Adjust your vibrance.' },
                { id: 'brushstroke', name: 'Brushstroke', level: 5, cost: 300, tp: 1, mp: 10, type: 'damage', value: 15, desc: 'A bold, physical strike.' },
                { id: 'masterpiece', name: 'Masterpiece', level: 10, cost: 1000, tp: 1, mp: 30, type: 'damage', value: 45, desc: 'Your finest work yet.' },
                { id: 'perspective', name: 'Perspective', level: 10, cost: 1000, tp: 1, mp: 20, type: 'damage', value: 28, desc: 'Change the way they see pain.' },
                { id: 'canvas', name: 'Canvas', level: 10, cost: 1000, tp: 1, mp: 25, type: 'heal', value: 25, desc: 'A fresh start on a clean slate.' },
                { id: 'animation', name: 'Animation', level: 10, cost: 1000, tp: 1, mp: 25, type: 'damage', value: 32, desc: 'Bring your attacks to life.' },
                { id: 'texture', name: 'Texture', level: 10, cost: 1000, tp: 1, mp: 18, type: 'damage', value: 22, desc: 'Add some rough edges.' }
            ]
        },
        musician: { 
            name: "Musician", primary: "speed", intellect: 12, speed: 18, creativity: 14, endurance: 12, hp: 11, mp: 18,
            abilities: [
                { id: 'tempo', name: 'Tempo', level: 1, cost: 0, tp: 0, mp: 5, type: 'damage', value: 6, desc: 'Keep the beat with an attack.' },
                { id: 'note', name: 'Note', level: 2, cost: 100, tp: 1, mp: 6, type: 'damage', value: 9, desc: 'A sharp, stinging sound.' },
                { id: 'chord', name: 'Chord', level: 2, cost: 100, tp: 1, mp: 10, type: 'damage', value: 11, desc: 'Harmonized damage.' },
                { id: 'rhythm', name: 'Rhythm', level: 5, cost: 300, tp: 1, mp: 12, type: 'heal', value: 10, desc: 'Find your flow and recover.' },
                { id: 'melody', name: 'Melody', level: 5, cost: 300, tp: 1, mp: 15, type: 'damage', value: 20, desc: 'A beautiful, painful song.' },
                { id: 'crescendo', name: 'Crescendo', level: 5, cost: 300, tp: 1, mp: 18, type: 'damage', value: 22, desc: 'The volume peaks!' },
                { id: 'symphony', name: 'Symphony', level: 10, cost: 1000, tp: 1, mp: 30, type: 'damage', value: 45, desc: 'An orchestral assault.' },
                { id: 'encore', name: 'Encore', level: 10, cost: 1000, tp: 1, mp: 20, type: 'heal', value: 20, desc: 'One more time!' },
                { id: 'harmony', name: 'Harmony', level: 10, cost: 1000, tp: 1, mp: 25, type: 'damage', value: 30, desc: 'Balance the scales of combat.' },
                { id: 'solo', name: 'Solo', level: 10, cost: 1000, tp: 1, mp: 25, type: 'damage', value: 35, desc: 'Take center stage.' },
                { id: 'resonance', name: 'Resonance', level: 10, cost: 1000, tp: 1, mp: 15, type: 'damage', value: 20, desc: 'Vibrate the surroundings.' }
            ]
        },
        designer: { 
            name: "Designer", primary: "endurance", intellect: 14, speed: 12, creativity: 14, endurance: 18, hp: 15, mp: 10,
            abilities: [
                { id: 'blueprints', name: 'Blueprints', level: 1, cost: 0, tp: 0, mp: 5, type: 'damage', value: 5, desc: 'Map out the attack.' },
                { id: 'wireframe', name: 'Wireframe', level: 2, cost: 100, tp: 1, mp: 8, type: 'damage', value: 9, desc: 'A skeletal strike.' },
                { id: 'prototype', name: 'Prototype', level: 2, cost: 100, tp: 1, mp: 10, type: 'heal', value: 10, desc: 'Test a new recovery method.' },
                { id: 'layout', name: 'Layout', level: 5, cost: 300, tp: 1, mp: 12, type: 'damage', value: 15, desc: 'Organize the destruction.' },
                { id: 'ux_design', name: 'UX Design', level: 5, cost: 300, tp: 1, mp: 15, type: 'heal', value: 20, desc: 'Improve your own experience.' },
                { id: 'flow', name: 'Flow', level: 5, cost: 300, tp: 1, mp: 18, type: 'damage', value: 20, desc: 'A smooth transition to pain.' },
                { id: 'final_version', name: 'Final Version', level: 10, cost: 1000, tp: 1, mp: 25, type: 'damage', value: 40, desc: 'The definitive end.' },
                { id: 'redesign', name: 'Redesign', level: 10, cost: 1000, tp: 1, mp: 20, type: 'heal', value: 35, desc: 'Rebuild yourself better.' },
                { id: 'accessibility', name: 'Accessibility', level: 10, cost: 1000, tp: 1, mp: 20, type: 'damage', value: 25, desc: 'Open up their defenses.' },
                { id: 'branding', name: 'Branding', level: 10, cost: 1000, tp: 1, mp: 25, type: 'damage', value: 32, desc: 'Leave your mark.' },
                { id: 'typography', name: 'Typography', level: 10, cost: 1000, tp: 1, mp: 15, type: 'damage', value: 18, desc: 'Strike with the font of truth.' }
            ]
        }
    }
};

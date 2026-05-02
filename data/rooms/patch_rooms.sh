{"id": "breakroom", "name": "Break Room", "description": "A haven of coffee and snacks.", "exits": {"west": "coding_lab", "north": "server_room"}}
{"id": "coding_lab", "name": "Coding Lab", "description": "Row upon row of glowing screens.", "exits": {"south": "workshop", "east": "breakroom", "north": "breakroom"}}
{"id": "entry", "name": "Developer's Lounge", "description": "A quiet space filled with humming servers and overflowing coffee mugs.", "exits": {"north": "workshop"}, "mobs": ["npc_dev", "npc_designer"]}
{"id": "library", "name": "Documentation Library", "description": "Dusty books and manuals.", "exits": {"west": "meeting_room", "south": "testing_lab", "north": "meeting_room"}}
{"id": "meeting_room", "name": "Meeting Room", "description": "A long table surrounded by empty chairs.", "exits": {"south": "office", "east": "library", "west": "library"}}
{"id": "office", "name": "Management Office", "description": "Surprisingly clean and quiet.", "exits": {"west": "server_room", "north": "meeting_room", "south": "meeting_room"}}
{"id": "server_room", "name": "Server Room", "description": "Loud fans and blinking lights.", "exits": {"south": "breakroom", "east": "office", "north": "breakroom"}}
{"id": "testing_lab", "name": "Testing Lab", "description": "Chaotic, things are constantly breaking.", "exits": {"north": "library", "south": "library"}}
{"id": "workshop", "name": "The Workshop", "description": "Tools are scattered everywhere.", "exits": {"south": "entry", "north": "coding_lab"}, "items": ["keyboard"], "mobs": ["bug"]}
EOF

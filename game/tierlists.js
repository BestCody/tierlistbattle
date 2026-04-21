const TIERLISTS = [
  {
    id: 1,
    title: 'Mario Kart Tracks',
    items: ['Rainbow Road', 'Baby Park', "Bowser's Castle", 'Mushroom Gorge', 'Koopa Cape', 'DK Summit', "Wario's Gold Mine", 'Moonview Highway'],
  },
  {
    id: 2,
    title: 'Video Game Weapons',
    items: ['Shotgun', 'Sniper Rifle', 'Katana', 'Rocket Launcher', 'Flamethrower', 'Crossbow', 'Plasma Cannon', 'Boomerang'],
  },
  {
    id: 3,
    title: 'RPG Classes',
    items: ['Warrior', 'Mage', 'Rogue', 'Paladin', 'Druid', 'Necromancer', 'Ranger', 'Bard'],
  },
  {
    id: 4,
    title: 'Gaming Snacks',
    items: ['Doritos', 'Pizza Rolls', 'Gummy Bears', 'Mountain Dew', 'Cheetos', 'Red Bull', 'Takis', 'Oreos'],
  },
  {
    id: 5,
    title: 'Video Game Villains',
    items: ['Bowser', 'Ganondorf', 'Sephiroth', 'GLaDOS', 'Dr. Eggman', 'Vaas Montenegro', 'Handsome Jack', 'SHODAN'],
  },
  {
    id: 6,
    title: 'Game Controllers',
    items: ['PS5 DualSense', 'Xbox Series X', 'Switch Pro', 'Steam Deck', 'GameCube', 'DualShock 4', 'N64 Controller', 'Joy-Cons'],
  },
  {
    id: 7,
    title: 'Gaming Genres',
    items: ['Battle Royale', 'MMORPG', 'Roguelike', 'Visual Novel', 'RTS', 'Fighting Game', 'Metroidvania', 'Soulslike'],
  },
  {
    id: 8,
    title: 'Video Game Soundtracks',
    items: ['Doom Eternal', 'Undertale', 'The Last of Us', 'Halo', 'Final Fantasy VII', 'Minecraft', 'Hollow Knight', 'Celeste'],
  },
  {
    id: 9,
    title: 'Video Game Power-ups',
    items: ['Star (Mario)', 'Gravity Gun', 'Super Mushroom', 'Shield Potion', 'Invincibility', 'Speed Boost', 'Double Jump', 'Time Stop'],
  },
  {
    id: 10,
    title: 'Gaming Peripherals',
    items: ['Mechanical Keyboard', 'Gaming Mouse', '4K Monitor', 'Headset', 'Stream Deck', 'Gaming Chair', 'Capture Card', 'Controller'],
  },
];

function getRandomTierlists(count = 5) {
  const shuffled = [...TIERLISTS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

module.exports = { TIERLISTS, getRandomTierlists };

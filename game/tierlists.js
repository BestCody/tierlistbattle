const db = require('../database');

const BUILTIN_TIERLISTS = [
  { _id: 'b1', title: 'Mario Kart Tracks',    items: ['Rainbow Road','Baby Park',"Bowser's Castle",'Mushroom Gorge','Koopa Cape','DK Summit',"Wario's Gold Mine",'Moonview Highway'] },
  { _id: 'b2', title: 'Video Game Weapons',   items: ['Shotgun','Sniper Rifle','Katana','Rocket Launcher','Flamethrower','Crossbow','Plasma Cannon','Boomerang'] },
  { _id: 'b3', title: 'RPG Classes',          items: ['Warrior','Mage','Rogue','Paladin','Druid','Necromancer','Ranger','Bard'] },
  { _id: 'b4', title: 'Gaming Snacks',        items: ['Doritos','Pizza Rolls','Gummy Bears','Mountain Dew','Cheetos','Red Bull','Takis','Oreos'] },
  { _id: 'b5', title: 'Video Game Villains',  items: ['Bowser','Ganondorf','Sephiroth','GLaDOS','Dr. Eggman','Vaas Montenegro','Handsome Jack','SHODAN'] },
  { _id: 'b6', title: 'Game Controllers',     items: ['PS5 DualSense','Xbox Series X','Switch Pro','Steam Deck','GameCube','DualShock 4','N64 Controller','Joy-Cons'] },
  { _id: 'b7', title: 'Gaming Genres',        items: ['Battle Royale','MMORPG','Roguelike','Visual Novel','RTS','Fighting Game','Metroidvania','Soulslike'] },
  { _id: 'b8', title: 'Video Game Soundtracks', items: ['Doom Eternal','Undertale','The Last of Us','Halo','Final Fantasy VII','Minecraft','Hollow Knight','Celeste'] },
  { _id: 'b9', title: 'Video Game Power-ups', items: ['Star (Mario)','Gravity Gun','Super Mushroom','Shield Potion','Invincibility','Speed Boost','Double Jump','Time Stop'] },
  { _id:'b10', title: 'Gaming Peripherals',   items: ['Mechanical Keyboard','Gaming Mouse','4K Monitor','Headset','Stream Deck','Gaming Chair','Capture Card','Controller'] },
  { _id:'b11', title: 'Open World Games',     items: ['GTA V','Elden Ring','Breath of the Wild','Red Dead 2','Skyrim',"Assassin's Creed Odyssey",'Cyberpunk 2077','Minecraft'] },
  { _id:'b12', title: 'FPS Games',            items: ['CS2','Valorant','Call of Duty','Apex Legends','Overwatch 2','Halo Infinite','Titanfall 2','Rainbow Six Siege'] },
  { _id:'b13', title: 'Game Bosses',          items: ['Malenia','Margit','Ornstein & Smough','Isshin','Radahn','Midir','Friede','Gael'] },
  { _id:'b14', title: 'Video Game Foods',     items: ['Meat (Minecraft)','Estus Flask','Red Potion','Mushroom','Steak','Health Pack','Ramen (Ghost of Tsushima)','Dubious Food'] },
  { _id:'b15', title: 'Starter Pokémon',      items: ['Bulbasaur','Charmander','Squirtle','Cyndaquil','Totodile','Chikorita','Mudkip','Torchic'] },
];

async function getAllTierlists() {
  try {
    const custom = await db.getAllCustomTierlists();
    return [...BUILTIN_TIERLISTS, ...custom];
  } catch {
    return [...BUILTIN_TIERLISTS];
  }
}

function getBuiltinTierlists() { return BUILTIN_TIERLISTS; }

module.exports = { getAllTierlists, getBuiltinTierlists, BUILTIN_TIERLISTS };

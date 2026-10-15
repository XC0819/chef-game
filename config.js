// 数据驱动配置：换美术 / 调玩法只改这里，不用动规则代码
export const CONFIG = {
  itemSize: 1.1,        // 食材精灵的基准大小（世界单位），实际贴图 = itemSize * spriteScale
  spriteScale: 1.15,    // 贴图相对 itemSize 的放大倍数
  // 碰撞体：全部用球形（2D 精灵没有朝向），colliderScale 为碰撞半径相对 itemSize/2 的缩放
  defaultCollider: 'sphere',
  colliderScale: 1.0,
  // 其它美术资源路径（换图只改这里）
  art: {
    bg: 'art/ui/bg_kitchen.jpg', pot: 'art/ui/pot.png', tray: 'art/ui/tray.png', orderCard: 'art/ui/ordercard.png',
    coin: 'art/ui/coin.png', ice: 'art/ui/ice.png', iceCracked: 'art/ui/ice_cracked.png',
    boom: 'art/fx/boom.png', pop: 'art/fx/pop.png', steam: 'art/fx/steam.png',
    chef: { '': 'art/chef/idle.png', happy: 'art/chef/happy.png', cheer: 'art/chef/cheer.png', worried: 'art/chef/worried.png', sad: 'art/chef/sad.png', holding: 'art/chef/holding.png' },
  },
  // 顾客头像：每张订单随机挑一个
  customers: ['cat', 'bunny', 'panda', 'duck', 'bear', 'fox'].map(id => `art/customers/${id}.png`),
  traySlots: 7,
  matchCount: 3,
  // 食材（2D 贴图，art/ingredients/<id>.png）。special: 'chili' = 消除时爆炸把周围食材炸开
  items: [
    { id: 'tomato',   name: '番茄', image: 'art/ingredients/tomato.png' },
    { id: 'egg',      name: '鸡蛋', image: 'art/ingredients/egg.png' },
    { id: 'onion',    name: '洋葱', image: 'art/ingredients/onion.png' },
    { id: 'mushroom', name: '蘑菇', image: 'art/ingredients/mushroom.png' },
    { id: 'meat',     name: '肉', image: 'art/ingredients/meat.png' },
    { id: 'eggplant', name: '茄子', image: 'art/ingredients/eggplant.png' },
    { id: 'fish',     name: '鱼', image: 'art/ingredients/fish.png' },
    { id: 'cabbage',  name: '白菜', image: 'art/ingredients/cabbage.png' },
    { id: 'broccoli', name: '西兰花', image: 'art/ingredients/broccoli.png' },
    { id: 'corn',     name: '玉米', image: 'art/ingredients/corn.png' },
    { id: 'cheese',   name: '奶酪', image: 'art/ingredients/cheese.png' },
    { id: 'pepper',   name: '青椒', image: 'art/ingredients/pepper.png' },
    { id: 'carrot',   name: '胡萝卜', image: 'art/ingredients/carrot.png' },
    { id: 'riceball', name: '饭团', image: 'art/ingredients/riceball.png' },
    { id: 'chili',    name: '辣椒', image: 'art/ingredients/chili.png', special: 'chili' },
  ],
  chili: { radius: 2.6, power: 11 },        // 辣椒爆炸范围 / 力度
  ice: { taps: 2 },                          // 冰块需要点几下才融化
  // 菜品订单：needs 里每个数字 = 需要消除几组（每组 3 个）该食材；image = 菜品图标（文件不存在时自动退回 emoji icon）
  dishes: [
    { id: 'tomato_egg',    name: '番茄炒蛋', icon: '🍳', image: 'art/dishes/tomato_egg.png', needs: { tomato: 1, egg: 1 }, coins: 20 },
    { id: 'onion_egg',     name: '洋葱煎蛋', icon: '🥚', image: 'art/dishes/onion_egg.png', needs: { onion: 1, egg: 1 }, coins: 20 },
    { id: 'mushroom_meat', name: '蘑菇炒肉', icon: '🍄', image: 'art/dishes/mushroom_meat.png', needs: { mushroom: 1, meat: 1 }, coins: 25 },
    { id: 'pepper_meat',   name: '青椒肉丝', icon: '🫑', image: 'art/dishes/pepper_meat.png', needs: { pepper: 1, meat: 1 }, coins: 25 },
    { id: 'eggplant',      name: '鱼香茄子', icon: '🍆', image: 'art/dishes/eggplant.png', needs: { eggplant: 1, meat: 1 }, coins: 25 },
    { id: 'salad',         name: '田园沙拉', icon: '🥗', image: 'art/dishes/salad.png', needs: { cabbage: 1, tomato: 1, broccoli: 1 }, coins: 35 },
    { id: 'steam_fish',    name: '清蒸鱼',   icon: '🐟', image: 'art/dishes/steam_fish.png', needs: { fish: 1, onion: 1 }, coins: 30 },
    { id: 'cheese_corn',   name: '芝士玉米', icon: '🌽', image: 'art/dishes/cheese_corn.png', needs: { corn: 1, cheese: 1 }, coins: 30 },
    { id: 'bento',         name: '饭团便当', icon: '🍙', image: 'art/dishes/bento.png', needs: { riceball: 1, fish: 1, carrot: 1 }, coins: 40 },
  ],
  // 关卡：dishes 订单池；goal 需完成订单数；maxOrders 同时显示的订单数；
  // fillers 额外干扰食材组数；minPot 锅里少于这个数就补一组干扰食材；
  // chili 辣椒组数；ice 被冰住的比例；potRadius 锅半径（锅贴图会自动按它缩放对齐）/ potDepth 防卡锅沿的高度阈值
  levels: [
    { name: '新手教学', dishes: ['tomato_egg'], goal: 2, maxOrders: 1, fillers: 1, minPot: 6, chili: 0, ice: 0, potRadius: 3.2, potDepth: 1.3 },
    { name: '辣椒登场', dishes: ['tomato_egg', 'onion_egg', 'mushroom_meat'], goal: 3, maxOrders: 2, fillers: 3, minPot: 12, chili: 1, ice: 0, potRadius: 2.7, potDepth: 1.8 },
    { name: '冰冻食材', dishes: ['tomato_egg', 'mushroom_meat', 'pepper_meat', 'steam_fish'], goal: 4, maxOrders: 2, fillers: 4, minPot: 15, chili: 1, ice: 0.15, potRadius: 2.9, potDepth: 2.0 },
    { name: '忙碌午餐', dishes: ['pepper_meat', 'eggplant', 'salad', 'steam_fish', 'cheese_corn'], goal: 5, maxOrders: 3, fillers: 6, minPot: 21, chili: 2, ice: 0.25, potRadius: 3.1, potDepth: 2.2 },
    { name: '满座晚市', dishes: ['salad', 'steam_fish', 'cheese_corn', 'bento', 'eggplant', 'onion_egg'], goal: 6, maxOrders: 3, fillers: 8, minPot: 27, chili: 2, ice: 0.3, potRadius: 3.3, potDepth: 2.4 },
  ],
};

const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const mcData = require('minecraft-data')

const bot = mineflayer.createBot({
    host: 'localhost',
    port: 25565,
    username: 'lumberjack'
})

bot.loadPlugin(pathfinder)

bot.on('spawn', () => {
    const data = mcData(bot.version)
    const movements = new Movements(bot, data)
    bot.pathfinder.setMovements(movements)
    
    console.log("Bot ready to chop wood.");
    chopWood(data);
});

async function chopWood(data) {
    // 1. Define log types to look for
    const logIds = [
        data.blocksByName.oak_log.id,
        data.blocksByName.birch_log.id,
        data.blocksByName.spruce_log.id
    ];

    // 2. Locate the nearest block
    const logBlock = bot.findBlock({
        matching: logIds,
        maxDistance: 32
    });

    if (!logBlock) {
        console.log("No wood found within 32 blocks. Retrying...");
        setTimeout(() => chopWood(data), 5000);
        return;
    }

    try {
        // 3. Navigate to the block
        const goal = new goals.GoalLookAtBlock(logBlock.position, bot.world);
        await bot.pathfinder.goto(new goals.GoalGetToBlock(logBlock.position.x, logBlock.position.y, logBlock.position.z));

        // 4. Mine the block
        if (bot.canDigBlock(logBlock)) {
            await bot.dig(logBlock);
            console.log(`Wood collected at: ${logBlock.position}`);
        }
        
        // 5. Recursive cycle
        chopWood(data);
    } catch (err) {
        console.log("Error during navigation/mining:", err.message);
        setTimeout(() => chopWood(data), 1000);
    }
}
